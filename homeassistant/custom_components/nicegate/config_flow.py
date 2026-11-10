"""Set up, re-pair and reconfigure Nice without losing entity identities."""
from __future__ import annotations

import re
import socket
from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_USERNAME
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers.device_registry import format_mac

from .const import CONF_MAC, CONF_SETUP_CODE, DEFAULT_NAME, DEFAULT_OPTIONS, DEFAULT_USERNAME, DOMAIN
import logging

from .nice_api import NiceGateApi, NiceGateApiAuthError, NiceGateApiError

_LOGGER = logging.getLogger(__name__)

STEP_USER_DATA_SCHEMA = vol.Schema({
    vol.Required(CONF_HOST): str,
    vol.Required(CONF_MAC): str,
    vol.Optional(CONF_USERNAME, default=DEFAULT_USERNAME): str,
})
STEP_PAIR_DATA_SCHEMA = vol.Schema({vol.Required(CONF_SETUP_CODE): str})

def _normalize_user_input(data: dict[str, Any]) -> dict[str, Any]:
    host = data[CONF_HOST].strip()
    username = data.get(CONF_USERNAME, DEFAULT_USERNAME).strip() or DEFAULT_USERNAME
    mac = format_mac(data[CONF_MAC]).upper()
    if not re.fullmatch(r"(?:[0-9A-F]{2}:){5}[0-9A-F]{2}", mac) or not host or "/" in host:
        raise ValueError("Invalid address")
    socket.getaddrinfo(host, 443)
    return {CONF_HOST: host, CONF_MAC: mac, CONF_USERNAME: username}

class ConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1
    MINOR_VERSION = 5

    def __init__(self) -> None:
        self._data: dict[str, Any] = {}
        self._repair_entry: config_entries.ConfigEntry | None = None

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: config_entries.ConfigEntry) -> NiceOptionsFlow:
        return NiceOptionsFlow()

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        errors = {}
        if user_input is not None:
            try:
                self._data = await self.hass.async_add_executor_job(_normalize_user_input, user_input)
            except ValueError:
                errors["base"] = "invalid_host"
            except OSError:
                errors["base"] = "cannot_connect"
            else:
                await self.async_set_unique_id(self._data[CONF_MAC])
                self._abort_if_unique_id_configured()
                return await self.async_step_pair()
        return self.async_show_form(step_id="user", data_schema=self.add_suggested_values_to_schema(STEP_USER_DATA_SCHEMA, user_input or self._data), errors=errors)

    async def async_step_pair(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        errors = {}
        if user_input is not None:
            api = NiceGateApi(self._data[CONF_HOST], self._data[CONF_MAC], self._data[CONF_USERNAME], self._data.get(CONF_PASSWORD, ""))
            try:
                if not self._data.get(CONF_PASSWORD):
                    self._data[CONF_PASSWORD] = await api.pair(user_input[CONF_SETUP_CODE].strip())
                if await api.verify_connect() == "wait":
                    errors["base"] = "waiting_permission"
                else:
                    if self._repair_entry:
                        return self.async_update_reload_and_abort(self._repair_entry, data_updates=self._data, reason="reauth_successful")
                    return self.async_create_entry(title=DEFAULT_NAME, data=self._data)
            except NiceGateApiAuthError:
                errors["base"] = "invalid_auth"
            except (NiceGateApiError, TimeoutError, OSError) as err:
                # say what failed: no network path, a module that does not answer the request, or a module that refuses it
                category = getattr(err, "category", "connection")
                phase = api.last_error_phase
                _LOGGER.warning("Nice pairing failed: %s in phase %s (%s)", category, phase, getattr(err, "code", "no code"))
                if category == "pair_refused":
                    errors["base"] = "pair_refused"
                elif phase in ("response", "verify", "login"):
                    errors["base"] = "pair_no_answer"
                else:
                    errors["base"] = "cannot_connect"
            finally:
                await api.disconnect()
        return self.async_show_form(step_id="pair", data_schema=STEP_PAIR_DATA_SCHEMA, errors=errors,
            description_placeholders={"host": self._data.get(CONF_HOST, ""), "username": self._data.get(CONF_USERNAME, DEFAULT_USERNAME)})

    async def async_step_reauth(self, entry_data: dict[str, Any]) -> FlowResult:
        self._repair_entry = self._get_reauth_entry()
        self._data = dict(self._repair_entry.data)
        self._data.pop(CONF_PASSWORD, None)
        return await self.async_step_reauth_confirm()

    async def async_step_reauth_confirm(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        if user_input is not None:
            return await self.async_step_pair()
        return self.async_show_form(step_id="reauth_confirm", data_schema=vol.Schema({}))

    async def async_step_reconfigure(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        entry = self._get_reconfigure_entry()
        errors = {}
        if user_input is not None:
            api = None
            try:
                normalized = await self.hass.async_add_executor_job(_normalize_user_input, {**entry.data, **user_input})
                api = NiceGateApi(normalized[CONF_HOST], entry.data[CONF_MAC], entry.data[CONF_USERNAME], entry.data[CONF_PASSWORD])
                status = await api.async_get_status()
                if format_mac(status.get("target", "")).upper() != entry.data[CONF_MAC].upper():
                    errors["base"] = "wrong_device"
                else:
                    return self.async_update_reload_and_abort(entry, data_updates={CONF_HOST: normalized[CONF_HOST]}, reason="reconfigure_successful")
            except ValueError:
                errors["base"] = "invalid_host"
            except NiceGateApiAuthError:
                errors["base"] = "invalid_auth"
            except (NiceGateApiError, OSError, TimeoutError):
                errors["base"] = "cannot_connect"
            finally:
                if api:
                    await api.disconnect()
        schema = vol.Schema({vol.Required(CONF_HOST, default=entry.data[CONF_HOST]): str})
        return self.async_show_form(step_id="reconfigure", data_schema=schema, errors=errors)

class NiceOptionsFlow(config_entries.OptionsFlowWithReload):
    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> FlowResult:
        errors = {}
        if user_input is not None:
            if user_input["fast_poll_interval"] > user_input["poll_interval"] or user_input["max_backoff"] < user_input["poll_interval"]:
                errors["base"] = "invalid_intervals"
            else:
                return self.async_create_entry(title="", data=user_input)
        current = {**DEFAULT_OPTIONS, **self.config_entry.options}
        schema = vol.Schema({
            vol.Required("poll_interval", default=current["poll_interval"]): vol.All(vol.Coerce(int), vol.Range(min=15, max=300)),
            vol.Required("fast_poll_interval", default=current["fast_poll_interval"]): vol.All(vol.Coerce(int), vol.Range(min=5, max=30)),
            vol.Required("fast_poll_seconds", default=current["fast_poll_seconds"]): vol.All(vol.Coerce(int), vol.Range(min=0, max=120)),
            vol.Required("max_backoff", default=current["max_backoff"]): vol.All(vol.Coerce(int), vol.Range(min=60, max=900)),
        })
        return self.async_show_form(step_id="init", data_schema=schema, errors=errors)
