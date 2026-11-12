"""The Nice Gate client against a simulated IT4WIFI, without Home Assistant.

    python3 tests/test_session.py [path of custom_components/nicegate]      (needs defusedxml and the openssl command)
"""
import asyncio, base64, hashlib, importlib, os, re, ssl, sys, types

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "custom_components", "nicegate"))
sys.path.insert(0, HERE)
from it4wifi_sim import MAC, PWD, Module
# nicegate.const imports homeassistant.const.Platform: a stub is enough for the client
ha = types.ModuleType("homeassistant"); hc = types.ModuleType("homeassistant.const")
class Platform: COVER = "cover"; SENSOR = "sensor"; BINARY_SENSOR = "binary_sensor"; BUTTON = "button"
hc.Platform = Platform; sys.modules["homeassistant"] = ha; sys.modules["homeassistant.const"] = hc
sys.path.insert(0, os.path.dirname(PKG))
pkg = types.ModuleType("nicegate"); pkg.__path__ = [PKG]; sys.modules["nicegate"] = pkg
api_mod = importlib.import_module("nicegate.nice_api")
PERSISTENT = hasattr(api_mod, "SESSION_KINDS")
if PERSISTENT:
    api_mod.PREFLIGHT_IDLE = 0.3; api_mod.PREFLIGHT_TIMEOUT = 0.6; api_mod.RESPONSE_TIMEOUT = 1.5
api_mod.REQUEST_TIMEOUT = 6

results = []
def ok(name, cond, extra=""):
    results.append(bool(cond)); print(("ok    " if cond else "FAIL  ") + name + (("   [" + str(extra) + "]") if extra and not cond else ""))

async def main():
    mod = Module(); await mod.start()
    real_open = asyncio.open_connection
    async def open_conn(host, port, **kw): return await real_open("127.0.0.1", mod.port, **kw)   # the client always dials 443
    api_mod.asyncio.open_connection = open_conn
    api = api_mod.NiceGateApi("127.0.0.1", MAC, "u", PWD)
    pushed = []
    if PERSISTENT: api.set_listener(lambda kind, payload: pushed.append((kind, dict(payload) if payload else None)))
    t = asyncio.get_running_loop().time
    for _ in range(10): st = await api.async_get_status()
    ok("ten STATUS reads give the state", st["door_status"] == "closed" and st["obstruct"] == 0)
    print("      sessions opened on the module for 10 reads:", mod.sessions)
    if not PERSISTENT:
        t0 = t(); await api.change("open"); print("      a command took %.0f ms; sessions now %d" % ((t() - t0) * 1000, mod.sessions)); await api.disconnect(); return
    ok("...over ONE session (1.6.0 opened ten)", mod.sessions == 1, mod.sessions)
    info = await api.async_get_info_data()
    ok("INFO over the same session", mod.sessions == 1 and info["door_action_values"] == "open,stop,close")
    t0 = t(); await api.change("open"); ms = (t() - t0) * 1000
    ok("a command is confirmed over the same session, as DoorAction, once", mod.commands == ["open"] and api.last_command_result == "confirmed" and mod.sessions == 1)
    await asyncio.sleep(0.05)
    ok("...and the module's Event CHANGE reaches the listener without a poll", bool(pushed) and pushed[-1][0] == "status" and pushed[-1][1]["door_status"] == "opening" and api.gate_status["door_status"] == "opening", pushed)
    mod.status = "open"; await mod.push(); await asyncio.sleep(0.05)
    ok("a change made elsewhere (remote control) is pushed too", pushed[-1][1]["door_status"] == "open" and pushed[-1][1]["obstruct"] == 0)
    await mod.push("DIAGNOSTIC", '<Devices><Device id="1"><Properties><EventDetails><CauseCode>12</CauseCode><ManoeuvreCount>4711</ManoeuvreCount></EventDetails></Properties></Device></Devices>'); await asyncio.sleep(0.05)
    ok("a DIAGNOSTIC event is kept (numbers only) for the diagnostics", api.last_diagnostic_event == {"CauseCode": "12", "ManoeuvreCount": "4711"} and api.diagnostics()["diagnostic_events"] == 1)
    # the module closes the connection (restart, Wi-Fi drop)
    n = len(pushed); await mod.kill_all(); await asyncio.sleep(0.1)
    ok("a session that the module ends is reported at once", ("disconnected", None) in pushed[n:] and not api.session_open)
    st = await api.async_get_status()
    ok("...and the next read opens a new one by itself", st["door_status"] == "open" and mod.sessions == 2 and api.session_open)
    # a dead connection that nobody closed (half open): the command must arrive exactly once
    mod.commands.clear(); mod.silent = True; await asyncio.sleep(0.4)
    mod.silent = False; old = list(mod.conns)
    for w in old: w.transport.pause_reading()   # the old connection is black-holed: what the client writes to it arrives nowhere
    t0 = t(); await api.change("close"); ms2 = (t() - t0) * 1000
    ok("a command on a dead session: the probe notices, a new session is opened, the command arrives once", mod.commands == ["close"] and api.last_command_result == "confirmed" and mod.sessions == 3, (mod.commands, mod.sessions, api.last_command_result))
    # rejected
    mod.reject = 5; err = None
    try: await api.change("open")
    except api_mod.NiceGateApiCommandRejectedError as e: err = e
    ok("a command the module refuses is 'rejected' with its code, the session stays", err is not None and err.code == 5 and api.last_command_result == "rejected" and api.session_open)
    mod.reject = None
    # written, never confirmed: unknown, not repeated
    mod.commands.clear(); mod.swallow_change = True; err = None
    try: await api.change("open")
    except api_mod.NiceGateApiCommandUncertainError as e: err = e
    ok("a command that was written but not confirmed is 'unknown' and is NOT sent again", err is not None and mod.commands == ["open"] and api.last_command_result == "unknown")
    mod.swallow_change = False
    st = await api.async_get_status()
    ok("...and the client recovers for the next request", st["door_status"] in ("open", "opening", "closing"))
    # wrong signature / expired session on a reused session: one new session, then it works
    api.server_challenge = "FFFFFFFF"; before = mod.sessions
    st = await api.async_get_status()
    ok("a session the module no longer accepts is replaced once", st is not None and mod.sessions == before + 1 and mod.bad_sign == 1, (mod.sessions, before, mod.bad_sign))
    # the module is gone
    for w in old: w.transport.abort()
    await mod.kill_all(); mod.server.close(); await asyncio.sleep(0.1); err = None
    try: await api.async_get_status()
    except api_mod.NiceGateApiConnectionError as e: err = e
    ok("an unreachable module is a connection error (the entities become unavailable)", err is not None and not api.session_open, err)
    mod2 = Module(); await mod2.start(); mod.port = mod2.port
    st = await api.async_get_status()
    ok("...and it comes back by itself when the module does", st["door_status"] == "closed" and mod2.sessions == 1)
    # login check and waiting user (config flow) still work on their own connection
    ok("verify_connect (config flow): connect", await api.verify_connect() == "connect")
    mod2.perm = "wait"
    ok("verify_connect: a user who waits for permission", await api.verify_connect() == "wait")
    p = api_mod.NiceGateApi("127.0.0.1", MAC, "new", "")
    ok("pair (config flow): the module returns the credentials", await p.pair("123-45-678") == PWD)
    mod2.pair_error = 7; err = None; p2 = api_mod.NiceGateApi("127.0.0.1", MAC, "u", "")
    t0 = t()
    try: await p2.pair("123-45-678")
    except api_mod.NiceGateApiPairRefusedError as e: err = e
    ok("pair: a module that refuses (existing user, wrong code) is 'pair_refused' with its code, at once", err is not None and err.code == 7 and t() - t0 < 1, (err, t() - t0))
    await p.disconnect(); await p2.disconnect()
    await api.disconnect()
    await asyncio.sleep(0.1)
    ok("disconnect closes the session and refuses further requests", not api.session_open and not mod2.conns)
    try: await api.async_get_status(); closed = False
    except api_mod.NiceGateApiConnectionError: closed = True
    ok("...requests after that fail cleanly", closed)
    print("      command latency on an open session: %.0f ms; with a dead session and a reconnect: %.0f ms" % (ms, ms2))
    print(("ALL OK (%d checks)" % len(results)) if all(results) else "%d of %d FAILED" % (results.count(False), len(results)))
    mod2.server.close()

asyncio.run(main())
