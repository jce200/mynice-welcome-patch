# Nice Gate 1.8.0 (local maintenance release)

Home Assistant integration for the local Nice IT4WIFI NHK interface.

## New in 1.8.0: where the gate is

The module reports no position, only when the gate starts, stops and arrives. From 1.8.0 the cover has an estimated position (`current_position`, 0 closed to
100 open), so that a card or an animation can draw the gate where it is:

- **The travel time is learned, not configured.** Every run that goes from one end to the other without a stop, and whose start and end were both pushed by
  the module, is timed; per direction the median of the last five runs counts. Until a direction has been measured once, the position during a run in that
  direction is unknown: nothing is guessed. One full open and one full close are enough.
- **While the gate moves** the position is where the run started plus the share of the travel time that has passed, and the state is written once a second.
  It does not reach 0 or 100 before the module says closed or open.
- **A stop freezes it** where it was, and the next run goes on from there. A gate that turns around while moving turns around where it was.
- **For a smooth animation** the cover has the attributes `travel_time_open`, `travel_time_close` (seconds), `movement_started` (when the current run
  started) and `position_at_start`: with these a card can draw every frame itself instead of waiting for the update of each second. `raw_status` says
  opening, closing, open, closed or stopped; the state of the cover shows a stopped gate as open.
- The travel times and a stopped position are kept over a restart of Home Assistant.

The position is an estimate: a gate that slows down before its end, or is slowed by wind, is a little ahead of or behind the drawing until it arrives.

## New in 1.7.0: one connection that stays open

Until 1.6.0 every status read and every command opened a new connection to the module: a TCP connection, a legacy TLS handshake, VERIFY and CONNECT, one
request, and closed again. That was a new session on the IT4WIFI every 30 seconds (every 5 seconds while the gate moved), seconds of delay before a command
reached the gate, a state that was up to 30 seconds old, and a small module kept busy with handshakes next to the phone app. Since 1.7.0:

- **One session stays open**, as in the Nice apps. STATUS, INFO and commands go over it; a command is one small frame.
- **The module pushes changes** (Event CHANGE): the cover follows the gate at once, also when it is moved with a remote control or the Nice app. The poll
  (30 seconds by default) stays as keep-alive and safety net.
- **A session that died is replaced by itself**: when the module ends it (about a second later), when a request finds it dead, or when the module no longer
  accepts it. While there is no contact the entities are unavailable, as before.
- **A command is never written twice.** Before a command goes to a session that has been silent for more than 8 seconds, a STATUS proves that the module
  still answers on it; if not, a new session is opened first. A command that was written and not confirmed is still reported as unknown and not repeated.
- DIAGNOSTIC events of the module (cause code, manoeuvre counter and the like, numbers only) are counted and the last one is in the diagnostics download.
- The status sensor has the attributes `session_open` and `pushed_updates`; the diagnostics have `sessions_opened`, `push_events`, `diagnostic_events`.

Entity IDs, the configuration and the options are unchanged; replace the folder and restart Home Assistant.

## Behaviour (unchanged since 1.6.0 unless said above)

- A successful STATUS read is required for availability. A gate that was stopped on its way is shown as open (not closed) since 1.7.2; the attribute `raw_status` and the status sensor say stopped. (Until 1.7.1 the cover was "unknown" then, which read as "no contact".)
- Native async TLS, one request at a time, a 25-second request deadline, and explicit socket cleanup on cancellation/unload.
- Buffered framing retains multiple messages and checks response type and request ID.
- Commands are reported as confirmed, rejected, not_sent or unknown; an uncertain command is never automatically repeated. Only STATUS determines gate position.
- Normal refresh: 30 seconds after completion. Temporary refresh: 5 seconds for at most 60 seconds after a command or detected movement. Outage retry: 30, 60, 120, 240, then at most 300 seconds. All intervals are configurable.
- Optional INFO failure does not invalidate a good status; capability retries are limited to once per five minutes.
- Use Configure to adjust intervals; use Reconfigure to update the module address. Reauthentication retains the integration and its entity IDs.
- Unsupported additional T4 buttons are disabled by default for new registry entries. Existing user choices and entity IDs are retained.
- Standard Home Assistant diagnostics export with allowlisted status, timing, error category, TLS, capabilities and last-command information. No raw XML, passwords, usernames, MAC addresses, host addresses, locations or signatures are exported.
- Small entity attributes; changing measurement timestamps and response timings are excluded from recorder attributes.

Download diagnostics from Settings > Devices & services > Nice Gate > entry menu > Download diagnostics. Home Assistant also adds its own system/version metadata around the integration data.

No permanent socket or Nice cloud fallback is implemented: those require separate protocol research. A working remote Nice app does not prove that the module's local interface is available. Software cannot determine physical closure from a stopped state alone.

Validated using regression tests against Home Assistant 2026.9.2. Manual gate motion is not part of automated validation. This is a local maintenance release; an upstream/HACS update may overwrite it, so keep the supplied backup and patch.
