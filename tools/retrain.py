"""Refit the two deployed models from their recorded hyperparameters.

This is the "ML department" step of the pipeline. It does not search for new
hyperparameters: the notebooks did that, and the chosen settings are recorded in
the model JSON files. What it does is refit those settings on whatever training
data is present now, which is the point of retraining - new months of Citi Bike
trips, or a corrected mushroom file, should reach the deployed model without a
human re-running a notebook.

Guard rail: a refitted model replaces the committed one only when it is not
worse on the validation set. An automated pipeline that can silently make the
deployed model worse is not an improvement over no pipeline. Set FORCE_RETRAIN=1
to overrule, which the workflow exposes as a manual input.

Training inputs are git-ignored by default, so when they are absent the script
reports that it skipped and exits 0. A pipeline that fails because the data is
not in the repository would just be noise on every push.

Usage:
    py -3.11 tools/retrain.py [--dry-run]
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
MUSHROOM = ROOT / "SecondaryMushroom"
CITIBIKE = ROOT / "NYCCitiBikeSystemData"

DRY_RUN = "--dry-run" in sys.argv
FORCE = os.environ.get("FORCE_RETRAIN", "").lower() in ("1", "true", "yes")

results: list[str] = []


def say(line: str) -> None:
    print(line, flush=True)


def data_path(base: Path, split: str, stem: str) -> Path:
    return base / "Data" / split / f"{stem}_{split}.csv"


# --------------------------------------------------------------------- mushroom

def retrain_mushroom() -> str:
    """Refit the tuned HistGradientBoosting pipeline from 05b."""
    import joblib
    from sklearn.metrics import roc_auc_score

    meta_path = MUSHROOM / "models" / "mushroom_gradient_boosting.json"
    model_path = MUSHROOM / "models" / "mushroom_gradient_boosting.joblib"
    train = data_path(MUSHROOM, "train", "mushroom_cleaned")
    validation = data_path(MUSHROOM, "validation", "mushroom_cleaned")

    if not train.is_file() or not validation.is_file():
        return "mushroom=skipped(no training data)"

    meta = json.loads(meta_path.read_text())
    columns = meta["input_columns"]

    train_df = pd.read_csv(train, index_col="row_id")
    val_df = pd.read_csv(validation, index_col="row_id")
    y_train = (train_df["class"] == "p").astype(int)
    y_val = (val_df["class"] == "p").astype(int)

    # The committed pipeline already carries the preprocessing. Cloning it keeps
    # the encoder settings (handle_unknown and friends) identical rather than
    # rebuilding them here and risking a quiet difference.
    from sklearn.base import clone
    pipeline = clone(joblib.load(model_path))
    pipeline.fit(train_df[columns], y_train)

    new_auc = roc_auc_score(y_val, pipeline.predict_proba(val_df[columns])[:, 1])
    old_auc = float(meta.get("validation_roc_auc", 0))

    if new_auc + 1e-6 < old_auc and not FORCE:
        return f"mushroom=kept(old_auc={old_auc:.4f} new_auc={new_auc:.4f})"

    if not DRY_RUN:
        joblib.dump(pipeline, model_path, compress=3)
        meta["validation_roc_auc"] = round(float(new_auc), 4)
        meta_path.write_text(json.dumps(meta, indent=2) + "\n")
    return f"mushroom=updated(old_auc={old_auc:.4f} new_auc={new_auc:.4f})"


# --------------------------------------------------------------------- citi bike

def retrain_citibike() -> str:
    """Refit the tuned HistGradientBoostingRegressor from 05a."""
    import joblib
    from sklearn.base import clone

    meta_path = CITIBIKE / "models" / "citibike_gradient_boosting.json"
    model_path = CITIBIKE / "models" / "citibike_gradient_boosting.joblib"
    train = data_path(CITIBIKE, "train", "citibike_daily")
    validation = data_path(CITIBIKE, "validation", "citibike_daily")

    if not train.is_file() or not validation.is_file():
        return "citibike=skipped(no training data)"

    meta = json.loads(meta_path.read_text())
    columns = meta["input_columns"]

    train_df = pd.read_csv(train, index_col="date", parse_dates=["date"])
    val_df = pd.read_csv(validation, index_col="date", parse_dates=["date"])

    # Days with zero trips are days the system was shut for a winter storm (nine
    # of them in the training years). Their demand ratio is 0, so the log target
    # is -inf and a MAPE against them divides by zero. 03 and 05a both fit on
    # `train[train.total > 0]`; this has to match or it is not the same model.
    fit_days = train_df[train_df.total > 0]
    score_days = val_df[val_df.total > 0]

    # The model learns the log ratio against the twelve-month level, never trips.
    y_train = np.log(fit_days["demand_ratio"])

    model = clone(joblib.load(model_path))
    model.fit(fit_days[columns], y_train)

    predicted = np.exp(model.predict(score_days[columns])) * score_days["level_12m"]
    actual = score_days["total"]
    new_mape = float((predicted - actual).abs().div(actual).mean() * 100)
    old_mape = float(meta.get("validation", {}).get("mape", 1e9))

    if new_mape > old_mape + 1e-6 and not FORCE:
        return f"citibike=kept(old_mape={old_mape:.2f} new_mape={new_mape:.2f})"

    if not DRY_RUN:
        joblib.dump(model, model_path, compress=3)
        meta.setdefault("validation", {})
        meta["validation"]["mape"] = round(new_mape, 2)
        meta["validation"]["mae"] = round(float((predicted - actual).abs().mean()), 2)
        meta_path.write_text(json.dumps(meta, indent=2) + "\n")

    # Keep the shipped level file in step with the data it was derived from.
    source = CITIBIKE / "Data" / "citibike_monthly.csv"
    shipped = CITIBIKE / "models" / "citibike_monthly.csv"
    if source.is_file() and not DRY_RUN:
        shipped.write_bytes(source.read_bytes())

    return f"citibike=updated(old_mape={old_mape:.2f} new_mape={new_mape:.2f})"


def main() -> int:
    say(f"Retraining from {ROOT}" + (" (dry run)" if DRY_RUN else ""))
    for name, function in [("mushroom", retrain_mushroom), ("citibike", retrain_citibike)]:
        try:
            results.append(function())
        except Exception as error:  # noqa: BLE001 - one model must not stop the other
            say(f"ERROR while retraining {name}: {error}")
            results.append(f"{name}=error")
        say("  " + results[-1])

    failed = [r for r in results if r.endswith("=error")]
    say("\nSUMMARY " + " ".join(results))
    # A missing dataset is not a failure; a crash is.
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
