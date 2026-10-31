"""Unattended recovery when the power meter stops reporting power/voltage.

Decision logic (PowerRecovery) is pure so it can be tested without hardware;
the helpers below it save the run settings and restart the whole program.

Only meters that NORMALLY report power are watched. The DEM730P (read_power_new)
only exposes energy, so its voltage/power are always None by design and must not
count as a fault: a meter becomes "expected to report power" the first time a
reading with power or voltage arrives.

Escalation, once power/voltage has been missing for `null_after_s`:
    1..max_reader_restarts   -> restart just the power reader (cheap)
    after that               -> restart the whole program (re-exec + auto-start)
A good reading resets the count. Program restarts are capped per hour so a
fault that a restart cannot fix does not turn into a restart loop.
"""
import json
import os
import sys
import time

CONFIG_PATH = os.path.join("station_state", "last_config.json")
AUTOSTART_FLAG = "--autostart"
MAX_PROGRAM_RESTARTS_PER_HOUR = 3

OK = "ok"
RESTART_READER = "restart_reader"
RESTART_PROGRAM = "restart_program"


class PowerRecovery:
    def __init__(self, null_after_s=120, max_reader_restarts=3, clock=time.time):
        self.null_after_s = null_after_s
        self.max_reader_restarts = max_reader_restarts
        self._clock = clock
        self.reports_power = False
        self.reader_restarts = 0
        self._last_good = clock()

    def on_power(self, voltage, current, power, energy):
        """Call from the power reader's callback."""
        if power is not None or voltage is not None:
            self.reports_power = True
        if power is not None and voltage is not None:
            self._last_good = self._clock()
            self.reader_restarts = 0

    def poll(self):
        """Call periodically; returns what the watchdog should do now."""
        if not self.reports_power:
            return OK
        now = self._clock()
        if now - self._last_good <= self.null_after_s:
            return OK
        # Give whatever we do next a full window to take effect before judging again.
        self._last_good = now
        if self.reader_restarts < self.max_reader_restarts:
            self.reader_restarts += 1
            return RESTART_READER
        self.reader_restarts = 0
        return RESTART_PROGRAM


# ---- saved settings, so a restarted program can start itself ---------------
def save_config(cfg, path=CONFIG_PATH):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    data = load_config(path) or {}
    data.update(cfg)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f)
    os.replace(tmp, path)  # atomic: never leave a half-written config


def load_config(path=CONFIG_PATH):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def allow_program_restart(now=None, path=CONFIG_PATH, limit=MAX_PROGRAM_RESTARTS_PER_HOUR):
    """True (and recorded) if fewer than `limit` program restarts happened in the last hour."""
    now = time.time() if now is None else now
    data = load_config(path) or {}
    recent = [t for t in data.get("program_restarts", []) if now - t < 3600]
    if len(recent) >= limit:
        return False
    save_config({"program_restarts": recent + [now]}, path)
    return True


def restart_program():
    """Replace this process with a fresh copy that starts itself. Does not return."""
    args = [a for a in sys.argv if a != AUTOSTART_FLAG]
    os.execv(sys.executable, [sys.executable] + args + [AUTOSTART_FLAG])
