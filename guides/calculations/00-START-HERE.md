# Start here: AzAWH in plain words

You do not need any engineering background to read this page. It explains what
the system does, where every number on the website comes from, and which numbers
to trust. Words in **bold** are explained in the [glossary](GLOSSARY.md).
When you are ready for the details, go to the [README](README.md).

## 1. What is this project?

An **AWH station** is a machine that makes drinking water out of air. Fans pull
warm air in, the machine cools it so the moisture turns into liquid, and the
water drips into a tank. We have built stations like this at Arizona State
University and we watch them from a website.

This repository is the software that:
1. **Collects** measurements from each machine (a small computer next to it reads the sensors).
2. **Stores** them in the cloud.
3. **Calculates** useful numbers from them: how much water was made, how much electricity it used, how efficient it was.
4. **Shows** them on a website and **emails the team** when something looks wrong.

## 2. What is measured on a station?

| Sensor | What it measures | In everyday terms |
|---|---|---|
| Intake anemometer | Temperature, humidity and air speed of the air going **in** | How warm, how damp and how fast is the air the machine is breathing |
| Outtake anemometer | The same, for the air coming **out** | Did the machine take moisture out of the air? |
| **Balance** (scale) | The weight of the water tank | When the tank gets heavier, water was made |
| **Flow meter** | Water passing through a pipe | A second way to measure the water, by flow instead of weight |
| **Power meter** | Total electricity used so far (a running total) | Like the electricity meter on a house |
| Pump | Moves water out of the tank | Turned on and off by a rule or a level sensor |

A small computer (a **Raspberry Pi**) reads all of these every few seconds and
sends the readings to the cloud about every 30 seconds.

## 3. The one idea that explains most numbers

> **Almost every number on the website is the difference between two readings,
> added up.**

- The scale says 3,000 g, then 3,040 g. The tank gained 40 g, so **40 g of water** was made.
- The power meter says 100.00 kWh, then 100.02 kWh. The machine used **0.02 kWh** in that time.

We add these small differences up for each hour, then for each day. That is why
we never use a single reading by itself: a reading only becomes useful when we
compare it with the one before.

## 4. Where each website number comes from

| What you see | What it means | How it is worked out (short version) |
|---|---|---|
| **Water produced** (from the balance) | Litres of water made | Add up the times the tank got heavier. Ignore tiny changes, because a scale always wobbles a little. |
| **Water produced** (from the flow meter) | Litres of water that passed through the pipe | The flow meter reports how fast water flows. Speed × time = litres. |
| **Energy used** | kWh of electricity | Add up the increases of the power meter's running total. |
| **Energy per litre** (kWh/L) | How much electricity each litre cost | Total energy ÷ total water. Lower is better. |
| **Harvesting efficiency** | Of all the water vapour that flowed into the machine, the share that was caught as liquid | Water caught ÷ water that entered in the air (worked out from temperature, humidity, air speed and the size of the duct). |
| **Data quality score** | Can I trust this station's data today? | Starts at 100 and loses points for missing hours, frozen sensors and impossible values. |
| **Alerts** | Something needs attention | Rules such as "no data for 2 hours" or "the machine seems off". They send an email. |

## 5. The path of a reading

```
Sensor ──► Raspberry Pi ──► Cloud database ──► Backend (does the maths) ──► Website
 (a wire     (turns the       (stores every     (hourly water, energy,       (charts, tiles,
  signal)     signal into      raw reading)      efficiency, alerts)          downloads)
              a number)
```

Each step has its own file in this folder:

| Step | File |
|---|---|
| Sensor to Raspberry Pi | [01-edge-pi.md](01-edge-pi.md) |
| Pi to cloud storage | [02-ingestion-and-storage.md](02-ingestion-and-storage.md) |
| The hourly numbers | [03-backend-hourly.md](03-backend-hourly.md) |
| Everything else the backend does | [04-backend-other.md](04-backend-other.md) |
| What the website recalculates | [05-dashboard.md](05-dashboard.md) |

## 6. Which numbers to trust (as of November 2026)

1. **The balance is the safer measure of water.** The flow meter on the field testbed reads about **4 to 5 times** more than the balance shows. The cause is not known yet (a wrong conversion factor, electrical noise or the plumbing). Treat the flow meter's litres as "water that was pumped", not as "water that was made".
2. **"Off" includes "idling".** If the machine uses less than 0.2 kWh per hour, the website treats it as off. Fans alone use about 0.19 kWh per hour, so a machine that is only running its fans counts as off.
3. **The electricity counter wraps around.** It can only hold up to 655.35 kWh and then starts again from zero, like a car odometer. It was at about 472 kWh in November 2026. The software copes, but the raw line on a chart will drop.
4. **Missing means missing.** A blank in a chart (called `null` in the code) means "not measured". It is never the same as zero.
5. **Times.** The system stores everything in UTC. The website shows Arizona time, which is 7 hours behind UTC and never changes for daylight saving.

## 7. How to read the other files

- Each file begins with a short "In plain words" note, then goes into detail.
- Every rule lists **what it does, why it exists, and a worked example**.
- If a word is new to you, look it up in the [glossary](GLOSSARY.md).
- The code is the final authority. If you change a rule in the code, change this folder too.
