"""Bounded NHK framing over cancellable asyncio streams, and one persistent session on top of it."""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Callable
from typing import Any

import defusedxml.ElementTree as ET
from defusedxml.common import DefusedXmlException

MAX_FRAME_BYTES = 65536
MAX_IGNORED_FRAMES = 32
_LOGGER = logging.getLogger(__name__)


class ProtocolError(Exception):
    """Invalid or unexpected protocol response."""


class NHKConnection:
    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        self.reader = reader
        self.writer = writer
        self.ignored_frames = 0

    async def send(self, frame: bytes) -> None:
        self.writer.write(frame)
        await self.writer.drain()

    async def read_frame(self) -> str:
        # StreamReader preserves bytes following the delimiter for the next call.
        try:
            await self.reader.readuntil(b"\x02")
            frame = await self.reader.readuntil(b"\x03")
        except (asyncio.LimitOverrunError, asyncio.IncompleteReadError) as err:
            raise ProtocolError("Incomplete or oversized NHK frame") from err
        if len(frame) > MAX_FRAME_BYTES:
            raise ProtocolError("Oversized NHK frame")
        try:
            return frame[:-1].decode("utf-8")
        except UnicodeDecodeError as err:
            raise ProtocolError("Invalid NHK encoding") from err

    async def response(self, kind: str, request_id: int) -> str:
        for _ in range(MAX_IGNORED_FRAMES):
            message = await self.read_frame()
            try:
                root = ET.fromstring(message)
            except (ET.ParseError, ValueError, DefusedXmlException) as err:
                raise ProtocolError("Invalid NHK XML") from err
            # Events are not acknowledgements. Responses must identify our request.
            is_error = root.get("type") == "ERROR" or root.find("Error") is not None
            if (root.tag != "Response" or root.get("id") != str(request_id)
                    or (root.get("type") != kind and not is_error)):
                self.ignored_frames += 1
                continue
            return message
        raise ProtocolError("Too many unrelated NHK frames")

    def abort(self) -> None:
        """Drop the connection without a TLS goodbye (the other side is known to be gone)."""
        transport = self.writer.transport
        if transport is not None:
            transport.abort()

    async def close(self) -> None:
        self.writer.close()
        try:
            async with asyncio.timeout(2):
                await self.writer.wait_closed()
        except (OSError, TimeoutError):
            pass


class NHKSession:
    """One authenticated connection that stays open.

    A reader task takes every frame: a Response resolves the request that waits for it (matched by type and id), an Event is
    handed to on_event at once (this is how the module pushes a change of the gate). When the connection ends, every waiting
    request fails and on_closed is called, unless the session was closed from this side.
    """

    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter,
                 on_event: Callable[[str | None, str], None], on_closed: Callable[[], None]) -> None:
        self._conn = NHKConnection(reader, writer)
        self._on_event = on_event
        self._on_closed = on_closed
        self._pending: dict[tuple[str, str], asyncio.Future[str]] = {}
        self._closing = False
        self.closed = False
        self.ignored_frames = 0
        self.events = 0
        self.last_rx = asyncio.get_running_loop().time()
        self._task = asyncio.create_task(self._read_loop())

    async def request(self, frame: bytes, kind: str, request_id: int, timeout: float,
                      sent: Callable[[], None] | None = None) -> str:
        """Send one frame and wait for its response. `sent` is called just before the bytes are written."""
        if self.closed:
            raise ConnectionError("NHK session is closed")
        key = (kind, str(request_id))
        future: asyncio.Future[str] = asyncio.get_running_loop().create_future()
        self._pending[key] = future
        try:
            if sent:
                sent()
            await self._conn.send(frame)
            async with asyncio.timeout(timeout):
                return await future
        finally:
            self._pending.pop(key, None)
            if future.done() and not future.cancelled():
                future.exception()  # retrieved, so that a failure nobody waited for is not logged as "never retrieved"

    async def _read_loop(self) -> None:
        try:
            while True:
                message = await self._conn.read_frame()
                self.last_rx = asyncio.get_running_loop().time()
                try:
                    root = ET.fromstring(message)
                except (ET.ParseError, ValueError, DefusedXmlException):
                    self.ignored_frames += 1
                    continue
                if root.tag == "Response":
                    future = self._pending.get((root.get("type") or "", root.get("id") or ""))
                    if future is None and (root.get("type") == "ERROR" or root.find("Error") is not None):
                        # the module answers a request it refuses with an error under the same id
                        future = next((f for (_, rid), f in self._pending.items() if rid == (root.get("id") or "")), None)
                    if future is not None and not future.done():
                        future.set_result(message)
                    else:
                        self.ignored_frames += 1
                elif root.tag == "Event":
                    self.events += 1
                    try:
                        self._on_event(root.get("type"), message)
                    except Exception:  # a listener must never end the session
                        _LOGGER.exception("Nice event handler failed")
                else:
                    self.ignored_frames += 1
        except (ProtocolError, OSError):
            pass
        finally:
            self.closed = True
            for future in list(self._pending.values()):
                if not future.done():
                    future.set_exception(ConnectionError("NHK session ended"))
            if not self._closing:
                try:
                    self._on_closed()
                except Exception:
                    _LOGGER.exception("Nice close handler failed")

    async def close(self, *, dead: bool = False) -> None:
        """Close the session. dead=True: the module does not answer on it, so do not wait for a clean TLS shutdown."""
        self._closing = True
        self.closed = True
        if self._task is not asyncio.current_task():
            self._task.cancel()
            await asyncio.gather(self._task, return_exceptions=True)
        if dead:
            self._conn.abort()
        else:
            await self._conn.close()


def protocol_summary(message: str | None) -> dict[str, Any] | None:
    """Only export an allowlist; never export source, credentials or raw XML."""
    if not message:
        return None
    try:
        root = ET.fromstring(message)
    except (ET.ParseError, ValueError, DefusedXmlException):
        return {"valid_xml": False}
    kind = root.get("type")
    raw_id = root.get("id", "")
    return {
        "valid_xml": True,
        "type": kind if kind in {"VERIFY", "CONNECT", "PAIR", "STATUS", "INFO", "CHANGE"} else "other",
        "request_id": int(raw_id) if raw_id.isdecimal() and len(raw_id) < 20 else None,
        "has_authentication": root.find(".//Authentication") is not None,
        "has_status": root.find(".//DoorStatus") is not None,
        "has_error": root.find(".//Error") is not None,
    }
