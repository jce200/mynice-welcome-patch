# Nice Gate: what the integration gives you

This page is for whoever builds something on top of the integration: a dashboard card, an animation, an automation, another project. It is the one place
that says which entities and attributes exist and what they mean. If you change the integration, change this page in the same commit.

Applies to version **1.9.0** and later. The version is in `custom_components/nicegate/manifest.json` and in the diagnostics download.

## The device

One device per IT4WIFI module, named *Nice Gate* (the user may have renamed it or put it in an area, which changes the entity ids). Entity ids below are
written as `<device>`: look up the real ids in Home Assistant, do not assume them.

## Entities

| Entity | Kind | Values | Notes |
|---|---|---|---|
| `cover.<device>_gate` | cover | `open`, `closed`, `opening`, `closing` | **A stopped gate shows as `open`.** Do not use the state of the cover to tell whether the gate was stopped; use the status sensor or `raw_status`. |
| `sensor.<device>_gate_status` | sensor | `opening`, `closing`, `open`, `closed`, `stopped` | What the module really says. |
| `sensor.<device>_gate_position` | sensor, % | 0 (closed) to 100 (open), or unknown | An estimate, see below. |
| `binary_sensor.<device>_obstruction` | binary sensor | on / off | On while the module reports an obstruction. The module has one flag for a photocell, a safety edge and the force limit alike. |
| `sensor.<device>_travel_time_open` | sensor, s (diagnostic) | seconds, or unknown | How long a full run from closed to open takes, as learned. |
| `sensor.<device>_travel_time_close` | sensor, s (diagnostic) | seconds, or unknown | The same from open to closed. |
| `button.<device>_…` | buttons | press | The other T4 commands (open and lock, unlock and close, partial opening, …). Which ones exist depends on the gate controller. |

All of them are unavailable while the integration has no contact with the module.

## Attributes of the cover

| Attribute | Meaning |
|---|---|
| `raw_status` | The same value as the status sensor. |
| `current_position` | The same value as the position sensor (absent while unknown). |
| `obstruct` | 1 while the module reports an obstruction, else 0. |
| `travel_time_open`, `travel_time_close` | Seconds for a full run in that direction; empty until one was measured. |
| `position_at_start` | The position at which the current run started; empty while the gate stands still. |
| `movement_started` | When the current run started, ISO 8601 in UTC; empty while the gate stands still. |
| `last_successful_update` | When the module last answered or pushed a change. |

## The position is an estimate

The module reports no position, only when the gate starts, stops and arrives.

- The travel time is **learned**: every run that goes from one end to the other without a stop is timed, and per direction the median of the last five
  counts. Until a direction has been measured once, the position during a run in that direction is **unknown**. Nothing is guessed.
- While the gate moves, the position is where the run started plus the share of the travel time that has passed. The entities are written **once a second**.
- It stays between 1 and 99 while the gate moves, and becomes 0 or 100 only when the module says closed or open.
- A stop freezes it where it was; the next run goes on from there. A gate that reverses while moving reverses where it was.
- A gate that slows down before its end, or is slowed by wind, is a little ahead of or behind the estimate until it arrives.

## Drawing the gate smoothly

Updates come once a second, which is too coarse for an animation. Draw every frame yourself from the attributes of the cover:

```
while raw_status is opening or closing:
    travel   = travel_time_open if opening else travel_time_close
    progress = 100 * (now - movement_started) / travel
    position = position_at_start + progress   (opening)
             = position_at_start - progress   (closing)
    clamp position to 1 … 99
```

- Use `current_position` to correct the drawing when it differs by more than a few percent.
- On `stopped`: stay at `current_position`. Do not run on, do not jump.
- On `open` or `closed`: ease to 100 or 0.
- A new run always starts from the current position, never from an end.
- When the position is unknown: draw the gate open or closed from the status, without inventing a movement.
- When the page opens while the gate is already moving: start at the position that follows from `movement_started`, not at the beginning.
- Do not put a fixed number of seconds for the travel time in your own code.

## Commands

`cover.open_cover`, `cover.close_cover` and `cover.stop_cover` on the cover; `button.press` on the buttons. A command is confirmed by the module or
raises an error; it is never sent twice. The state follows from what the module reports afterwards, usually within a second.
