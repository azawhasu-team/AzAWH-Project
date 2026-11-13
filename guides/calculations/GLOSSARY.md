# Glossary

Every technical word used in this folder, in plain language. Alphabetical.

**Absolute humidity.** How many grams of water vapour are in one cubic metre of air. Unlike relative humidity, it does not change just because the air warms up or cools down. We use it to work out how much water entered the machine.

**Alert.** An email (and optional message) the system sends when a rule fires, such as "no data for 2 hours". An alert can be acknowledged ("I'm on it") or snoozed.

**Anemometer.** A sensor that measures air speed. Ours also measure the air's temperature and humidity.

**API.** The way the website asks the backend for data, like a waiter between kitchen and table. The site asks for "hourly numbers for station 1" and the backend answers.

**AWH.** Atmospheric Water Harvesting: making liquid water from the moisture in air.

**Backend.** The server program (written with FastAPI) that reads the raw readings, does the maths and answers the website's questions. It runs on Render.

**Balance.** The scale under the water tank. When its reading goes up, water was added to the tank.

**Calibration.** Checking a sensor against something known and correcting it. Example: pour exactly 5 litres through the flow meter and see what it says. If it says 20, its conversion factor is wrong.

**Counter wrap-around.** When a counter reaches its largest value and restarts at zero, like a car odometer going from 99999 to 00000. Our power meter's counter does this at 655.35 kWh.

**Dashboard.** The website that shows the stations' data, charts and alerts.

**Data quality score.** A number from 0 to 100 for how trustworthy a station's data was on a given day.

**Debounce.** Ignoring very fast, repeated flickers in a signal so that electrical noise is not counted as real events.

**Delta.** The difference between two consecutive readings. Most of our numbers are sums of deltas.

**Duct area.** The size of the opening the air flows through. Needed to turn air speed into the amount of air (and so the amount of water vapour) that entered.

**Energy (kWh).** Electricity used. One kilowatt-hour is 1,000 watts running for one hour. A house's electricity bill is in kWh.

**Energy counter.** The power meter's running total of kWh. It only goes up (until it wraps around).

**Energy per litre (kWh/L).** Electricity used for each litre of water made. Lower means more efficient.

**Firestore.** The cloud database where the Raspberry Pi writes every raw reading. The live website reads it directly.

**Flow meter.** A sensor in a water pipe with a small paddle wheel inside. The faster the water flows, the faster the wheel spins. See **pulse**.

**Harvesting efficiency.** Of all the water vapour that entered the machine in the air, the percentage that was caught as liquid water.

**Hertz (Hz).** "Per second". 30 Hz means 30 times each second. For the flow meter, it is the number of pulses per second.

**Hourly row.** One line of results for one clock hour (water, energy, temperature and so on). The website's charts are mostly built from these.

**Humidity (relative).** How full of water vapour the air is, as a percentage of the most it could hold at that temperature. 100% means saturated.

**Idle.** The machine is on but not making water. Its fans run and it draws about 0.19 kWh per hour.

**Integrate (integration).** Adding up a rate over time to get a total. Flow of 4 litres per minute for 15 seconds adds up to 1 litre.

**Jitter.** Small random up-and-down wobble in a measurement. A scale reading jumps by a few grams even when nothing changes.

**kWh.** See **Energy**.

**Litres per minute (L/min).** The unit for how fast water flows.

**Modbus.** A standard way for devices to talk over a cable. Our power meter uses it. The Pi asks it for a number and it answers.

**Noise floor.** The smallest change we treat as real. A weight change below it (25 g per 30 seconds) is assumed to be wobble, not water.

**Null.** "No value." The measurement was not taken or was thrown out. It is not the same as zero.

**Outlier.** One value far away from all the others, such as a single bin with a very different ratio.

**Pi (Raspberry Pi).** A small, cheap computer. One sits at each station, reads the sensors and uploads the readings.

**Postgres.** A database program. We keep a copy of the readings in it because it can search by time range much faster than Firestore. The live website does not use it yet.

**Power meter.** The sensor that measures electricity use. Ours (DEM730P) only reports the running kWh total.

**Pulse.** One short electrical signal. In the flow meter, the paddle wheel passes a magnet on each turn and the sensor sends one pulse. We count pulses to measure flow.

**Pump.** Moves water out of the tank. It runs when the weight passes a threshold, or on the testbed, when a water-level sensor says so.

**Ratio of sums.** To get an average ratio over a period, add up the tops and the bottoms first, then divide once (total energy ÷ total water). The alternative, averaging each hour's ratio, lets a near-zero hour distort everything.

**Reading.** One snapshot of all the sensors at one moment.

**Render.** The hosting service where the backend runs.

**Station.** One AWH machine with its sensors and Pi. The names look like `station_testbed_1@Powerplant`.

**Threshold.** A limit that triggers an action, such as "if the tank weighs more than 2,000 g, start the pump".

**Trapezoid.** A way to add up a changing rate: use the average of two neighbouring readings for the time between them.

**Upload.** The Pi sending a reading to the cloud. About every 30 seconds.

**UTC.** The world's standard time zone. We store all times in UTC. Arizona is UTC minus 7 hours, with no daylight saving.

**Velocity.** Air speed, in metres per second.

**Weight / mass added / mass lost.** The balance reading is the tank's weight. "Mass added" is the sum of the rises (water coming in), and "mass lost" is the sum of the falls (water pumped out).
