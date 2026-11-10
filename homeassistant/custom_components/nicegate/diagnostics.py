"""Allowlisted diagnostics: no raw XML, identifiers, credentials or location."""
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from .const import DEFAULT_OPTIONS, DOMAIN

async def async_get_config_entry_diagnostics(hass: HomeAssistant, entry: ConfigEntry) -> dict:
    runtime = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    result = {
        "schema_version": 1,
        "integration_version": "1.7.2",
        "configuration": {
            "connection": "local", "host": "**REDACTED**", "mac": "**REDACTED**",
            "username": "**REDACTED**", "password": "**REDACTED**",
            "options": {key: entry.options.get(key, value) for key, value in DEFAULT_OPTIONS.items()},
        },
        "loaded": runtime is not None,
    }
    if runtime:
        result.update(status=runtime["coordinator"].diagnostics(),
                      capabilities=runtime["coordinator"].capabilities(),
                      connection=runtime["api"].diagnostics())
    return result
