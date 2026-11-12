"""Constants for the Nice Gate integration."""
from __future__ import annotations

from homeassistant.const import Platform

DOMAIN = "nicegate"
PLATFORMS: list[Platform] = [
    Platform.COVER,
    Platform.SENSOR,
    Platform.BINARY_SENSOR,
    Platform.BUTTON,
]

DEFAULT_NAME = "Nice Gate"
DEFAULT_USERNAME = "HomeAssistant"
DEFAULT_UPDATE_INTERVAL_SECONDS = 30
MANUFACTURER = "Nice"
MODEL = "IT4WIFI"

CONF_MAC = "mac"
CONF_SETUP_CODE = "setup_code"

BASE_T4_CODES: tuple[str, ...] = ("MDAx", "MDAy", "MDAz", "MDA0")
CONTROL_T4_CODES: tuple[str, ...] = ("MDBk", "MDFh")

T4_COMMAND_LABELS: dict[str, str] = {
    "MDAx": "Step by step",
    "MDAy": "Stop",
    "MDAz": "Open",
    "MDA0": "Close",
    "MDA1": "Partial opening 1",
    "MDA2": "Partial opening 2",
    "MDA3": "Partial opening 3",
    "MDBi": "Apartment step by step",
    "MDBj": "High priority step by step",
    "MDBk": "Open and lock",
    "MDBl": "Close and lock",
    "MDBm": "Lock",
    "MDEw": "Unlock",
    "MDEx": "Timed courtesy light",
    "MDEy": "Courtesy light toggle",
    "MDEz": "Master leaf step by step",
    "MDE0": "Open master leaf",
    "MDE1": "Close master leaf",
    "MDE2": "Slave leaf step by step",
    "MDE3": "Open slave leaf",
    "MDE4": "Close slave leaf",
    "MDE5": "Unlock and open",
    "MDFh": "Unlock and close",
}

T4_ALLOWED_BIT_ORDER: tuple[str | None, ...] = (
    None,
    "MDAx",
    "MDAy",
    "MDAz",
    "MDA0",
    "MDA1",
    "MDA2",
    "MDA3",
    "MDBi",
    "MDBj",
    "MDBk",
    "MDBl",
    "MDBm",
    "MDEw",
    "MDEx",
    "MDEy",
    "MDEz",
    "MDE0",
    "MDE1",
    "MDE2",
    "MDE3",
    "MDE4",
    "MDE5",
    "MDFh",
)


def t4_label(code: str) -> str:
    return T4_COMMAND_LABELS.get(code, code)


def decode_allowed_t4(mask_hex: str | None) -> list[str]:
    if not mask_hex:
        return []
    try:
        mask = int(mask_hex, 16)
    except ValueError:
        return []
    allowed: list[str] = []
    for bit_index, code in enumerate(T4_ALLOWED_BIT_ORDER):
        if code is None:
            continue
        if mask & (1 << bit_index):
            allowed.append(code)
    return allowed


def known_t4_codes() -> list[str]:
    return [code for code in T4_ALLOWED_BIT_ORDER if code is not None]


def extra_t4_codes(allowed: list[str] | None) -> list[str]:
    excluded = set(BASE_T4_CODES) | set(CONTROL_T4_CODES)
    return [code for code in (allowed or []) if code not in excluded]


def missing_t4_codes(allowed: list[str] | None) -> list[str]:
    allowed_set = set(allowed or [])
    return [code for code in known_t4_codes() if code not in allowed_set]


def missing_extra_t4_codes(allowed: list[str] | None) -> list[str]:
    excluded = set(BASE_T4_CODES) | set(CONTROL_T4_CODES)
    return [code for code in missing_t4_codes(allowed) if code not in excluded]

# Poll intervals are delays between completed requests, in seconds.
DEFAULT_OPTIONS = {
    "poll_interval": 30,
    "fast_poll_interval": 5,
    "fast_poll_seconds": 60,
    "max_backoff": 300,
}
