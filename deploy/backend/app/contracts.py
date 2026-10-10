"""The deployment contracts, in one place.

Everything the API knows about the two models lives here: which columns they
expect, which values are valid, and how a raw observation becomes a model row.

This file is the single implementation of CLAUDE.md sections 5.5 and 6.14. The
front end deliberately contains none of it, so there is no second copy that can
drift after a retrain.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass

import numpy as np
import pandas as pd

# --------------------------------------------------------------------- mushroom

# Valid categories (CLAUDE.md 5.1). "missing" is the category the preprocessor
# was fitted with for an unobserved value; "none" means the feature is absent and
# is real information. The two are never interchangeable.
MUSHROOM_CATEGORIES: dict[str, list[str]] = {
    "spore_print_color": ["black", "brown", "gray", "green", "pink", "purple", "white", "missing"],
    "gill_color": ["black", "brown", "buff", "gray", "green", "none", "orange", "pink",
                   "purple", "red", "white", "yellow", "missing"],
    "habitat": ["grasses", "heaths", "leaves", "meadows", "paths", "urban", "waste", "woods", "missing"],
    "season": ["spring", "summer", "autumn", "winter", "missing"],
    "ring_type": ["evanescent", "flaring", "grooved", "large", "movable", "none",
                  "pendant", "zone", "missing"],
    "cap_shape": ["bell", "conical", "convex", "flat", "others", "spherical", "sunken", "missing"],
    "stem_surface": ["fibrous", "grooves", "none", "scaly", "shiny", "silky",
                     "smooth", "sticky", "missing"],
}

MUSHROOM_NUMBERS = ["cap_diameter", "stem_height", "stem_width"]

# Training ranges, for a warning in the response (not a rejection: the model
# clamps nothing and an unusual mushroom is still a legitimate question).
MUSHROOM_RANGES = {
    "cap_diameter": (0.56, 57.4),
    "stem_height": (0.0, 32.4),
    "stem_width": (0.0, 102.5),
}


def normalise_mushroom(raw: dict) -> dict:
    """Clean one observation the way 02_data_preparation sections 2 to 5 do."""
    clean: dict[str, object] = {}

    for name in MUSHROOM_NUMBERS:
        value = raw.get(name)
        clean[name] = np.nan if value is None else float(value)

    for name, allowed in MUSHROOM_CATEGORIES.items():
        value = raw.get(name)
        if value is None or value == "":
            clean[name] = "missing"
        else:
            text = str(value).strip().lower()
            # An unknown category is not an error: the one-hot encoder was fitted
            # with handle_unknown="infrequent_if_exist" and the gradient boosting
            # pipeline maps it to NaN. Pass it through and say so in the response.
            clean[name] = text if text in allowed else text

    return clean


def apply_stem_rule(clean: dict) -> tuple[dict, int | None]:
    """Derive has_stem and the logical zeros (CLAUDE.md 5.1 step 5).

    "No stem" when the height or the width is 0, or the surface is "none".
    "Has a stem" when a measure is above 0, or the surface is a real surface.
    These never contradict each other in the data. For a stemless mushroom a
    missing measure is 0 and a missing surface is "none", because that is not
    an unknown value, it is a known absence.
    """
    height, width = clean["stem_height"], clean["stem_width"]
    surface = clean["stem_surface"]

    measured = [v for v in (height, width) if not _is_nan(v)]
    stemless = any(v == 0 for v in measured) or surface == "none"
    has_stem_signal = any(v > 0 for v in measured) or (
        surface not in ("none", "missing"))

    if stemless:
        has_stem = 0
        if _is_nan(clean["stem_height"]):
            clean["stem_height"] = 0.0
        if _is_nan(clean["stem_width"]):
            clean["stem_width"] = 0.0
        if surface == "missing":
            clean["stem_surface"] = "none"
    elif has_stem_signal:
        has_stem = 1
    else:
        has_stem = None  # nothing observed about the stem at all

    clean["has_stem"] = np.nan if has_stem is None else float(has_stem)
    return clean, has_stem


def _is_nan(value) -> bool:
    return value is None or (isinstance(value, float) and np.isnan(value))


def mushroom_row(raw: dict, input_columns: list[str]) -> tuple[pd.DataFrame, int | None, list[str]]:
    """Raw observation -> the one-row frame the pipeline expects."""
    clean = normalise_mushroom(raw)
    clean, has_stem = apply_stem_rule(clean)

    notes: list[str] = []
    for name, (low, high) in MUSHROOM_RANGES.items():
        value = clean[name]
        if not _is_nan(value) and not (low <= value <= high):
            notes.append(f"{name} {value} is outside the training range {low} to {high}")
    for name, allowed in MUSHROOM_CATEGORIES.items():
        if clean[name] not in allowed:
            notes.append(f"{name} '{clean[name]}' was not seen in training")

    return pd.DataFrame([clean])[input_columns], has_stem, notes


# --------------------------------------------------------------------- citi bike

# US federal holidays, via pandas, exactly as 02 section 5 does it.
from pandas.tseries.holiday import USFederalHolidayCalendar  # noqa: E402

_HOLIDAY_CACHE: pd.DatetimeIndex | None = None


def _federal_holidays() -> pd.DatetimeIndex:
    global _HOLIDAY_CACHE
    if _HOLIDAY_CACHE is None:
        _HOLIDAY_CACHE = USFederalHolidayCalendar().holidays(
            start="2013-01-01", end="2035-12-31")
    return _HOLIDAY_CACHE


@dataclass
class Calendar:
    weekday: int
    month: int
    day_of_year: int
    holiday: bool
    christmas_week: bool

    def as_dict(self) -> dict:
        return {
            "weekday": self.weekday,
            "month": self.month,
            "day_of_year": self.day_of_year,
            "holiday": self.holiday,
            "christmas_week": self.christmas_week,
        }


def calendar_for(day: dt.date) -> Calendar:
    """Calendar columns from a date (CLAUDE.md 6.14 step 2)."""
    stamp = pd.Timestamp(day)
    holiday = bool(stamp.normalize() in _federal_holidays())
    # 24 December to 1 January, the strongest calendar effect in the data, so it
    # is its own flag. As in 02_data_preparation.ipynb, the federal holidays in
    # that stretch (25 December, 1 January) are NOT christmas_week days: they are
    # already covered by `holiday`, and the model was trained that way.
    late_december = (stamp.month == 12 and stamp.day >= 24) or (
        stamp.month == 1 and stamp.day == 1)
    return Calendar(
        weekday=int(stamp.weekday()),          # 0 = Monday
        month=int(stamp.month),
        day_of_year=int(stamp.dayofyear),
        holiday=holiday,
        christmas_week=bool(late_december and not holiday),
    )


CITIBIKE_WEATHER = ["tmax_c", "tmin_c", "precipitation_mm",
                    "snowfall_mm", "snow_depth_mm", "wind_ms"]


def citibike_row(day: dt.date, weather: dict, input_columns: list[str]) -> tuple[pd.DataFrame, Calendar]:
    """Date plus a weather forecast -> the one-row frame the model expects."""
    cal = calendar_for(day)
    row: dict[str, object] = {
        "weekday": cal.weekday,
        "month": cal.month,
        "day_of_year": cal.day_of_year,
        "holiday": int(cal.holiday),
        "christmas_week": int(cal.christmas_week),
    }
    for name in CITIBIKE_WEATHER:
        value = weather.get(name)
        row[name] = np.nan if value is None else float(value)

    # Columns the ensemble needs but the deployed gradient boosting does not.
    # Built here so switching the deployed model needs no new code.
    row["thanksgiving"] = int(cal.holiday and cal.month == 11 and cal.weekday == 3)
    row["day_after_thanksgiving"] = int(cal.month == 11 and cal.weekday == 4
                                        and 23 <= day.day <= 29)
    row["christmas_day"] = int(cal.month == 12 and day.day == 25)
    row["new_years_day"] = int(cal.month == 1 and day.day == 1)
    row["snow_on_ground"] = int((row["snow_depth_mm"] or 0) > 0
                                if not _is_nan(row["snow_depth_mm"]) else 0)

    missing = [c for c in input_columns if c not in row]
    if missing:
        raise KeyError(f"the model wants columns this API does not build: {missing}")

    return pd.DataFrame([row])[input_columns], cal
