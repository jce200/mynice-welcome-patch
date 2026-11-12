"""Sensor platform for Nice Gate."""
from __future__ import annotations

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import PERCENTAGE, UnitOfTime
from homeassistant.helpers.entity import EntityCategory
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
        NiceGatePositionSensor(coordinator, entry.data[CONF_MAC], device_info),
        NiceGateTravelTimeSensor(coordinator, entry.data[CONF_MAC], device_info, "opening"),
        NiceGateTravelTimeSensor(coordinator, entry.data[CONF_MAC], device_info, "closing"),
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


class NiceGatePositionSensor(CoordinatorEntity[NiceCoordinator], SensorEntity):
    """Where the gate is, 0 (closed) to 100 (open): the estimate of travel.py as a sensor of its own, with a history."""
    _attr_has_entity_name = True
    _attr_name = "Gate position"
    _attr_icon = "mdi:arrow-expand-horizontal"
    _attr_native_unit_of_measurement = PERCENTAGE
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_suggested_display_precision = 0

    def __init__(self, coordinator: NiceCoordinator, unique_part: str, device_info: dict[str, object]) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{unique_part}_gate_position"
        self._attr_device_info = device_info

    @property
    def native_value(self) -> int | None:
        return self.coordinator.position()


class NiceGateTravelTimeSensor(CoordinatorEntity[NiceCoordinator], SensorEntity):
    """How long a full run takes, as learned from the last runs (unknown until one was measured)."""
    _attr_has_entity_name = True
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_device_class = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement = UnitOfTime.SECONDS
    _attr_suggested_display_precision = 1

    def __init__(self, coordinator: NiceCoordinator, unique_part: str, device_info: dict[str, object], direction: str) -> None:
        super().__init__(coordinator)
        self._direction = direction
        word = "open" if direction == "opening" else "close"
        self._attr_name = f"Travel time {word}"
        self._attr_icon = "mdi:timer-outline"
        self._attr_unique_id = f"{unique_part}_travel_time_{word}"
        self._attr_device_info = device_info

    @property
    def native_value(self) -> float | None:
        return self.coordinator.travel.travel_time(self._direction)
