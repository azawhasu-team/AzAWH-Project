import json

import auto_recovery as ar


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def make(**kw):
    c = Clock()
    return ar.PowerRecovery(null_after_s=120, max_reader_restarts=2, clock=c, **kw), c


def test_meter_that_never_reports_power_is_not_a_power_fault():
    # DEM730P: energy only, voltage/power always None by design. As long as its
    # energy keeps counting, that is healthy. (A frozen energy value is a fault:
    # see the energy-stuck tests below.)
    r, c = make()
    for i in range(50):
        r.on_power(None, None, None, 257.65 + i * 0.01)
        c.t += 60
        assert r.poll() == ar.OK


def test_power_going_missing_restarts_reader_then_program():
    r, c = make()
    r.on_power(230.0, 5.0, 1100.0, 10.0)      # this meter does report power
    c.t += 100
    assert r.poll() == ar.OK                   # under the threshold
    r.on_power(None, None, None, 10.1)         # now it reports nothing useful
    c.t += 121
    assert r.poll() == ar.RESTART_READER
    c.t += 121
    assert r.poll() == ar.RESTART_READER
    c.t += 121
    assert r.poll() == ar.RESTART_PROGRAM      # reader restarts did not help
    c.t += 30
    assert r.poll() == ar.OK                   # gets a fresh window after acting


def test_good_reading_resets_the_escalation():
    r, c = make()
    r.on_power(230.0, 5.0, 1100.0, 10.0)
    c.t += 121
    assert r.poll() == ar.RESTART_READER
    r.on_power(230.0, 5.0, 1100.0, 10.2)      # recovered
    c.t += 121
    assert r.poll() == ar.RESTART_READER       # counts from 1 again, not escalated
    assert r.reader_restarts == 1


def test_program_restarts_are_capped_per_hour(tmp_path):
    path = str(tmp_path / "cfg.json")
    assert ar.allow_program_restart(now=1000, path=path)
    assert ar.allow_program_restart(now=1100, path=path)
    assert ar.allow_program_restart(now=1200, path=path)
    assert not ar.allow_program_restart(now=1300, path=path)       # 4th within the hour
    assert ar.allow_program_restart(now=1000 + 3601, path=path)    # old ones age out


def test_config_round_trip_keeps_restart_history(tmp_path):
    path = str(tmp_path / "sub" / "cfg.json")
    ar.allow_program_restart(now=1000, path=path)
    ar.save_config({"interval": 10, "threshold_g": 2000.0}, path)
    cfg = ar.load_config(path)
    assert cfg["interval"] == 10 and cfg["program_restarts"] == [1000]
    assert ar.load_config(str(tmp_path / "missing.json")) is None
    (tmp_path / "bad.json").write_text("{not json")
    assert ar.load_config(str(tmp_path / "bad.json")) is None


# ---- energy stuck (the DEM730P failure: Pi keeps sending the last value) -----
def make_energy(running=True, **kw):
    c = Clock()
    state = {"running": running}
    r = ar.PowerRecovery(null_after_s=120, max_reader_restarts=2, clock=c, energy_stuck_s=600,
                         is_running=lambda: state["running"], **kw)
    return r, c, state


def test_energy_only_meter_that_keeps_counting_is_ok():
    r, c, _ = make_energy()
    for i in range(30):
        c.t += 60
        r.on_power(None, None, None, 100.0 + i * 0.01)
        assert r.poll() == ar.OK


def test_energy_frozen_while_running_restarts_reader_then_program():
    r, c, _ = make_energy()
    r.on_power(None, None, None, 231.94)
    actions = []
    for _ in range(40):
        c.t += 60
        r.on_power(None, None, None, 231.94)  # same stale value every time
        a = r.poll()
        if a != ar.OK:
            actions.append(a)
    assert actions[:3] == [ar.RESTART_READER, ar.RESTART_READER, ar.RESTART_PROGRAM]


def test_energy_flat_while_station_off_is_not_a_fault():
    r, c, state = make_energy(running=False)
    r.on_power(None, None, None, 231.94)
    for _ in range(60):
        c.t += 60
        r.on_power(None, None, None, 231.94)
        assert r.poll() == ar.OK


def test_energy_missing_while_running_is_a_fault():
    r, c, _ = make_energy()
    r.on_power(None, None, None, 50.0)
    out = []
    for _ in range(15):
        c.t += 60
        r.on_power(None, None, None, None)
        out.append(r.poll())
    assert ar.RESTART_READER in out


def test_energy_recovery_resets_the_ladder():
    r, c, _ = make_energy()
    r.on_power(None, None, None, 1.0)
    c.t += 700
    assert r.poll() == ar.RESTART_READER
    r.on_power(None, None, None, 1.5)  # counting again
    assert r.reader_restarts == 0
