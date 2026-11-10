"""Sensor platform for Nice Gate."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_MAC, DOMAIN
from .coordinator import NiceCoordinator

_STATE_LABELS = {
    "open": "open",
    "opening": "opening",
    "closed": "closed",
    "closing": "closing",
    "stopped": "stopped",
}
_STATE_ICONS = {
    "open": "mdi:gate-open",
    "opening": "mdi:gate-arrow-right",
    "closed": "mdi:gate",
    "closing": "mdi:gate-arrow-left",
    "stopped": "mdi:pause-circle-outline",
}


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    runtime = hass.data[DOMAIN][entry.entry_id]
    coordinator = runtime["coordinator"]
    device_info = runtime["device_info"]
    async_add_entities([
        NiceGateStatusSensor(coordinator, entry.data[CONF_MAC], device_info),
    ])


class NiceGateStatusSensor(CoordinatorEntity[NiceCoordinator], SensorEntity):
    _attr_has_entity_name = True
    _attr_translation_key = "gate_status"
    _attr_name = "Gate status"
    _unrecorded_attributes = frozenset({"last_successful_update", "status_response_ms", "current_poll_interval_seconds", "fast_polling", "consecutive_failures", "pushed_updates"})

    def __init__(self, coordinator: NiceCoordinator, unique_part: str, device_info: dict[str, object]) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{unique_part}_gate_status"
        self._attr_device_info = device_info

    @property
    def native_value(self) -> str:
        raw = (self.coordinator.data or {}).get("door_status")
        if not raw:
            return "unknown"
        return _STATE_LABELS.get(raw, str(raw))

    @property
    def icon(self) -> str:
        raw = (self.coordinator.data or {}).get("door_status")
        return _STATE_ICONS.get(raw, "mdi:gate-alert")

    @property
    def extra_state_attributes(self) -> dict[str, object | None]:
        return self.coordinator.diagnostics()
