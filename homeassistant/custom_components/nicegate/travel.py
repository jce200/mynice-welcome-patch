"""Where the gate is, estimated from when it started, stopped and arrived.

The module reports no position, only opening / closing / stopped / open / closed. The time a full run takes is learned from real runs (one per
direction, the median of the last few), and the position while the gate moves is the position it started from plus the share of that time that
has passed. Nothing here is a fixed number of seconds: until a direction has been measured once, the position during a run in that direction is
unknown. This file has no Home Assistant in it, so that it can be tested alone.
"""
from __future__ import annotations

from statistics import median
from typing import Any

MIN_TRAVEL_SECONDS = 3.0      # a "run" shorter than this is a glitch, not a measurement
MAX_TRAVEL_SECONDS = 180.0
KEEP_RUNS = 5
MOVING = {"opening": 1, "closing": -1}
END = {"open": 100.0, "closed": 0.0}


class TravelModel:
    def __init__(self) -> None:
        self.runs: dict[str, list[float]] = {"opening": [], "closing": []}
        self.status: str | None = None
        self.position: float | None = None       # at rest: where the gate is; while moving: where the run started
        self.started: float | None = None        # monotonic time at which the current run started
        self.precise_start = False               # the start was heard at once (pushed), not found by a poll
        self.full_run = False                    # the run started at an end, so its duration is the travel time
        self.changed = False                     # something worth saving happened since the last save

    # ---- what was learned
    def travel_time(self, direction: str) -> float | None:
        runs = self.runs.get(direction) or []
        return round(median(runs), 2) if runs else None

    def _learn(self, direction: str, seconds: float) -> None:
        if MIN_TRAVEL_SECONDS <= seconds <= MAX_TRAVEL_SECONDS:
            self.runs[direction] = (self.runs[direction] + [round(seconds, 2)])[-KEEP_RUNS:]
            self.changed = True

    # ---- where the gate is
    def position_at(self, now: float) -> float | None:
        """0 (closed) to 100 (open), or None when it cannot be known."""
        if self.status in END:
            return END[self.status]
        if self.status not in MOVING:
            return self.position
        total = self.travel_time(self.status)
        if self.position is None or self.started is None or total is None:
            return None
        moved = 100.0 * max(0.0, now - self.started) / total
        value = self.position + MOVING[self.status] * moved
        # the gate is not at an end until the module says so: a run that takes longer than expected waits just before it
        return min(99.0, max(1.0, value))

    def update(self, status: str | None, now: float, *, precise: bool) -> None:
        """A status from the module. precise: it was pushed (heard within a moment), not found by a poll (up to a poll interval late)."""
        if status == self.status or status is None:
            return
        previous, here = self.status, self.position_at(now)
        if status in MOVING:
            if previous in END:
                start, full = END[previous], (previous == "closed") == (status == "opening")
            else:
                start, full = here, False          # from a stop, or reversed while moving: from where it is now
            self.position, self.started = start, now
            self.precise_start, self.full_run = precise, full
        elif status in END:
            if previous in MOVING and self.full_run and self.precise_start and precise and self.started is not None \
                    and (status == "open") == (previous == "opening"):
                self._learn(previous, now - self.started)
            self.position, self.started, self.full_run = END[status], None, False
            self.changed = True
        else:                                       # stopped
            self.position, self.started, self.full_run = here, None, False
            self.changed = True
        self.status = status

    def moving(self) -> bool:
        return self.status in MOVING

    # ---- keeping it over a restart
    def dump(self) -> dict[str, Any]:
        return {"runs": self.runs, "status": self.status if self.status not in MOVING else None,
                "position": self.position if self.status not in MOVING else None}

    def load(self, data: dict[str, Any] | None) -> None:
        if not isinstance(data, dict):
            return
        runs = data.get("runs") or {}
        for direction in self.runs:
            values = [float(v) for v in (runs.get(direction) or []) if isinstance(v, (int, float)) and MIN_TRAVEL_SECONDS <= v <= MAX_TRAVEL_SECONDS]
            self.runs[direction] = values[-KEEP_RUNS:]
        position = data.get("position")
        if data.get("status") == "stopped" and isinstance(position, (int, float)) and 0 <= position <= 100:
            # only believed while the module still says "stopped" at start-up (see update: a different first status replaces it)
            self.status, self.position = "stopped", float(position)
