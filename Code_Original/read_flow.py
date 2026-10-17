# read_flow.py (gpiozero version) for SMWF-0420A
import time
import threading
from gpiozero import Button

class FlowMeterReader:
    """
    Reads pulse-output flow meter using gpiozero Button.
    SMWF-0420A spec:
        - K ≈ 2800 pulses/L
        - Flow (L/min) = pulses_per_sec / 46.7
        - Volume (L)   = total_pulses / 2800
    """
    def __init__(self, pin=27, interval=1, callback=None):
        self.pin = pin
        self.interval = interval
        self.callback = callback
        self._running = False
        self._thread = None
        self._pulse_count = 0
        self._lock = threading.Lock()

        # Use pull_up=True for open-collector output
        self.sensor = Button(self.pin, pull_up=True)
        self.sensor.when_pressed = self._pulse_callback

    def _pulse_callback(self):
        with self._lock:
            self._pulse_count += 1

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False

    def _run(self):
        last_count = 0
        last_time = time.monotonic()
        while self._running:
            time.sleep(self.interval)
            now = time.monotonic()
            elapsed = now - last_time
            last_time = now
            with self._lock:
                current_count = self._pulse_count
            pulses = current_count - last_count
            last_count = current_count

            # Frequency in Hz, using measured elapsed time (sleep() drifts)
            hz = pulses / elapsed if elapsed > 0 else 0.0

            # Flow in L/min
            flow_lmin = hz / 46.7

            # Total volume in liters
            total_liters = current_count / 2800.0

            if self.callback:
                self.callback(flow_lmin, hz, total_liters)
