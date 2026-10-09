"""Observed weather for one day, from the station the Citi Bike model was trained on.

02_data_preparation.ipynb records its weather source as NOAA GHCN-Daily station
USW00094728 (New York, Central Park). Reading the same station here means the
numbers the page fills in are on the same scale as the training data, including
the unit conventions (tenths of a degree, tenths of a millimetre).

This is observed weather with a publication lag of a few days, so it is a
convenience for trying the model on real days, not a forecast service. The page
always lets the user type their own numbers.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import logging
import urllib.error
import urllib.request

log = logging.getLogger("ggi.weather")

STATION = "USW00094728"
URL = ("https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily"
       f"/access/{STATION}.csv")

# One year of rows is cached in memory per process. The file is a few MB and the
# free host sleeps when idle, so re-fetching once per wake is acceptable.
_cache: dict[int, dict[str, dict]] = {}


class WeatherUnavailable(RuntimeError):
    pass


def _fetch_year(year: int) -> dict[str, dict]:
    if year in _cache:
        return _cache[year]

    log.info("fetching NOAA station %s", STATION)
    try:
        with urllib.request.urlopen(URL, timeout=30) as response:
            text = response.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, TimeoutError) as error:
        raise WeatherUnavailable(f"NOAA is not reachable: {error}") from error

    rows: dict[str, dict] = {}
    for row in csv.DictReader(io.StringIO(text)):
        date = row.get("DATE", "")
        if date.startswith(str(year)):
            rows[date] = row

    _cache[year] = rows
    return rows


def _tenths(row: dict, key: str) -> float | None:
    """GHCN stores TMAX/TMIN in tenths of a degree C and PRCP/SNWD in tenths of mm."""
    raw = row.get(key, "")
    if raw is None or raw == "":
        return None
    try:
        return float(raw) / 10.0
    except ValueError:
        return None


def observed_weather(day: dt.date) -> dict:
    rows = _fetch_year(day.year)
    key = day.isoformat()
    if key not in rows:
        raise WeatherUnavailable(
            f"no observation for {key} at station {STATION}. NOAA publishes a few "
            "days behind, and future dates never exist - type a forecast instead.")

    row = rows[key]
    # SNOW (snowfall) and AWND (average wind) are whole units, not tenths.
    snowfall = row.get("SNOW") or None
    wind = row.get("AWND") or None

    return {
        "date": key,
        "station": STATION,
        "tmax_c": _tenths(row, "TMAX"),
        "tmin_c": _tenths(row, "TMIN"),
        "precipitation_mm": _tenths(row, "PRCP"),
        "snowfall_mm": float(snowfall) if snowfall else 0.0,
        "snow_depth_mm": _tenths(row, "SNWD"),
        "wind_ms": float(wind) / 10.0 if wind else None,
        "source": "NOAA GHCN-Daily, observed",
    }
