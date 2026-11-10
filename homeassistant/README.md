# Nice Gate for Home Assistant (IT4WIFI, local)

A Home Assistant integration for a Nice gate behind an IT4WIFI module, over the local NHK protocol: a cover (open, close, stop), a status sensor, buttons for
the other T4 commands, and a diagnostics download. It is unofficial and not affiliated with Nice.

It lives in this repository because it speaks the same protocol to the same module as the app that the rest of the repository patches, and what was learned
there went into it. The details of the integration, its behaviour and its history are in [custom_components/nicegate/README.md](custom_components/nicegate/README.md).

## Install

Copy the folder `custom_components/nicegate` into the `custom_components` folder of your Home Assistant configuration and restart Home Assistant. Then add
*Nice Gate* under Settings > Devices & services: the address and the MAC address of the module, a user name that does not exist on the module yet, and the
configuration code of the module; approve the new user in the Nice app.

To update: replace the files in that folder and restart. Leave the integration entry itself in place: it holds the credentials of its user, and removing it
means pairing again (with a new user name, or after deleting the old user in the Nice app).

## Where it comes from

It started from [PatrikTrestik/homeassistant_nicegate](https://github.com/PatrikTrestik/homeassistant_nicegate) (Apache License 2.0, see [LICENSE](LICENSE))
and has been rewritten since: bounded and serialized requests, error categories, options, reauthentication and diagnostics (1.6.0), and one persistent session
with pushed status instead of a new TLS session for every request (1.7.0). This folder is under the Apache License 2.0 like the original; the rest of the
repository has its own licence.

## Tests

`tests/it4wifi_sim.py` is a simulated IT4WIFI (TLS, VERIFY, CONNECT, PAIR, signed requests, pushed events, and the ways a module fails).

```
python3 tests/test_session.py                 # the client alone: needs defusedxml and the openssl command
python -m pytest tests/test_ha.py             # in Home Assistant: needs homeassistant and pytest-homeassistant-custom-component
```

Neither test talks to a real module.
