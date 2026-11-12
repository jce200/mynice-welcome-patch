"""Binary sensor platform for Nice Gate: the obstruction flag of the module."""
from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_MAC, DOMAIN
from .coordinator import NiceCoordinator


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    runtime = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([NiceGateObstructionSensor(runtime["coordinator"], entry.data[CONF_MAC], runtime["device_info"])])


class NiceGateObstructionSensor(CoordinatorEntity[NiceCoordinator], BinarySensorEntity):
    """On while the module reports an obstruction. The module has one flag for a photocell, a safety edge and the force limit alike."""
    _attr_has_entity_name = True
    _attr_name = "Obstruction"
    _attr_device_class = BinarySensorDeviceClass.PROBLEM

    def __init__(self, coordinator: NiceCoordinator, unique_part: str, device_info: dict[str, object]) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{unique_part}_obstruction"
        self._attr_device_info = device_info

    @property
    def is_on(self) -> bool | None:
        value = (self.coordinator.data or {}).get("obstruct")
        return None if value is None else bool(value)
