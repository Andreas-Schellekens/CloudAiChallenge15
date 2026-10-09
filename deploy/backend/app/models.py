"""Loading the deployed models and turning a request into a prediction.

Both models and their JSON side-cars are committed to the repository, so the
container needs no download at start-up and the API cannot silently serve a
different model than the one the comparison notebook chose.

The twelve-month level for Citi Bike comes from Data/citibike_monthly.csv, which
02_data_preparation.ipynb produces. It is the one input that is not a model file.
If it is absent the Citi Bike endpoint reports that clearly instead of inventing
a number.
"""

from __future__ import annotations

import datetime as dt
import json
import logging
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from . import contracts

log = logging.getLogger("ggi.models")

# deploy/backend/app/models.py -> repository root
ROOT = Path(__file__).resolve().parents[3]

MUSHROOM_DIR = ROOT / "SecondaryMushroom" / "models"
CITIBIKE_DIR = ROOT / "NYCCitiBikeSystemData" / "models"

# The twelve-month level file is looked for in models/ first and in Data/ second.
#
# 02_data_preparation.ipynb writes it to Data/, but Data/ is git-ignored, so a
# file that only lives there can never reach a deployment. The copy in models/ is
# the shipped artefact: small, committed, and next to the model it belongs to.
# Keeping the Data/ fallback means a freshly run notebook also works locally
# without copying anything by hand.
CITIBIKE_MONTHLY_CANDIDATES = [
    CITIBIKE_DIR / "citibike_monthly.csv",
    ROOT / "NYCCitiBikeSystemData" / "Data" / "citibike_monthly.csv",
]


class ModelUnavailable(RuntimeError):
    """Raised when an endpoint cannot serve because an artefact is missing."""


class MushroomModel:
    name = "mushroom"

    def __init__(self) -> None:
        self.meta = json.loads((MUSHROOM_DIR / "mushroom_gradient_boosting.json").read_text())
        self.pipeline = joblib.load(MUSHROOM_DIR / "mushroom_gradient_boosting.joblib")
        self.threshold = float(self.meta["threshold"])
        self.columns = list(self.meta["input_columns"])
        log.info("mushroom model loaded, threshold %.3f", self.threshold)

    def predict(self, raw: dict) -> dict:
        row, has_stem, notes = contracts.mushroom_row(raw, self.columns)

        # Never predict(): it uses 0.5, and the deployed threshold is 0.139.
        probability = float(self.pipeline.predict_proba(row)[0, 1])
        poisonous = probability >= self.threshold

        return {
            "probability_poisonous": round(probability, 6),
            "threshold": self.threshold,
            "verdict": "poisonous" if poisonous else "edible",
            "has_stem": has_stem,
            "model": self.meta.get("model", "gradient boosting (tuned)"),
            "notebook": self.meta.get("notebook"),
            "notes": notes,
        }


class CitibikeModel:
    name = "citibike"

    def __init__(self) -> None:
        self.meta = json.loads((CITIBIKE_DIR / "citibike_gradient_boosting.json").read_text())
        self.pipeline = joblib.load(CITIBIKE_DIR / "citibike_gradient_boosting.joblib")
        self.columns = list(self.meta["input_columns"])
        self.monthly = self._load_monthly()
        log.info("citibike model loaded, %s monthly levels",
                 "no" if self.monthly is None else len(self.monthly))

    @staticmethod
    def _load_monthly() -> pd.Series | None:
        path = next((p for p in CITIBIKE_MONTHLY_CANDIDATES if p.is_file()), None)
        if path is None:
            log.warning("no citibike_monthly.csv in %s: the citibike endpoint cannot serve",
                        " or ".join(str(p.parent) for p in CITIBIKE_MONTHLY_CANDIDATES))
            return None
        frame = pd.read_csv(path, index_col=0, parse_dates=[0])
        if "level_12m" not in frame.columns:
            log.warning("%s has no level_12m column", path)
            return None
        log.info("twelve-month levels read from %s", path)
        return frame["level_12m"].dropna()

    @property
    def available(self) -> bool:
        return self.monthly is not None and not self.monthly.empty

    def level_for(self, day: dt.date) -> tuple[float, str]:
        """The twelve-month level for the month of this day.

        Months after the last published one fall back to the most recent level.
        That is the honest behaviour for a forecast about the future: the level
        is a trailing average, so it simply has not moved yet.
        """
        if not self.available:
            raise ModelUnavailable(
                "citibike_monthly.csv is not available in this deployment, so the "
                "twelve-month level that converts the model's ratio into trips is "
                "unknown. Run 02_data_preparation.ipynb and copy the file to "
                "NYCCitiBikeSystemData/models/ so it is committed and shipped.")

        month = pd.Timestamp(day.year, day.month, 1)
        if month in self.monthly.index:
            return float(self.monthly.loc[month]), "exact month"

        last = self.monthly.index.max()
        if month > last:
            return float(self.monthly.loc[last]), f"carried forward from {last:%Y-%m}"

        earlier = self.monthly.loc[:month]
        if earlier.empty:
            raise ModelUnavailable(
                f"no twelve-month level exists for {month:%Y-%m}; the series starts "
                f"at {self.monthly.index.min():%Y-%m}.")
        return float(earlier.iloc[-1]), f"nearest earlier month {earlier.index[-1]:%Y-%m}"

    def predict(self, day: dt.date, weather: dict) -> dict:
        level, level_source = self.level_for(day)
        row, cal = contracts.citibike_row(day, weather, self.columns)

        # The model predicts log(trips / level_12m), never trips directly.
        log_ratio = float(self.pipeline.predict(row)[0])
        ratio = float(np.exp(log_ratio))
        trips = int(round(ratio * level))

        return {
            "trips": trips,
            "level_12m": round(level, 1),
            "level_source": level_source,
            "ratio": round(ratio, 6),
            "calendar": cal.as_dict(),
            "model": self.meta.get("model", "citibike_gradient_boosting"),
            "notebook": self.meta.get("notebook"),
        }


class Registry:
    """Loads what it can and stays up when something is missing.

    A missing Citi Bike level file must not stop the mushroom endpoint from
    serving: the assignment's minimum is one deployed model, and a half-working
    API is more useful than one that refuses to start.
    """

    def __init__(self) -> None:
        self.mushroom: MushroomModel | None = None
        self.citibike: CitibikeModel | None = None
        self.errors: dict[str, str] = {}

        try:
            self.mushroom = MushroomModel()
        except Exception as error:  # noqa: BLE001 - reported, not swallowed
            self.errors["mushroom"] = str(error)
            log.exception("mushroom model failed to load")

        try:
            self.citibike = CitibikeModel()
        except Exception as error:  # noqa: BLE001
            self.errors["citibike"] = str(error)
            log.exception("citibike model failed to load")

    def health(self) -> dict:
        names = []
        if self.mushroom:
            names.append(f"mushroom {self.mushroom.meta.get('model', '')}".strip())
        if self.citibike and self.citibike.available:
            names.append(f"citibike {self.citibike.meta.get('model', '')}".strip())

        detail = {
            "mushroom": "ok" if self.mushroom else self.errors.get("mushroom", "not loaded"),
            "citibike": (
                "ok" if self.citibike and self.citibike.available
                else "monthly level file missing" if self.citibike
                else self.errors.get("citibike", "not loaded")
            ),
        }
        return {
            "status": "ok" if names else "degraded",
            "models": names,
            "detail": detail,
        }
