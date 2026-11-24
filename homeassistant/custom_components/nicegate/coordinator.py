"""Pushed status over the persistent session, a poll as keep-alive and safety net, quick retries and then a backoff when contact is lost."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.exceptions import ConfigEntryAuthFailed, HomeAssistantError
from homeassistant.helpers.storage import Store
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .const import CONF_MAC, DEFAULT_NAME, DEFAULT_OPTIONS, DOMAIN, known_t4_codes
from .nice_api import NiceGateApi, NiceGateApiAuthError, NiceGateApiError
from .travel import TravelModel, choose_orphan, has_runs

_LOGGER = logging.getLogger(__name__)
RECONNECT_DELAY = 1.0   # seconds after the module ended the session before a new one is tried
# Most outages of the module are a matter of seconds (Wi-Fi). Until 1.10.0 one missed answer made every entity unavailable and the next
# attempt came 30 seconds later, then 60, 120, ...: a hiccup of a few seconds showed as a minute or more without the gate.
GRACE_SECONDS = 20.0        # contact lost for less than this: the entities keep their last state
QUICK_RETRY_SECONDS = 60.0  # after contact was lost: this long a new attempt every fast_poll_interval, only then the backoff

class NiceGateCommandError(HomeAssistantError):
    """The device rejected a command or did not confirm its result."""

class NiceCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    def __init__(self, hass: HomeAssistant, api: NiceGateApi, entry: ConfigEntry | None = None) -> None:
        self.options = {**DEFAULT_OPTIONS, **(dict(entry.options) if entry else {})}
        super().__init__(hass, _LOGGER, name=DEFAULT_NAME, config_entry=entry,
                         update_interval=timedelta(seconds=self.options["poll_interval"]))
        self.api = api
        self.last_successful_update: str | None = None
        self.consecutive_failures = 0
        self.last_error_category: str | None = None
        self.status_response_ms: float | None = None
        self._fast_until = 0.0
        self._was_moving = False
        self._next_info_attempt = 0.0
        self.pushed_updates = 0
        # where the gate is, estimated from the travel times it learned (travel.py); kept over a restart
        self.travel = TravelModel()
        self.movement_started: str | None = None
        self._tick = None
        # The learned travel times belong to the module, not to this config entry: they are kept under its MAC, so that removing the
        # integration and adding it again does not lose them (until 1.10.0 they were kept per config entry, see async_load_travel).
        module = "".join(c for c in str(entry.data.get(CONF_MAC, "")).lower() if c.isalnum()) if entry else ""
        self._travel_store: Store | None = Store(hass, 1, f"nicegate.{module or entry.entry_id}.travel") if entry else None
        self._legacy_travel_key: str | None = f"nicegate.{entry.entry_id}.travel" if entry and module else None
        self._reconnecting = False
        self._lost_at: float | None = None      # when contact was lost (loop time); None while there is contact
        self._slow_failures = 0                 # failed attempts after the quick retries, for the backoff
        api.set_listener(self._handle_push)

    async def async_load_travel(self) -> None:
        if not self._travel_store:
            return
        data = await self._travel_store.async_load()
        if not has_runs(data) and self._legacy_travel_key:
            taken = await self._take_over_travel()
            if taken is not None:
                data = taken
                await self._travel_store.async_save(taken)
        self.travel.load(data)

    def _stored_travel_keys(self) -> list[str]:
        """The names of the travel stores in Home Assistant's own storage folder (only the names; runs in the executor)."""
        folder = Path(self.hass.config.path(".storage"))
        return sorted(p.name for p in folder.glob("nicegate.*.travel")) if folder.is_dir() else []

    async def _take_over_travel(self) -> dict[str, Any] | None:
        """Travel times that an older version kept per config entry: of this entry, or of an entry that no longer exists.

        The second case is the integration that was removed and added again: its store stayed behind. It is only taken over when
        there is exactly one such store with travel times in it (two would be two gates, and nothing is guessed), and only the
        travel times: where the gate stood then says nothing about where it stands now.
        """
        own = await Store(self.hass, 1, self._legacy_travel_key).async_load()
        if has_runs(own):
            return own
        current = {entry.entry_id for entry in self.hass.config_entries.async_entries(DOMAIN)}
        orphans: dict[str, Any] = {}
        for key in await self.hass.async_add_executor_job(self._stored_travel_keys):
            if key != self._travel_store.key and key[len("nicegate."):-len(".travel")] not in current:
                orphans[key] = await Store(self.hass, 1, key).async_load()
        chosen = choose_orphan(orphans)
        if chosen is not None:
            _LOGGER.info("Nice Gate: took over the travel times of an earlier installation of this integration")
        return chosen

    async def async_save_travel(self) -> None:
        if self._travel_store:
            await self._travel_store.async_save(self.travel.dump())

    def _track(self, status: str | None, *, precise: bool) -> None:
        """Tell the position model what the module said. precise: pushed by the module, not found by a poll."""
        was_moving = self.travel.moving()
        before = self.travel.status
        self.travel.update(status, self.hass.loop.time(), precise=precise)
        if self.travel.status != before and self.travel.moving():
            self.movement_started = datetime.now(timezone.utc).isoformat()
        elif was_moving and not self.travel.moving():
            self.movement_started = None
        if self.travel.changed and self._travel_store:
            self.travel.changed = False
            self._travel_store.async_delay_save(self.travel.dump, 5)
        self._set_ticking(self.travel.moving() and self.travel.travel_time(self.travel.status or "") is not None)

    def _set_ticking(self, on: bool) -> None:
        """While the gate moves and its travel time is known, the entities are written once a second, so that the position moves."""
        if on and self._tick is None:
            self._tick = async_track_time_interval(self.hass, self._on_tick, timedelta(seconds=1))
        elif not on and self._tick is not None:
            self._tick()
            self._tick = None

    @callback
    def _on_tick(self, _now) -> None:
        if not self.travel.moving():
            self._set_ticking(False)
        self.async_update_listeners()

    def position(self) -> int | None:
        value = self.travel.position_at(self.hass.loop.time())
        return None if value is None else int(round(value))

    async def async_shutdown(self) -> None:
        self._set_ticking(False)
        await super().async_shutdown()

    def travel_attributes(self) -> dict[str, Any]:
        """What a card needs to draw the gate between two updates: where the run started, when, and how long a full run takes."""
        travel = self.travel
        return {
            "travel_time_open": travel.travel_time("opening"),
            "travel_time_close": travel.travel_time("closing"),
            "position_at_start": None if not travel.moving() or travel.position is None else round(travel.position, 1),
            "movement_started": self.movement_started,
        }

    def _handle_push(self, kind: str, payload: dict[str, Any] | None) -> None:
        """Called by the client from the event loop: the module said that the gate changed, or the session ended."""
        if kind == "status" and payload and payload.get("door_status"):
            self.pushed_updates += 1
            self.last_successful_update = datetime.now(timezone.utc).isoformat()
            self.consecutive_failures = 0
            self.last_error_category = None
            self._lost_at, self._slow_failures = None, 0
            self._was_moving = payload["door_status"] in {"opening", "closing"}
            self._track(payload["door_status"], precise=True)
            self._interval()
            self.async_set_updated_data({"door_status": payload["door_status"], "obstruct": payload.get("obstruct"), **self.capabilities()})
        elif kind == "disconnected" and not self._reconnecting:
            # find out soon whether the module is still there (a new session), instead of at the next poll; not through
            # async_request_refresh, whose debouncer can hold a refresh back for ten seconds
            self._reconnecting = True
            self.config_entry.async_create_background_task(self.hass, self._reconnect(), "nicegate reconnect") if self.config_entry else self.hass.async_create_task(self._reconnect())

    async def _reconnect(self) -> None:
        try:
            await asyncio.sleep(RECONNECT_DELAY)
            if not self.api.session_open:
                await self.async_refresh()
        finally:
            self._reconnecting = False

    def _begin_fast_polling(self) -> None:
        self._fast_until = self.hass.loop.time() + self.options["fast_poll_seconds"]

    def _interval(self, *, failed: bool = False) -> None:
        base = self.options["poll_interval"]
        if failed and self._lost_at is not None and self.hass.loop.time() - self._lost_at < QUICK_RETRY_SECONDS:
            seconds = min(base, self.options["fast_poll_interval"])      # try again soon: most outages are over in seconds
        elif failed:
            self._slow_failures += 1
            seconds = min(max(base, self.options["max_backoff"]), base * 2 ** min(self._slow_failures - 1, 8))
        elif self.hass.loop.time() < self._fast_until:
            seconds = min(base, self.options["fast_poll_interval"])
        else:
            seconds = base
        self.update_interval = timedelta(seconds=seconds)

    def capabilities(self) -> dict[str, Any]:
        info = self.api.info_data
        return {
            "door_actions": [x.strip() for x in (info.get("door_action_values") or "").split(",") if x.strip() in {"open", "close", "stop"}],
            "allowed_t4_codes": [x for x in info.get("allowed_t4_codes", []) if x in known_t4_codes()],
        }

    def diagnostics(self) -> dict[str, Any]:
        return {
            "available": self.last_update_success,
            "gate_status": (self.data or {}).get("door_status"),
            "obstruct": (self.data or {}).get("obstruct"),
            "last_successful_update": self.last_successful_update,
            "consecutive_failures": self.consecutive_failures,
            "contact_lost_seconds": None if self._lost_at is None else round(self.hass.loop.time() - self._lost_at),
            "last_error_category": self.last_error_category,
            "status_response_ms": self.status_response_ms,
            "current_poll_interval_seconds": self.update_interval.total_seconds(),
            "fast_polling": self.hass.loop.time() < self._fast_until and not self.consecutive_failures,
            "session_open": self.api.session_open,
            "pushed_updates": self.pushed_updates,
            "travel_time_open": self.travel.travel_time("opening"),
            "travel_time_close": self.travel.travel_time("closing"),
        }

    async def _async_update_data(self) -> dict[str, Any]:
        try:
            status = await self.api.async_get_status()
            if not status or status.get("door_status") not in {"open", "closed", "opening", "closing", "stopped"}:
                raise NiceGateApiError("Device did not return a recognized gate status", "invalid_status")
        except (NiceGateApiError, TimeoutError, OSError) as err:
            now = self.hass.loop.time()
            if self._lost_at is None:
                self._lost_at = now
            self.consecutive_failures += 1
            self.last_error_category = getattr(err, "category", "connection")
            self._interval(failed=True)
            if isinstance(err, NiceGateApiAuthError):
                raise ConfigEntryAuthFailed("Nice user permission or credentials need attention") from err
            if self.data is not None and now - self._lost_at < GRACE_SECONDS:
                # One missed answer is not an outage. The entities keep their last state for a moment (the status sensor says in
                # contact_lost_seconds and consecutive_failures that there is no contact), and the next attempt follows within seconds.
                _LOGGER.debug("Nice status missed (%s); keeping the last state while trying again", self.last_error_category)
                return self.data
            raise UpdateFailed(f"Local Nice status unavailable ({self.last_error_category})") from err
        self.last_successful_update = datetime.now(timezone.utc).isoformat()
        self.status_response_ms = self.api.last_response_ms
        self.consecutive_failures = 0
        self.last_error_category = None
        self._lost_at, self._slow_failures = None, 0
        self._track(status["door_status"], precise=False)
        moving = status["door_status"] in {"opening", "closing"}
        if moving and not self._was_moving:
            self._begin_fast_polling()
        self._was_moving = moving
        self._interval()
        # Capabilities are optional; retry at most once per five minutes.
        if not self.api.raw_info_xml and self.hass.loop.time() >= self._next_info_attempt:
            self._next_info_attempt = self.hass.loop.time() + 300
            try:
                await self.api.async_get_info_data()
            except (NiceGateApiError, TimeoutError, OSError) as err:
                _LOGGER.debug("Nice capability read failed (%s)", getattr(err, "category", "connection"))
        return {"door_status": status["door_status"], "obstruct": status.get("obstruct"), **self.capabilities()}

    async def async_initial_load(self) -> None:
        await self.async_config_entry_first_refresh()

    async def async_refresh_info(self) -> None:
        await self.api.async_get_info_data()
        await self.async_request_refresh()

    async def _execute(self, command: str, *, t4: bool = False) -> None:
        error: NiceGateApiError | None = None
        try:
            if t4:
                await self.api.send_command(command, frame_type="T4Action")
            else:
                await self.api.change(command)
        except NiceGateApiError as err:
            error = err
        # Read status even when acknowledgement was lost. Never repeat an action.
        self._begin_fast_polling()
        await self.async_request_refresh()
        if error:
            raise NiceGateCommandError(str(error)) from error

    async def async_execute_command(self, command: str) -> None:
        await self._execute(command)

    async def async_execute_t4(self, code: str) -> None:
        await self._execute(code, t4=True)
