"""Cover platform for Nice Gate."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from homeassistant.components.cover import CoverDeviceClass, CoverEntity, CoverEntityFeature
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import STATE_CLOSED, STATE_CLOSING, STATE_OPENING
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_MAC, DOMAIN
from .coordinator import NiceCoordinator

async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    runtime = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([NiceGateCover(runtime["coordinator"], entry.data[CONF_MAC], runtime["device_info"])])


class NiceGateCover(CoordinatorEntity[NiceCoordinator], CoverEntity):
    _attr_device_class = CoverDeviceClass.GATE
    _attr_has_entity_name = True
    _attr_name = "Gate"
    _unrecorded_attributes = frozenset({"last_successful_update", "movement_started", "position_at_start"})
    _attr_translation_key = "gate"
    _attr_supported_features = CoverEntityFeature.OPEN | CoverEntityFeature.CLOSE | CoverEntityFeature.STOP

    def __init__(self, coordinator: NiceCoordinator, device_id: str, device_info: dict[str, object]) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = device_id
        self._attr_device_info = device_info
        self._tick = None

    # ---- the estimated position (travel.py): while the gate moves the state is written once a second, so that the position moves too
    @property
    def current_cover_position(self) -> int | None:
        position = self.coordinator.travel.position_at(self.hass.loop.time())
        return None if position is None else int(round(position))

    @callback
    def _handle_coordinator_update(self) -> None:
        travel = self.coordinator.travel
        moving = travel.moving() and travel.travel_time(travel.status or "") is not None
        if moving and self._tick is None:
            self._tick = async_track_time_interval(self.hass, self._on_tick, timedelta(seconds=1))
        elif not moving:
            self._stop_tick()
        super()._handle_coordinator_update()

    @callback
    def _on_tick(self, _now) -> None:
        if not self.coordinator.travel.moving():
            self._stop_tick()
        self.async_write_ha_state()

    def _stop_tick(self) -> None:
        if self._tick is not None:
            self._tick()
            self._tick = None

    async def async_will_remove_from_hass(self) -> None:
        self._stop_tick()
        await super().async_will_remove_from_hass()

    def _door_status(self) -> str:
        return str((self.coordinator.data or {}).get("door_status") or "").strip().lower()

    @property
    def is_closed(self) -> bool | None:
        status = self._door_status()
        if status == STATE_CLOSED:
            return True
        if status in {"open", "stopped", STATE_OPENING, STATE_CLOSING}:
            # A gate that was stopped on its way is not closed: Home Assistant shows it as open (1.7.2; until then it was
            # "unknown", which reads as "no contact"). The attribute raw_status and the status sensor still say "stopped".
            return False
        return None

    @property
    def is_closing(self) -> bool | None:
        return self._door_status() == STATE_CLOSING

    @property
    def is_opening(self) -> bool | None:
        return self._door_status() == STATE_OPENING

    @property
    def extra_state_attributes(self) -> dict[str, object | None]:
        data = self.coordinator.data or {}
        return {
            "raw_status": data.get("door_status"),
            "obstruct": data.get("obstruct"),
            "last_successful_update": self.coordinator.last_successful_update,
            **self.coordinator.travel_attributes(),
        }

    async def async_open_cover(self, **kwargs: Any) -> None:
        await self.coordinator.async_execute_command("open")

    async def async_close_cover(self, **kwargs: Any) -> None:
        await self.coordinator.async_execute_command("close")

    async def async_stop_cover(self, **kwargs: Any) -> None:
        await self.coordinator.async_execute_command("stop")
