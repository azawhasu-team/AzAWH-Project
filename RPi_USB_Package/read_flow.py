import time
import threading
from gpiozero import DigitalInputDevice


def _free_gpio_pin(pin):
    """Free a GPIO pin via lgpio in case a previous run left it claimed."""
    try:
        import lgpio
    except ImportError:
        return
    for chip in (4, 0):
        try:
            h = lgpio.gpiochip_open(chip)
            try:
                lgpio.gpio_free(h, pin)
            except Exception:
                pass
            lgpio.gpiochip_close(h)
        except Exception:
            pass


# YF-S201 style sensor: pulse frequency (Hz) = 7.5 * flow rate (L/min)
CALIBRATION_FACTOR = 7.5


class FlowMeterReader:
    """
    Reads a pulse-output flow meter (YF-S201 style) on GPIO 22.
        - Flow (L/min) = pulses_per_sec / 7.5
        - Volume (L)   = integral of flow over time (flow_lmin * dt / 60),
                         accumulated every sample. The callback's third value
                         is this integrated volume since start().
    Rising edges are counted (pull-down input), matching the bench script
    that was verified against the real sensor.
    """
    def __init__(self, pin=22, interval=1, callback=None):
        self.pin = pin
        self.interval = interval
        self.callback = callback
        self._running = False
        self._thread = None
        self._pulse_count = 0
        self._lock = threading.Lock()
        self._total_liters = 0.0

        # Free the pin first in case a previous run left it claimed
        _free_gpio_pin(pin)

        self.sensor = DigitalInputDevice(self.pin, pull_up=False)
        self.sensor.when_activated = self._pulse_callback

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
        """Stop the background polling thread and release the GPIO pin.

        Waits for the background thread to fully exit, then closes the
        gpiozero device so its edge-detection callback is unregistered before
        a restart claims the same pin again.
        """
        self._running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=self.interval + 3)
        try:
            self.sensor.close()
        except Exception:
            pass

    def _run(self):
        last_time = time.monotonic()
        while self._running:
            time.sleep(self.interval)
            now = time.monotonic()
            elapsed = now - last_time
            last_time = now

            # Take and reset the pulses seen since the last sample
            with self._lock:
                pulses = self._pulse_count
                self._pulse_count = 0

            # Use measured elapsed time (sleep() drifts)
            hz = pulses / elapsed if elapsed > 0 else 0.0
            flow_lmin = hz / CALIBRATION_FACTOR

            # Integrate flow (L/min) over the interval (s) -> litres
            self._total_liters += flow_lmin * elapsed / 60.0

            if self.callback:
                self.callback(flow_lmin, hz, self._total_liters)
