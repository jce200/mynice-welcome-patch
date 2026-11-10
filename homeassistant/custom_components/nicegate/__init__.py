"""The Nice Gate integration."""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import HomeAssistant
from homeassistant.helpers import entity_registry as er

from .const import CONF_MAC, DEFAULT_NAME, DOMAIN, MANUFACTURER, MODEL, PLATFORMS
from .coordinator import NiceCoordinator
from .nice_api import NiceGateApi


def _build_device_info(mac: str) -> dict[str, object]:
    return {
        "identifiers": {(DOMAIN, mac)},
        "manufacturer": MANUFACTURER,
        "model": MODEL,
        "name": DEFAULT_NAME,
    }


def _sync_existing_entity_names(hass: HomeAssistant, mac: str) -> None:
    registry = er.async_get(hass)
    desired_names = {
        ("cover", mac): "Gate",
        ("sensor", f"{mac}_gate_status"): "Gate status",
    }
    for (platform, unique_id), desired_name in desired_names.items():
        entity_id = registry.async_get_entity_id(platform, DOMAIN, unique_id)
        if entity_id is None:
            continue
        _update_registry_name(registry, entity_id, desired_name)


def _update_registry_name(registry: er.EntityRegistry, entity_id: str, desired_name: str) -> None:
    registry_entry = registry.async_get(entity_id)
    custom_name_is_auto = (
        registry_entry is not None
        and registry_entry.name is not None
        and registry_entry.name == getattr(registry_entry, "original_name", None)
    )
    update_kwargs: dict[str, object | None] = {"original_name": desired_name}
    if custom_name_is_auto:
        update_kwargs["name"] = None
    try:
        registry.async_update_entity(entity_id, **update_kwargs)
    except TypeError:
        if registry_entry is None or registry_entry.name is None or custom_name_is_auto:
            registry.async_update_entity(entity_id, name=desired_name)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})
    api = NiceGateApi(entry.data[CONF_HOST], entry.data[CONF_MAC], entry.data[CONF_USERNAME], entry.data[CONF_PASSWORD])
    coordinator = NiceCoordinator(hass, api, entry)
    try:
        await coordinator.async_initial_load()
    except Exception:
        await coordinator.async_shutdown()
        await api.disconnect()
        raise
    _sync_existing_entity_names(hass, entry.data[CONF_MAC])
    runtime = {
        "api": api,
        "coordinator": coordinator,
        "device_info": _build_device_info(entry.data[CONF_MAC]),
    }
    hass.data[DOMAIN][entry.entry_id] = runtime
    try:
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    except Exception:
        await coordinator.async_shutdown()
        await api.disconnect()
        hass.data[DOMAIN].pop(entry.entry_id, None)
        raise
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        runtime = hass.data[DOMAIN].pop(entry.entry_id)
        unsub = runtime.pop("button_unsub", None)
        if unsub:
            unsub()
        await runtime["coordinator"].async_shutdown()
        await runtime["api"].disconnect()
    return unload_ok
