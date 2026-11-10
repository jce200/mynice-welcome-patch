"""Local Nice NHK client: one persistent session, bounded and serialized requests, pushed status.

Until 1.6.0 every request (each STATUS poll, each command) opened a TCP connection, did a legacy TLS handshake, VERIFY and CONNECT,
and closed it again: a new session on the module every 30 seconds (every 5 while the gate moved), seconds of delay before a command
reached the gate, and no way to hear the module say that the gate changed. Since 1.7.0 STATUS, INFO and CHANGE go over one session
that stays open, as the Nice apps do: the module pushes changes (Event CHANGE), a command is one small frame, and a session that
died is replaced. PAIR and the login check of the config flow still use a connection of their own.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import logging
import re
import secrets
import ssl
from datetime import datetime, timezone
from typing import Any
from xml.sax.saxutils import escape, quoteattr

import defusedxml.ElementTree as ET

from .const import decode_allowed_t4, known_t4_codes, t4_label
from collections.abc import Callable

from .transport import MAX_FRAME_BYTES, NHKConnection, NHKSession, ProtocolError, protocol_summary

_LOGGER = logging.getLogger(__name__)
_FRAME_START = b"\x02"
_FRAME_END = b"\x03"
REQUEST_TIMEOUT = 25
RESPONSE_TIMEOUT = 10     # one response on an open session
PREFLIGHT_TIMEOUT = 4     # the STATUS that proves an idle session is alive before a command is written to it
PREFLIGHT_IDLE = 8        # seconds without a frame from the module after which a command is preceded by that STATUS
SESSION_KINDS = frozenset({"STATUS", "INFO", "CHANGE"})


class NiceGateApiError(Exception):
    """Base error with a non-sensitive category."""
    def __init__(self, message: str, category: str = "protocol") -> None:
        super().__init__(message)
        self.category = category

class NiceGateApiAuthError(NiceGateApiError):
    def __init__(self, message: str) -> None:
        super().__init__(message, "authentication")

class NiceGateApiPairRefusedError(NiceGateApiError):
    """The module answered the pairing request with an error (wrong setup code, or the user name exists already)."""
    def __init__(self, code: int | None) -> None:
        super().__init__(f"Module refused the pairing (error code {code})", "pair_refused")
        self.code = code

class NiceGateApiConnectionError(NiceGateApiError):
    """Network or session failure."""

class NiceGateApiCommandRejectedError(NiceGateApiError):
    def __init__(self, code: int) -> None:
        super().__init__(f"Device rejected command with error code {code}", "command_rejected")
        self.code = code

class NiceGateApiCommandUncertainError(NiceGateApiError):
    def __init__(self) -> None:
        super().__init__("Command sent, but no confirmation received; do not automatically repeat it", "command_unconfirmed")


class NiceGateApi:
    def __init__(self, host: str, mac: str, username: str, password: str) -> None:
        self.host = host.strip()
        self.target = mac.upper()
        self.device_id = "1"
        self.username = username.strip()
        self.password = password
        self.source = f"python_{self.username}"
        self.description = "Home Assistant integration"
        self.client_challenge = secrets.token_hex(4).upper()
        self.server_challenge = ""
        self.command_sequence = 1
        self.command_id = 0
        self.session_id: int | str = 1
        self.gate_status: dict[str, Any] | None = None
        self.info_data: dict[str, Any] = {}
        self.raw_info_xml: str | None = None
        self.raw_status_xml: str | None = None
        self.last_change_xml: str | None = None
        self.status_property_names: list[str] = []
        self.status_properties: list[dict[str, Any]] = []
        self.last_request_type: str | None = None
        self.last_request_xml: str | None = None
        self.last_command_error: int | None = None
        self.last_command_code: str | None = None
        self.last_command_label: str | None = None
        self.last_command_frame_type: str | None = None
        self.last_command_supported: bool | None = None
        self.last_command_result: str | None = None
        self.last_command_time: str | None = None
        self.last_change_request_xml: str | None = None
        self._preferred_ssl_label: str | None = None
        self.tls_version: str | None = None
        self.last_response_ms: float | None = None
        self.last_error_category: str | None = None
        self.last_error_phase: str | None = None
        self.phase = "idle"
        self.request_count = 0
        self.ignored_frames = 0
        self._command_lock = asyncio.Lock()
        self._session: NHKSession | None = None
        self._ssl_contexts: list[tuple[str, ssl.SSLContext]] | None = None
        self._listener: Callable[[str, dict[str, Any] | None], None] | None = None
        self.sessions_opened = 0
        self.push_events = 0
        self.diagnostic_events = 0
        self.last_diagnostic_event: dict[str, str] | None = None
        self._tasks: set[asyncio.Task] = set()
        self._closed = False

    async def pair(self, setup_code: str) -> str:
        body = (f'<Authentication username={quoteattr(self.username)} cc={quoteattr(self.client_challenge)} '
                f'check={quoteattr(self._get_setup_code_check(setup_code))} CType="phone" '
                'OSType="Android" OSVer="6.0.1" desc="Home Assistant integration"/>')
        response = await self._request("PAIR", body)
        password = self._extract_authentication(response).get("pwd")
        if not password:
            raise NiceGateApiAuthError("Pairing did not return credentials")
        self.password = password
        return password

    async def verify_connect(self) -> str:
        return await self._request("LOGIN", "")

    async def async_get_status(self) -> dict[str, Any]:
        response = await self._request("STATUS", "")
        status = self._extract_status_data(response)
        if status is None:
            self.last_error_category = "invalid_status"
            raise NiceGateApiError("Device did not return a recognized gate status", "invalid_status")
        self.raw_status_xml = response
        self.gate_status = status
        return status

    async def async_get_info_data(self) -> dict[str, Any]:
        response = await self._request("INFO", "")
        info = self._extract_info_data(response)
        if not info or not info.get("info_service_names"):
            raise NiceGateApiError("Device did not return capabilities", "invalid_info")
        self.raw_info_xml = response
        self.info_data = info
        return info

    async def change(self, command: str) -> dict[str, Any] | None:
        if command not in {"open", "close", "stop"}:
            raise NiceGateApiError("Invalid gate action")
        if command in {s.strip() for s in (self.info_data.get("door_action_values") or "").split(",")}:
            return await self.send_command(command, frame_type="DoorAction")
        return await self.send_command({"open": "MDAz", "close": "MDA0", "stop": "MDAy"}[command], frame_type="T4Action")

    async def send_command(self, command: str, *, frame_type: str = "DoorAction") -> dict[str, Any] | None:
        if frame_type not in {"DoorAction", "T4Action"}:
            raise NiceGateApiError("Invalid command type")
        if frame_type == "DoorAction" and command not in {"open", "close", "stop"}:
            raise NiceGateApiError("Invalid gate action")
        if frame_type == "T4Action" and command not in known_t4_codes():
            raise NiceGateApiError("Invalid T4 action")
        body = (f'<Devices><Device id={quoteattr(self.device_id)}><Services>'
                f'<{frame_type}>{escape(command)}</{frame_type}>'
                '</Services></Device></Devices>')
        response = await self._request("CHANGE", body, command=(command, frame_type))
        return self._extract_status_data(response)

    def set_listener(self, listener: Callable[[str, dict[str, Any] | None], None] | None) -> None:
        """listener("status", status) for a pushed change, listener("diagnostic", details), listener("disconnected", None)."""
        self._listener = listener

    @property
    def session_open(self) -> bool:
        return self._session is not None and not self._session.closed

    def _notify(self, kind: str, payload: dict[str, Any] | None) -> None:
        if self._listener and not self._closed:
            self._listener(kind, payload)

    def _on_event(self, kind: str | None, message: str) -> None:
        if kind == "CHANGE":
            previous = self.gate_status or {}
            status = self._extract_status_data(message)
            if status is None:
                return
            if status.get("obstruct") is None:
                status["obstruct"] = previous.get("obstruct")
            self.gate_status = status
            self.push_events += 1
            self._notify("status", status)
        elif kind == "DIAGNOSTIC":
            # Why a manoeuvre ended, the photocells, the manoeuvre counter: the current Nice app reads these, numbers only.
            details: dict[str, str] = {}
            try:
                root = ET.fromstring(message)
                for node in root.findall(".//EventDetails/*"):
                    text = (node.text or "").strip()
                    if text and len(node) == 0 and re.fullmatch(r"[\w.:+-]{1,40}", text):
                        details[node.tag] = text
            except ET.ParseError:
                return
            self.diagnostic_events += 1
            self.last_diagnostic_event = details
            _LOGGER.debug("Nice diagnostic event: %s", details)
            self._notify("diagnostic", details)

    def _on_session_closed(self) -> None:
        self._session = None
        _LOGGER.debug("Nice session ended by the module or the network")
        self._notify("disconnected", None)

    async def _drop_session(self, *, dead: bool = False) -> None:
        session, self._session = self._session, None
        if session:
            self.ignored_frames += session.ignored_frames
            await session.close(dead=dead)

    async def _ensure_session(self) -> tuple[NHKSession, bool]:
        """The open session, or a new one (TLS, VERIFY, CONNECT). The flag says that it is new."""
        session = self._session
        if session is not None and not session.closed:
            return session, False
        await self._drop_session()
        conn = await self._open_connection()
        session = NHKSession(conn.reader, conn.writer, self._on_event, self._on_session_closed)
        try:
            self.phase = "verify"
            frame = self._build_message("VERIFY", f'<User username={quoteattr(self.username)}/>')
            response = await session.request(frame, "VERIFY", self.command_id, RESPONSE_TIMEOUT)
            self._find_session_id(response)
            perm = self._extract_authentication(response).get("perm")
            if perm == "wait":
                raise NiceGateApiAuthError("User is waiting for permission")
            if not perm:
                raise NiceGateApiAuthError("No user permission in response")
            self.phase = "login"
            frame = self._build_message("CONNECT", f'<Authentication username={quoteattr(self.username)} cc={quoteattr(self.client_challenge)}/>')
            response = await session.request(frame, "CONNECT", self.command_id, RESPONSE_TIMEOUT)
            self._find_session_id(response)
            self._find_server_challenge(response)
        except BaseException:
            await session.close()
            raise
        self._session = session
        self.sessions_opened += 1
        return session, True

    async def disconnect(self) -> None:
        self._closed = True
        await self._drop_session()
        tasks = list(self._tasks)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _request(self, kind: str, body: str, *, command: tuple[str, str] | None = None) -> str:
        if self._closed:
            raise NiceGateApiConnectionError("Client is closed", "closed")
        task = asyncio.create_task(self._operation(kind, body, command))
        self._tasks.add(task)
        try:
            return await task
        finally:
            self._tasks.discard(task)

    async def _operation(self, kind: str, body: str, command: tuple[str, str] | None) -> str:
        # The deadline includes queue time. Cancellation closes native async IO.
        started = False
        try:
            async with asyncio.timeout(REQUEST_TIMEOUT):
                async with self._command_lock:
                    started = True
                    if self._closed:
                        raise NiceGateApiConnectionError("Client is closed", "closed")
                    return await self._exchange(kind, body, command)
        except TimeoutError as err:
            if started:
                self.last_error_category = "timeout"
                if command and self.last_command_result == "unknown":
                    raise NiceGateApiCommandUncertainError() from err
            raise NiceGateApiConnectionError("Nice request timed out", "timeout") from err

    async def _exchange(self, kind: str, body: str, command: tuple[str, str] | None) -> str:
        if kind in SESSION_KINDS:
            return await self._exchange_session(kind, body, command)
        return await self._exchange_oneshot(kind, body, command)

    async def _exchange_session(self, kind: str, body: str, command: tuple[str, str] | None) -> str:
        """STATUS, INFO or CHANGE over the persistent session.

        A session that turns out to be dead is replaced once, but a command is never written twice: before a command goes to a
        session that has been silent for a while, a STATUS proves that the module still answers on it; if a command was written
        and no confirmation came, the result is "unknown" and nothing is repeated.
        """
        loop = asyncio.get_running_loop()
        command_sent = False
        start = loop.time()
        self.request_count += 1
        if command:
            code, frame_type = command
            self.last_command_code = code
            self.last_command_frame_type = frame_type
            self.last_command_label = t4_label(code) if frame_type == "T4Action" else code
            self.last_command_supported = frame_type == "DoorAction" or code in self.info_data.get("allowed_t4_codes", [])
            self.last_command_result = "connecting"
            self.last_command_error = None
            self.last_command_time = datetime.now(timezone.utc).isoformat()

        def mark_sent() -> None:
            nonlocal command_sent
            if command:
                # After any write attempt, execution may have happened.
                command_sent = True
                self.last_command_result = "sent"

        try:
            response = ""
            for attempt in (0, 1):
                self.phase = "tcp"
                session, fresh = await self._ensure_session()
                try:
                    if command and not fresh and loop.time() - session.last_rx > PREFLIGHT_IDLE:
                        self.phase = "preflight"
                        probe = self._build_message("STATUS", "")
                        await session.request(probe, "STATUS", self.command_id, PREFLIGHT_TIMEOUT)
                    self.phase = "response"
                    frame = self._build_message(kind, body)
                    self.last_request_type = kind
                    self.last_request_xml = frame[1:-1].decode()
                    if command:
                        self.last_change_request_xml = self.last_request_xml
                    response = await session.request(frame, kind, self.command_id, RESPONSE_TIMEOUT, mark_sent)
                except (ProtocolError, OSError, TimeoutError):
                    await self._drop_session(dead=True)
                    if command_sent or fresh or attempt:
                        raise
                    _LOGGER.debug("Nice session was stale (%s); opening a new one", self.phase)
                    continue
                if not command and not fresh and not attempt and self._extract_error_code(response) is not None:
                    # e.g. a session that the module no longer knows: one new session, then the answer counts
                    await self._drop_session()
                    continue
                break
            if command:
                self.last_change_xml = response
                code = self._extract_error_code(response)
                if code is not None:
                    self.last_command_error = code
                    self.last_command_result = "rejected"
                    raise NiceGateApiCommandRejectedError(code)
                if ET.fromstring(response).find(".//Error") is not None:
                    raise NiceGateApiError("Device returned an unrecognized error", "device_error")
                self.last_command_result = "confirmed"
            elif self._extract_error_code(response) is not None:
                raise NiceGateApiError("Device returned a protocol error", "device_error")
            self.last_error_category = None
            self.last_error_phase = None
            return response
        except asyncio.CancelledError:
            self.last_error_category = "cancelled_or_deadline"
            self.last_error_phase = self.phase
            if command:
                self.last_command_result = "unknown" if command_sent else "not_sent"
            # the deadline or an unload interrupted a request: the session may hold half an exchange, so it goes
            session, self._session = self._session, None
            if session:
                task = asyncio.ensure_future(session.close(dead=True))
                self._tasks.add(task)
                task.add_done_callback(self._tasks.discard)
            raise
        except NiceGateApiCommandRejectedError:
            self.last_error_category = "command_rejected"
            self.last_error_phase = self.phase
            raise
        except (NiceGateApiError, ProtocolError, OSError, TimeoutError) as err:
            self.last_error_phase = self.phase
            category = getattr(err, "category", None) or ("timeout" if isinstance(err, TimeoutError) else "protocol" if isinstance(err, ProtocolError) else "connection")
            self.last_error_category = category
            if command:
                self.last_command_result = "unknown" if command_sent else "not_sent"
                if command_sent:
                    raise NiceGateApiCommandUncertainError() from err
            if isinstance(err, NiceGateApiError):
                raise
            raise NiceGateApiConnectionError(f"Nice {self.phase} failed ({category})", category) from err
        finally:
            self.last_response_ms = round((loop.time() - start) * 1000, 1)
            self.phase = "idle"

    async def _exchange_oneshot(self, kind: str, body: str, command: tuple[str, str] | None) -> str:
        conn: NHKConnection | None = None
        command_sent = False
        start = asyncio.get_running_loop().time()
        self.request_count += 1
        if command:
            code, frame_type = command
            self.last_command_code = code
            self.last_command_frame_type = frame_type
            self.last_command_label = t4_label(code) if frame_type == "T4Action" else code
            self.last_command_supported = frame_type == "DoorAction" or code in self.info_data.get("allowed_t4_codes", [])
            self.last_command_result = "connecting"
            self.last_command_error = None
            self.last_command_time = datetime.now(timezone.utc).isoformat()
        try:
            conn = await self._open_connection()
            if kind != "PAIR":
                self.phase = "verify"
                response = await self._send_receive(conn, "VERIFY", f'<User username={quoteattr(self.username)}/>')
                self._find_session_id(response)
                perm = self._extract_authentication(response).get("perm")
                if perm == "wait":
                    if kind == "LOGIN":
                        return "wait"
                    raise NiceGateApiAuthError("User is waiting for permission")
                if not perm:
                    raise NiceGateApiAuthError("No user permission in response")
                self.phase = "login"
                response = await self._send_receive(conn, "CONNECT", f'<Authentication username={quoteattr(self.username)} cc={quoteattr(self.client_challenge)}/>')
                self._find_session_id(response)
                self._find_server_challenge(response)
                if kind == "LOGIN":
                    return "connect"
            self.phase = "response"
            frame = self._build_message(kind, body)
            self.last_request_type = kind
            self.last_request_xml = frame[1:-1].decode()
            if command:
                self.last_change_request_xml = self.last_request_xml
                # After any write attempt, execution may have happened.
                command_sent = True
                self.last_command_result = "sent"
            await conn.send(frame)
            response = await conn.response(kind, self.command_id)
            if command:
                self.last_change_xml = response
                code = self._extract_error_code(response)
                if code is not None:
                    self.last_command_error = code
                    self.last_command_result = "rejected"
                    raise NiceGateApiCommandRejectedError(code)
                if ET.fromstring(response).find(".//Error") is not None:
                    raise NiceGateApiError("Device returned an unrecognized error", "device_error")
                self.last_command_result = "confirmed"
            elif kind == "PAIR" and (self._extract_error_code(response) is not None or ET.fromstring(response).find(".//Error") is not None):
                raise NiceGateApiPairRefusedError(self._extract_error_code(response))
            elif self._extract_error_code(response) is not None:
                raise NiceGateApiError("Device returned a protocol error", "device_error")
            self.last_error_category = None
            self.last_error_phase = None
            return response
        except asyncio.CancelledError:
            self.last_error_category = "cancelled_or_deadline"
            self.last_error_phase = self.phase
            if command:
                self.last_command_result = "unknown" if command_sent else "not_sent"
            raise
        except NiceGateApiCommandRejectedError:
            self.last_error_category = "command_rejected"
            self.last_error_phase = self.phase
            raise
        except (NiceGateApiError, ProtocolError, OSError, TimeoutError) as err:
            self.last_error_phase = self.phase
            category = getattr(err, "category", None) or ("timeout" if isinstance(err, TimeoutError) else "protocol" if isinstance(err, ProtocolError) else "connection")
            self.last_error_category = category
            if command:
                self.last_command_result = "unknown" if command_sent else "not_sent"
                if command_sent:
                    raise NiceGateApiCommandUncertainError() from err
            if isinstance(err, NiceGateApiError):
                raise
            raise NiceGateApiConnectionError(f"Nice {self.phase} failed ({category})", category) from err
        finally:
            self.last_response_ms = round((asyncio.get_running_loop().time() - start) * 1000, 1)
            if conn:
                self.ignored_frames += conn.ignored_frames
                await conn.close()
            self.phase = "idle"

    async def _send_receive(self, conn: NHKConnection, kind: str, body: str) -> str:
        await conn.send(self._build_message(kind, body))
        return await conn.response(kind, self.command_id)

    async def _open_connection(self) -> NHKConnection:
        last_error: Exception | None = None
        for label, context in self._iter_ssl_contexts():
            writer = None
            try:
                self.phase = "tcp"
                async with asyncio.timeout(5):
                    reader, writer = await asyncio.open_connection(self.host, 443, limit=MAX_FRAME_BYTES)
                self.phase = "tls"
                async with asyncio.timeout(8):
                    await writer.start_tls(context, server_hostname=self.host, ssl_handshake_timeout=8)
                self._preferred_ssl_label = label
                ssl_object = writer.get_extra_info("ssl_object")
                self.tls_version = ssl_object.version() if ssl_object else None
                return NHKConnection(reader, writer)
            except asyncio.CancelledError:
                if writer:
                    await NHKConnection(reader, writer).close()
                raise
            except (OSError, TimeoutError) as err:
                last_error = err
                if writer:
                    await NHKConnection(reader, writer).close()
                if self.phase == "tcp":
                    # Changing TLS versions cannot fix a failed TCP connection.
                    raise
                _LOGGER.debug("Nice TLS profile %s failed (%s)", label, type(err).__name__)
        raise NiceGateApiConnectionError("No compatible TLS connection", "tls") from last_error

    def _iter_ssl_contexts(self) -> list[tuple[str, ssl.SSLContext]]:
        if self._ssl_contexts is None:   # built once: a context is not cheap, and a session needs one only when it is opened
            self._ssl_contexts = [
                ("legacy-tls12", self._build_ssl_context(maximum_version=ssl.TLSVersion.TLSv1_2)),
                ("legacy-default", self._build_ssl_context()),
                ("legacy-tlsv1-only", self._build_ssl_context(minimum_version=ssl.TLSVersion.TLSv1, maximum_version=ssl.TLSVersion.TLSv1)),
            ]
        contexts = list(self._ssl_contexts)
        if self._preferred_ssl_label:
            contexts.sort(key=lambda item: item[0] != self._preferred_ssl_label)
        return contexts

    def diagnostics(self) -> dict[str, Any]:
        return {
            "transport": "local_tls", "port": 443,
            "session_open": self.session_open, "sessions_opened": self.sessions_opened,
            "push_events": self.push_events, "diagnostic_events": self.diagnostic_events,
            "last_diagnostic_event": self.last_diagnostic_event,
            "request_timeout_seconds": REQUEST_TIMEOUT,
            "tls_profile": self._preferred_ssl_label, "tls_version": self.tls_version,
            "phase": self.phase, "last_error_category": self.last_error_category,
            "last_error_phase": self.last_error_phase, "last_response_ms": self.last_response_ms,
            "request_count": self.request_count, "ignored_frames": self.ignored_frames,
            "last_request": protocol_summary(self.last_request_xml),
            "last_status_response": protocol_summary(self.raw_status_xml),
            "last_command": {"action": self.last_command_label, "result": self.last_command_result,
                             "error_code": self.last_command_error, "time": self.last_command_time},
        }

    def _extract_authentication(self, message: str) -> dict[str, str]:
        try:
            xml = ET.fromstring(message)
        except ET.ParseError as err:
            raise NiceGateApiError("Invalid XML received from device") from err
        auth = xml.find(".//Authentication")
        if auth is None and xml.tag == "Authentication":
            auth = xml
        if auth is None:
            raise NiceGateApiAuthError("Authentication element missing in device response")
        return {key: value for key, value in auth.attrib.items()}

    def _find_session_id(self, message: str) -> None:
        session_id = self._extract_authentication(message).get("id")
        if session_id is not None:
            if not session_id.isdecimal():
                raise NiceGateApiAuthError("Invalid session identifier")
            self.session_id = session_id

    def _find_server_challenge(self, message: str) -> None:
        challenge = self._extract_authentication(message).get("sc")
        if not challenge or not re.fullmatch(r"(?:[0-9a-fA-F]{2})+", challenge):
            raise NiceGateApiAuthError("Server challenge missing in connect response")
        self.server_challenge = challenge

    def _collect_nodes(self, root: ET.Element, xpath: str) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for node in root.findall(xpath):
            items.append({"tag": node.tag, "text": (node.text or "").strip() or None, "attrib": dict(node.attrib)})
        return items

    def _extract_status_data(self, message: str) -> dict[str, Any] | None:
        try:
            root = ET.fromstring(message)
        except ET.ParseError:
            return None
        door_status = root.findtext("./Devices/Device/Properties/DoorStatus") or root.findtext(".//DoorStatus")
        if not door_status or door_status.strip().lower() not in {"open", "closed", "opening", "closing", "stopped"}:
            return None
        device = root.find(".//Device")
        if device is not None and device.attrib.get("id"):
            self.device_id = device.attrib["id"]
        source = root.attrib.get("source")
        if source:
            self.target = source
        obstruct_text = root.findtext("./Devices/Device/Properties/Obstruct") or root.findtext(".//Obstruct")
        device_last_event = root.findtext("./Devices/Device/Events/LastEvent") or root.findtext(".//Devices/Device/Events/LastEvent")
        interface_last_event = root.findtext("./Interface/Events/LastEvent") or root.findtext(".//Interface/Events/LastEvent")
        interface_date = root.findtext("./Interface/Date") or root.findtext(".//Date")
        obstruct = None
        if obstruct_text not in (None, ""):
            try:
                obstruct = int(obstruct_text)
            except ValueError:
                obstruct = None
        self.status_properties = self._collect_nodes(root, ".//Properties/*")
        self.status_property_names = [item["tag"] for item in self.status_properties]
        status: dict[str, Any] = {
            "door_status": door_status.strip().lower(),
            "obstruct": obstruct,
            "device_last_event": device_last_event,
            "interface_last_event": interface_last_event,
            "interface_date": interface_date,
            "target": self.target,
            "device_id": self.device_id,
        }
        return status

    def _extract_info_data(self, message: str) -> dict[str, Any]:
        try:
            root = ET.fromstring(message)
        except ET.ParseError:
            return {}
        info: dict[str, Any] = {}
        services = self._collect_nodes(root, ".//Services/*")
        properties = self._collect_nodes(root, ".//Properties/*")
        events = self._collect_nodes(root, ".//Events/*")
        source = root.attrib.get("source")
        if source:
            self.target = source
        device = root.find(".//Device")
        if device is not None and device.attrib.get("id"):
            self.device_id = device.attrib["id"]
        info["target"] = self.target
        info["device_id"] = self.device_id
        info["raw_info_xml"] = message
        info["info_service_names"] = [item["tag"] for item in services]
        info["info_services"] = services
        info["info_property_names"] = [item["tag"] for item in properties]
        info["info_properties"] = properties
        info["info_event_names"] = [item["tag"] for item in events]
        info["info_events"] = events
        door_action = root.find(".//Services/DoorAction")
        t4_action = root.find(".//Services/T4Action")
        t4_allowed = root.find(".//Properties/T4_allowed")
        if door_action is not None:
            info["door_action_values"] = door_action.attrib.get("values")
        if t4_action is not None:
            info["t4_action_values"] = t4_action.attrib.get("values")
        if t4_allowed is not None:
            mask = t4_allowed.attrib.get("values") or (t4_allowed.text or "").strip()
            info["allowed_t4_hex"] = mask
            allowed_codes = decode_allowed_t4(mask)
            info["allowed_t4_codes"] = allowed_codes
            info["allowed_t4_labels"] = [t4_label(code) for code in allowed_codes]
        return info

    def _extract_error_code(self, message: str) -> int | None:
        if not message:
            return None
        try:
            root = ET.fromstring(message)
        except ET.ParseError:
            return None
        text = root.findtext(".//Error/Code")
        if not text:
            return None
        try:
            return int(text)
        except ValueError:
            return None

    def _build_message(self, command_type: str, body: str) -> bytes:
        self.command_id = self._generate_command_id(self.session_id)
        start_request = (
            '<Request id="{}" source={} target={} gw="gwID" '
            'protocolType="NHK" protocolVersion="1.0" type="{}">\r\n'
        ).format(self.command_id, quoteattr(self.source), quoteattr(self.target), command_type)
        end_request = "</Request>\r\n"
        payload = start_request + body + (self._build_signature(start_request + body) if self._is_sign_needed(command_type) else "") + end_request
        return _FRAME_START + payload.encode() + _FRAME_END

    def _build_ssl_context(self, *, minimum_version: ssl.TLSVersion | None = None, maximum_version: ssl.TLSVersion | None = None) -> ssl.SSLContext:
        protocol = getattr(ssl, "PROTOCOL_TLS", ssl.PROTOCOL_TLS_CLIENT)
        ctx = ssl.SSLContext(protocol)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        if hasattr(ssl, "OP_LEGACY_SERVER_CONNECT"):
            ctx.options |= ssl.OP_LEGACY_SERVER_CONNECT
        try:
            ctx.set_ciphers("ALL:@SECLEVEL=0")
        except ssl.SSLError:
            pass
        if minimum_version is not None:
            ctx.minimum_version = minimum_version
        if maximum_version is not None:
            ctx.maximum_version = maximum_version
        return ctx

    def _hex_to_bytearray(self, hex_str: str) -> bytes:
        return bytes.fromhex(hex_str)

    def _sha256(self, *parts: bytes) -> bytes:
        digest = hashlib.sha256()
        for part in parts:
            digest.update(part)
        return digest.digest()

    def _invert_array(self, data: bytes) -> bytes:
        return data[::-1]

    def _build_signature(self, xml_command: str) -> str:
        client_challenge = self._hex_to_bytearray(self.client_challenge)
        server_challenge = self._hex_to_bytearray(self.server_challenge)
        pairing_password = base64.b64decode(self.password)
        session_password = self._sha256(pairing_password, self._invert_array(server_challenge), self._invert_array(client_challenge))
        msg_hash = self._sha256(xml_command.encode())
        sign = self._sha256(msg_hash, session_password)
        return f"<Sign>{base64.b64encode(sign).decode('utf-8')}</Sign>"

    def _is_sign_needed(self, command_type: str) -> bool:
        return command_type not in {"PAIR", "CONNECT", "VERIFY", "IDENTIFY"}

    def _generate_command_id(self, session_id: int | str) -> int:
        low = self.command_sequence
        self.command_sequence += 1
        return (low << 8) | (int(session_id) & 0xFF)

    def _get_setup_code_check(self, setup_code: str) -> str:
        client_challenge = self._hex_to_bytearray(self.client_challenge)
        payload = setup_code.encode("utf-8") + client_challenge[::-1] + b"Nice4U"
        crc32 = (~binascii.crc32(payload)) & 0xFFFFFFFF
        return f"{crc32:08X}"

