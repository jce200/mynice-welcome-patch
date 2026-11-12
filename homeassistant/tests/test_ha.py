"""The integration in Home Assistant against a simulated IT4WIFI.

    pip install homeassistant pytest-homeassistant-custom-component defusedxml
    python -m pytest tests/test_ha.py        (from the folder homeassistant/)
"""
import asyncio
import pytest
from homeassistant.const import CONF_HOST, CONF_PASSWORD, CONF_USERNAME
from pytest_homeassistant_custom_component.common import MockConfigEntry
from custom_components.nicegate import nice_api
from .it4wifi_sim import MAC, PWD, Module

@pytest.fixture(autouse=True)
def _auto(enable_custom_integrations, socket_enabled):
    yield

async def _settle(hass, seconds=0.15):
    await asyncio.sleep(seconds)
    await hass.async_block_till_done()

async def test_integration(hass, monkeypatch):
    mod = Module(); await mod.start()
    real = asyncio.open_connection
    async def open_conn(host, port, **kw):
        return await real("127.0.0.1", mod.port, **kw)
    monkeypatch.setattr(nice_api.asyncio, "open_connection", open_conn)
    monkeypatch.setattr(nice_api, "PREFLIGHT_IDLE", 0.3); monkeypatch.setattr(nice_api, "PREFLIGHT_TIMEOUT", 0.6); monkeypatch.setattr(nice_api, "RESPONSE_TIMEOUT", 1.5)
    entry = MockConfigEntry(domain="nicegate", unique_id=MAC, data={CONF_HOST: "192.0.2.10", "mac": MAC, CONF_USERNAME: "u", CONF_PASSWORD: PWD})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    covers = hass.states.async_entity_ids("cover"); assert len(covers) == 1
    cover = covers[0]
    assert hass.states.get(cover).state == "closed"
    sensor = [e for e in hass.states.async_entity_ids("sensor") if e.endswith("gate_status")][0]
    assert hass.states.get(sensor).state == "closed"
    assert mod.sessions == 1                       # setup (STATUS + INFO) used one session
    # a command: confirmed, and the state follows from the pushed event, without waiting for a poll
    await hass.services.async_call("cover", "open_cover", {"entity_id": cover}, blocking=True)
    await _settle(hass)
    assert mod.commands == ["open"] and mod.sessions == 1
    assert hass.states.get(cover).state == "opening"
    # the gate arrives; and later someone uses the remote control
    mod.status = "open"; await mod.push(); await _settle(hass)
    assert hass.states.get(cover).state == "open" and hass.states.get(sensor).state == "open"
    mod.status = "closing"; await mod.push(); await _settle(hass)
    assert hass.states.get(cover).state == "closing"
    mod.status = "stopped"; await mod.push(); await _settle(hass)
    assert hass.states.get(sensor).state == "stopped"
    assert hass.states.get(cover).state == "open" and hass.states.get(cover).attributes["raw_status"] == "stopped"
    attrs = hass.states.get(sensor).attributes
    assert attrs["session_open"] is True and attrs["pushed_updates"] >= 4
    # a button (T4 command) over the same session
    buttons = hass.states.async_entity_ids("button"); assert buttons
    await hass.services.async_call("button", "press", {"entity_id": buttons[0]}, blocking=True)
    await _settle(hass)
    assert len(mod.commands) == 2 and mod.sessions == 1
    # the module drops the connection: the integration reconnects by itself and stays available
    await mod.kill_all(); await _settle(hass, 1.6)
    assert hass.states.get(cover).state != "unavailable" and mod.sessions == 2
    # a command the module refuses is an error for the caller
    mod.reject = 5
    with pytest.raises(Exception):
        await hass.services.async_call("cover", "close_cover", {"entity_id": cover}, blocking=True)
    mod.reject = None
    # the diagnostics download
    from custom_components.nicegate.diagnostics import async_get_config_entry_diagnostics
    diag = await async_get_config_entry_diagnostics(hass, entry)
    assert diag["integration_version"] == "1.9.0" and diag["connection"]["session_open"] is True and diag["connection"]["sessions_opened"] == 2
    assert PWD not in str(diag) and MAC not in str(diag)
    # the module disappears: unavailable; it comes back: available again
    for w in list(mod.conns): w.transport.abort()
    mod.conns.clear(); mod.server.close(); await _settle(hass, 0.3)
    coordinator = hass.data["nicegate"][entry.entry_id]["coordinator"]
    await coordinator.async_refresh(); await hass.async_block_till_done()
    assert hass.states.get(cover).state == "unavailable"
    mod2 = Module(); await mod2.start(); mod.port = mod2.port
    await coordinator.async_refresh(); await hass.async_block_till_done()
    assert hass.states.get(cover).state == "closed" and mod2.sessions == 1
    # unload closes the session
    assert await hass.config_entries.async_unload(entry.entry_id)
    await _settle(hass)
    assert not mod2.conns
    mod2.server.close()


async def test_position(hass, monkeypatch):
    """The estimated position: learned from full runs, frozen by a stop, kept over a reload."""
    from custom_components.nicegate import travel
    monkeypatch.setattr(travel, "MIN_TRAVEL_SECONDS", 0.5)
    mod = Module(); await mod.start()
    real = asyncio.open_connection
    async def open_conn(host, port, **kw):
        return await real("127.0.0.1", mod.port, **kw)
    monkeypatch.setattr(nice_api.asyncio, "open_connection", open_conn)
    entry = MockConfigEntry(domain="nicegate", unique_id=MAC, data={CONF_HOST: "192.0.2.10", "mac": MAC, CONF_USERNAME: "u", CONF_PASSWORD: PWD})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    cover = hass.states.async_entity_ids("cover")[0]
    pos = lambda: hass.states.get(cover).attributes.get("current_position")
    attr = lambda k: hass.states.get(cover).attributes.get(k)
    async def say(status, wait=0.1):
        mod.status = status; await mod.push(); await _settle(hass, wait)
    assert hass.states.get(cover).state == "closed" and pos() == 0
    # the first run: nothing is known yet, so no position is invented
    await say("opening", 2.0)
    assert hass.states.get(cover).state == "opening" and pos() is None and attr("travel_time_open") is None
    await say("open")
    assert pos() == 100 and 1.8 <= attr("travel_time_open") <= 2.5
    await say("closing", 2.0); await say("closed")
    assert pos() == 0 and 1.8 <= attr("travel_time_close") <= 2.5
    # now a run is drawn: the position moves while the gate moves (the state is written once a second) ...
    await say("opening", 1.1)
    assert attr("position_at_start") == 0 and attr("movement_started")
    assert 35 <= pos() <= 70, pos()
    # ... and a stop freezes it where it is; the cover is not "open at 100"
    await say("stopped")
    stopped_at = pos()
    assert 35 <= stopped_at <= 75 and attr("raw_status") == "stopped" and attr("movement_started") is None
    await _settle(hass, 1.2)
    assert pos() == stopped_at
    # it goes on from there
    await say("closing", 0.1)
    assert attr("position_at_start") == stopped_at or abs(attr("position_at_start") - stopped_at) <= 1
    await say("closed")
    assert pos() == 0
    # the same as entities of their own
    sid = lambda end: [e for e in hass.states.async_entity_ids() if e.endswith(end)][0]
    assert hass.states.get(sid("gate_position")).state == "0" and hass.states.get(sid("gate_position")).attributes["unit_of_measurement"] == "%"
    assert float(hass.states.get(sid("travel_time_open")).state) == attr("travel_time_open")
    assert float(hass.states.get(sid("travel_time_close")).state) == attr("travel_time_close")
    assert hass.states.get(sid("_obstruction")).state == "off"
    await say("opening", 1.2)
    assert 35 <= int(hass.states.get(sid("gate_position")).state) <= 75        # the sensor moves with the gate too
    mod.status = "stopped"
    await mod.push("CHANGE", '<Devices><Device id="1"><Properties><DoorStatus>stopped</DoorStatus><Obstruct>1</Obstruct></Properties></Device></Devices>'); await _settle(hass)
    assert hass.states.get(sid("_obstruction")).state == "on"
    await say("closing", 0.1); await say("closed")
    assert hass.states.get(sid("_obstruction")).state == "off" and hass.states.get(sid("gate_position")).state == "0"
    # kept over a reload
    learned = (attr("travel_time_open"), attr("travel_time_close"))
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert (attr("travel_time_open"), attr("travel_time_close")) == learned and pos() == 0
    assert await hass.config_entries.async_unload(entry.entry_id)
    await _settle(hass)
    mod.server.close()
