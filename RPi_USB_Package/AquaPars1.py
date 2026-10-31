"""
Main process for an AWH station: reads all sensors (balance, power meter,
flow meter, intake/outtake anemometers), drives the pump, saves CSV rows,
and uploads readings to the cloud. Wires everything into the Tkinter UI.
"""

import os
import sys
import threading
import time
import csv
from datetime import datetime, timedelta

from intake_anemometer import intake_anemometer
from outtake_anemometer import outtake_anemometer
from pump_controller import PumpController
from read_balance import BalanceSerialReader, parse_balance_line
from read_power import PowerMeterReader
from read_flow import FlowMeterReader
from awh_ui_layout import AWHControlPanel
from cloud_uploader import CloudUploader, setup_file_logging
from auto_recovery import (
    AUTOSTART_FLAG, PowerRecovery, load_config, save_config, allow_program_restart, restart_program, RESTART_READER, RESTART_PROGRAM,
)

STATION_NAME = "station_AquaPars #2 @Power Station, Tempe"
CLOUD_URL = "https://us-central1-awh-project-460421.cloudfunctions.net/receive_data"

# Cloud uploads follow the sensor interval chosen in the control UI (self.interval).
# The flow meter always samples once a second (its volume is integrated from these
# samples, so a coarser rate would lose accuracy). Every other sensor follows the
# sensor interval chosen in the control UI (self.interval).
FLOW_SAMPLE_SEC = 1
# Cap on buffered 1 s samples (1 hour) so a long sensor interval can't grow memory or the upload.
MAX_FLOW_SAMPLES_PER_UPLOAD = 3600

READER_STALE_SEC = 45        # if no new data for this many seconds, restart that reader
POWER_NULL_RESTART_SEC = 120  # power/voltage missing this long (on a meter that normally reports them) -> auto-recover
WATCHDOG_POLL_SEC = 5        # how often the watchdog checks staleness


class StationController:
    """
    Coordinates every sensor reader, the pump, CSV logging, and cloud upload
    for one AWH station.
    - Balance from read_balance.BalanceSerialReader
    - Power meter from read_power.PowerMeterReader
    - Flow meter from read_flow.FlowMeterReader
    - Intake/Outtake anemometers
    - Pump control is delegated to PumpController
    """

    def __init__(self, callback, csv_dir, update_pump_status_callback, pump: PumpController):
        self.callback = callback
        self.csv_dir = csv_dir
        self.csv_files = []
        self.sent_files = set()
        self.running = False

        self.interval = 10
        self.file_saving_interval_minutes = 1
        self.start_time = None
        self.last_file_time = datetime.now()

        # Non-blocking, durable uploads: readings are queued on disk and retried,
        # so a network outage can't stall CSV logging or lose data.
        self.uploader = CloudUploader(CLOUD_URL, os.path.join("station_state", "upload_queue.sqlite3"))
        self._last_cloud_upload_ts = 0.0  # 0 => first call uploads immediately

        self.current_weight = None
        self.balance_line = None
        self.power_tuple = None
        self.flow_tuple = None
        # Every 1 s flow sample since the last cloud upload: (flow_lmin, hz)
        self._flow_window = []
        self.power_recovery = PowerRecovery(null_after_s=POWER_NULL_RESTART_SEC)
        self._flow_lock = threading.Lock()
        self.intake_air_data = (None, None, None, "m/s")
        self.outtake_air_data = (None, None, None, "m/s")

        now_ts = time.time()
        self._last_balance_ts = now_ts
        self._last_power_ts = now_ts
        self._last_flow_ts = now_ts

        self.pump = pump
        self.pump.set_status_callback(update_pump_status_callback)

        # Station identity — can be overridden via the UI before start_reading()
        self.station_name = STATION_NAME

        self.create_new_csv_file()

        # Readers are created but only started in start_reading()
        self.balance_reader = None
        self.power_reader = None
        self.flow_reader = None

    # ---------- Reader (Re)Starters ----------
    def _start_balance_reader(self):
        try:
            self.balance_reader = BalanceSerialReader(callback=self._on_balance_line, interval=self.interval)
            self.balance_reader.start()
            self._last_balance_ts = time.time()
            print("[Watchdog] Balance reader started.")
        except Exception as e:
            print(f"[Watchdog] Failed to start balance reader: {e}")

    def _start_power_reader(self):
        try:
            self.power_reader = PowerMeterReader(callback=self._on_power_data, interval=self.interval)
            self.power_reader.start()
            self._last_power_ts = time.time()
            print("[Watchdog] Power reader started.")
        except Exception as e:
            print(f"[Watchdog] Failed to start power reader: {e}")

    def _start_flow_reader(self):
        try:
            self.flow_reader = FlowMeterReader(pin=22, interval=FLOW_SAMPLE_SEC, callback=self._on_flow_data)
            self.flow_reader.start()
            self._last_flow_ts = time.time()
            print("[Watchdog] Flow reader started.")
        except Exception as e:
            print(f"[Watchdog] Failed to start flow reader: {e}")

    def _restart_reader(self, which: str):
        """Best-effort stop + fresh re-create for a given reader ('balance'|'power'|'flow')."""
        try:
            if which == "balance" and self.balance_reader:
                try: self.balance_reader.stop()
                except: pass
                self.balance_reader = None
                print("[Watchdog] Balance reader stopped.")
                self._start_balance_reader()

            elif which == "power" and self.power_reader:
                try: self.power_reader.stop()
                except: pass
                self.power_reader = None
                print("[Watchdog] Power reader stopped.")
                self._start_power_reader()

            elif which == "flow" and self.flow_reader:
                try: self.flow_reader.stop()
                except: pass
                self.flow_reader = None
                print("[Watchdog] Flow reader stopped.")
                self._start_flow_reader()
        except Exception as e:
            print(f"[Watchdog] Failed to restart {which} reader: {e}")

    # ---------- Callbacks from readers ----------
    def _on_balance_line(self, line: str):
        # Receiving any line means the connection is alive, regardless of whether it parses
        self._last_balance_ts = time.time()
        parsed = parse_balance_line(line)
        if parsed:
            ST, GS, check, weight, unit = parsed
            self.current_weight = weight
            self.balance_line = (ST, GS, check, weight, unit)
            try:
                self.pump.auto_check(weight)
            except Exception as e:
                print(f"[Pump] auto_check error: {e}")

    def _on_power_data(self, V, A, W, Wh):
        self._last_power_ts = time.time()
        self.power_tuple = (V, A, W, Wh)
        self.power_recovery.on_power(V, A, W, Wh)

    def _on_flow_data(self, flow_lmin, hz, total_liters):
        self._last_flow_ts = time.time()
        self.flow_tuple = (flow_lmin, hz, total_liters)
        with self._flow_lock:
            self._flow_window.append((flow_lmin, hz))
            del self._flow_window[:-MAX_FLOW_SAMPLES_PER_UPLOAD]  # bound memory if the interval is long

    def _drain_flow_window(self):
        """Per-second flow samples since the last upload, oldest first; clears the buffer."""
        with self._flow_lock:
            window, self._flow_window = self._flow_window, []
        return window

    # ---------- CSV ----------
    def create_new_csv_file(self):
        os.makedirs(self.csv_dir, exist_ok=True)
        now = datetime.now()
        file_name = now.strftime('%Y%m%d_%H%M') + '_measure_data.csv'
        file_path = os.path.join(self.csv_dir, file_name)
        self.csv_file = open(file_path, 'a', newline='')
        self.csv_writer = csv.writer(self.csv_file)
        self.csv_writer.writerow([
            'Date', 'Time', 'ST', 'GS', 'Check', 'Weight', 'Unit', 'Pump-Status',
            'Voltage (V)', 'Current (A)', 'Power (W)', 'Energy (Wh)', 'Operation Time',
            'Flow (L/min)', 'Frequency (Hz)', 'Total Flow (L)',
            'Intake Air Temperature (°C)', 'Intake Air Velocity', 'Intake Air Humidity (%)',
            'Outtake Air Temperature (°C)', 'Outtake Air Velocity', 'Outtake Air Humidity (% )'
        ])
        self.csv_file.flush()
        self.csv_files.append(file_path)
        print(f"[CSV] New file created: {file_path}")

    # ---------- Lifecycle ----------
    def start_reading(self):
        if self.running:
            return
        self.running = True
        self.start_time = time.time()

        # Remember these settings so an automatic program restart can start itself.
        try:
            save_config({
                "interval": self.interval,
                "file_minutes": self.file_saving_interval_minutes,
                "threshold_g": self.pump.threshold_g,
                "pump_duration_min": self.pump.duration_min,
            })
        except Exception as e:
            print(f"[Recovery] Could not save run settings: {e}")
        self.power_recovery = PowerRecovery(null_after_s=POWER_NULL_RESTART_SEC)

        self.uploader.start()
        self._start_balance_reader()
        self._start_power_reader()
        self._start_flow_reader()

        threading.Thread(target=self.save_data_to_csv_interval, daemon=True).start()
        threading.Thread(target=self.read_intake_air_data, daemon=True).start()
        threading.Thread(target=self.read_outtake_air_data, daemon=True).start()
        threading.Thread(target=self._watchdog_loop, daemon=True).start()

    def stop_reading(self):
        self.running = False
        try: self.balance_reader.stop()
        except: pass
        try: self.power_reader.stop()
        except: pass
        try: self.flow_reader.stop()
        except: pass
        try: self.csv_file.close()
        except: pass
        try: self.uploader.stop()
        except: pass
        try: self.pump.cleanup()
        except: pass

    # ---------- Settings ----------
    def set_interval(self, interval):
        try:
            self.interval = int(interval)
            return True
        except ValueError:
            return False

    def set_file_saving_interval(self, interval):
        try:
            self.file_saving_interval_minutes = int(interval)
            return True
        except ValueError:
            return False

    def set_threshold(self, threshold):
        try:
            self.pump.set_threshold(float(threshold))
            return True
        except ValueError:
            return False

    def set_pump_duration(self, duration):
        try:
            self.pump.set_duration(float(duration))
            return True
        except ValueError:
            return False

    def set_station_name(self, station_name):
        """Set the station name for cloud uploads (called from UI before start)."""
        self.station_name = station_name
        print(f"[Station] Station set to: {station_name}")

    # ---------- Save / Cloud ----------
    def _operation_time_hms(self):
        elapsed = int(time.time() - self.start_time)
        h = elapsed // 3600
        m = (elapsed % 3600) // 60
        s = elapsed % 60
        return f"{h:02}:{m:02}:{s:02}"

    def save_data(self):
        now = datetime.now()
        now_ts = time.time()
        date_str = now.strftime('%Y-%m-%d')
        time_str = now.strftime('%H:%M:%S')
        op_time = self._operation_time_hms()

        # Unpack each sensor independently; fall back to None if not yet received
        if self.balance_line:
            ST, GS, check, weight, unit = self.balance_line
        else:
            ST, GS, check, weight, unit = None, None, None, None, None
            print("[Save] WARNING: No balance data yet")

        power_age_sec = now_ts - self._last_power_ts
        if self.power_tuple and power_age_sec <= READER_STALE_SEC:
            V, A, W, Wh = self.power_tuple
        elif self.power_tuple:
            # Had a reading before, but it's too old to trust — send None instead
            # of silently re-uploading a frozen number. A stuck power reader once
            # kept re-sending the same energy value for hours, which looked like
            # real flat consumption until someone noticed it wasn't updating.
            V, A, W, Wh = None, None, None, None
            print(f"[Save] WARNING: Power meter data is stale ({power_age_sec:.0f}s since last reading) — omitting from upload")
        else:
            V, A, W, Wh = None, None, None, None
            print("[Save] WARNING: No power meter data yet")

        if self.flow_tuple:
            flow_lmin, hz, total_liters = self.flow_tuple
        else:
            flow_lmin, hz, total_liters = None, None, None
            print("[Save] WARNING: No flow meter data yet")

        t_in, v_in, h_in, v_unit_in = self.intake_air_data
        t_out, v_out, h_out, v_unit_out = self.outtake_air_data
        pump_status_bit = 1 if self.pump.is_on else 0

        # Row is written every second regardless of which sensors currently have data
        self.csv_writer.writerow([
            date_str, time_str, ST, GS, check, weight, unit, pump_status_bit,
            V, A, W, Wh, op_time,
            flow_lmin, hz, total_liters,
            t_in, f"{v_in} {v_unit_in}" if v_in is not None else None, h_in,
            t_out, f"{v_out} {v_unit_out}" if v_out is not None else None, h_out
        ])
        self.csv_file.flush()

        if (now_ts - self._last_cloud_upload_ts) >= self.interval:
            # Flow is measured every second; send the mean over this interval as
            # flow_lmin/flow_hz (more accurate than a single instant) plus every
            # 1 s sample, oldest first, ending at this row's timestamp.
            flow_window = self._drain_flow_window()
            if flow_window:
                flow_lmin = round(sum(f for f, _ in flow_window) / len(flow_window), 4)
                hz = round(sum(h for _, h in flow_window) / len(flow_window), 3)
            self.uploader.submit(self.station_name, {
                "temperature": t_in, "humidity": h_in, "velocity": v_in, "unit": v_unit_in,
                "outtake_temperature": t_out, "outtake_humidity": h_out, "outtake_velocity": v_out, "outtake_unit": v_unit_out,
                "voltage": V, "current": A, "power": W, "energy": Wh,
                "weight": weight, "pump_status": pump_status_bit,
                "flow_lmin": flow_lmin, "flow_hz": hz, "flow_total": total_liters,
                "flow_samples_lmin": [round(f, 3) for f, _ in flow_window],
            })
            self._last_cloud_upload_ts = now_ts

        if self.callback:
            self.callback(",".join(map(str, [
                date_str, time_str, ST, GS, check, weight, unit, pump_status_bit,
                V, A, W, Wh, op_time,
                flow_lmin, hz, total_liters,
                t_in, v_in, h_in, v_unit_in,
                t_out, v_out, h_out, v_unit_out
            ])))

    def save_data_to_csv_interval(self):
        print("[CSV] Save loop started — writing every 1 second.")
        while self.running:
            current_time = datetime.now()
            if current_time - self.last_file_time >= timedelta(minutes=self.file_saving_interval_minutes):
                try: self.csv_file.close()
                except: pass
                self.create_new_csv_file()
                self.last_file_time = current_time
            self.save_data()
            time.sleep(1)

    # ---------- Watchdog ----------
    def _watchdog_loop(self):
        """Restarts a reader if it hasn't produced data for READER_STALE_SEC seconds."""
        while self.running:
            try:
                now_ts = time.time()

                if (now_ts - self._last_balance_ts) > READER_STALE_SEC:
                    print("[Watchdog] Balance reader stale. Attempting restart...")
                    self._restart_reader("balance")
                    time.sleep(2)  # give the device a moment before checking the next reader

                if (now_ts - self._last_power_ts) > READER_STALE_SEC:
                    print("[Watchdog] Power reader stale. Attempting restart...")
                    self._restart_reader("power")
                    time.sleep(2)

                if (now_ts - self._last_flow_ts) > READER_STALE_SEC:
                    print("[Watchdog] Flow reader stale. Attempting restart...")
                    self._restart_reader("flow")
                    time.sleep(2)

                action = self.power_recovery.poll()
                if action == RESTART_READER:
                    print("[Recovery] Power/voltage missing. Restarting the power reader...")
                    self._restart_reader("power")
                elif action == RESTART_PROGRAM:
                    self._restart_whole_program()

            except Exception as e:
                print(f"[Watchdog] Error: {e}")
            time.sleep(WATCHDOG_POLL_SEC)

    def _restart_whole_program(self):
        """Last resort when restarting the power reader did not bring power back."""
        if not allow_program_restart():
            print("[Recovery] Already restarted the program 3 times this hour; not restarting again.")
            return
        print("[Recovery] Power still missing after reader restarts. Restarting the whole program...")
        self.stop_reading()
        restart_program()  # replaces this process; the new one auto-starts with the saved settings

    # ---------- Anemometers ----------
    def read_intake_air_data(self):
        while self.running:
            try:
                h, t, v, unit = intake_anemometer()
                self.intake_air_data = (t, max(0, v), h, unit)
            except Exception as e:
                # USB sensor disappearing is expected in the field; log and retry next loop
                print(f"[Intake] Error: {e}")
            time.sleep(self.interval)

    def read_outtake_air_data(self):
        while self.running:
            try:
                h, t, v, unit = outtake_anemometer()
                self.outtake_air_data = (t, max(0, v), h, unit)
            except Exception as e:
                print(f"[Outtake] Error: {e}")
            time.sleep(self.interval)


def main():
    setup_file_logging("logs")
    csv_dir = 'measure_data'
    os.makedirs(csv_dir, exist_ok=True)

    pump = PumpController(pin=17, status_callback=None, default_duration_min=2, initial_threshold_g=0)
    controller = StationController(
        callback=None,
        csv_dir=csv_dir,
        update_pump_status_callback=None,
        pump=pump
    )

    app = AWHControlPanel(controller=controller, backend_url="https://az-awh-monitoring-system.onrender.com")

    controller.callback = app.update_status
    controller.pump.set_status_callback(app.update_pump_status)

    if AUTOSTART_FLAG in sys.argv:
        app.after(3000, app.auto_start, load_config())

    app.mainloop()
    try:
        controller.csv_file.close()
    except:
        pass


if __name__ == "__main__":
    main()
