"""Tests for the deployment contracts.

These guard the things that are easy to break by accident and expensive to
notice: the stem rule, the decision threshold, the calendar columns, and the
promise that an unobserved value stays unobserved instead of becoming a zero.

Run from deploy/backend:
    ../../.venv/Scripts/python.exe -m pytest -q
"""

from __future__ import annotations

import datetime as dt

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.contracts import (
    apply_stem_rule,
    calendar_for,
    normalise_mushroom,
)
from app.main import app

client = TestClient(app)


# --------------------------------------------------------------------- cleaning

def test_unobserved_category_becomes_missing_not_none():
    """'missing' and 'none' are different inputs and must never be merged."""
    clean = normalise_mushroom({"gill_color": None})
    assert clean["gill_color"] == "missing"

    clean = normalise_mushroom({"gill_color": "none"})
    assert clean["gill_color"] == "none"


def test_unobserved_number_becomes_nan_not_zero():
    """A zero stem width means "no stem"; an unobserved one means nothing."""
    clean = normalise_mushroom({"stem_width": None})
    assert np.isnan(clean["stem_width"])

    clean = normalise_mushroom({"stem_width": 0})
    assert clean["stem_width"] == 0.0


# --------------------------------------------------------------------- stem rule

@pytest.mark.parametrize("raw, expected", [
    ({"stem_height": 0, "stem_width": 0}, 0),              # measured absent
    ({"stem_surface": "none"}, 0),                          # surface says absent
    ({"stem_height": 0, "stem_surface": "none"}, 0),        # both agree
    ({"stem_height": 6.0, "stem_width": 14.0}, 1),          # measured present
    ({"stem_surface": "smooth"}, 1),                        # a real surface
    ({}, None),                                             # nothing observed
])
def test_stem_rule(raw, expected):
    clean, has_stem = apply_stem_rule(normalise_mushroom(raw))
    assert has_stem == expected


def test_stemless_fills_logical_zeros():
    """For a stemless mushroom the missing measures are 0, not unknown."""
    clean, has_stem = apply_stem_rule(normalise_mushroom({"stem_surface": "none"}))
    assert has_stem == 0
    assert clean["stem_height"] == 0.0
    assert clean["stem_width"] == 0.0


def test_stemless_fills_surface_when_measures_say_absent():
    clean, has_stem = apply_stem_rule(
        normalise_mushroom({"stem_height": 0, "stem_width": 0}))
    assert has_stem == 0
    assert clean["stem_surface"] == "none"


# --------------------------------------------------------------------- calendar

def test_calendar_weekday_is_monday_zero():
    # 2026-10-09 is a Friday.
    cal = calendar_for(dt.date(2026, 10, 9))
    assert cal.weekday == 4
    assert cal.month == 10
    assert cal.day_of_year == 282


def test_federal_holiday_detected():
    assert calendar_for(dt.date(2026, 7, 3)).holiday     # Independence Day observed
    assert not calendar_for(dt.date(2026, 7, 7)).holiday


def test_christmas_week_spans_the_year_end():
    assert calendar_for(dt.date(2026, 12, 24)).christmas_week
    assert calendar_for(dt.date(2026, 12, 31)).christmas_week
    assert calendar_for(dt.date(2027, 1, 1)).christmas_week
    assert not calendar_for(dt.date(2027, 1, 2)).christmas_week


# --------------------------------------------------------------------- endpoints

def test_health_reports_each_model():
    body = client.get("/api/health").json()
    assert body["status"] in ("ok", "degraded")
    assert "mushroom" in body["detail"]
    assert "citibike" in body["detail"]


def test_mushroom_uses_the_json_threshold_not_half():
    """The deployed threshold is 0.139. A 0.5 cut would be a different model."""
    body = client.post("/api/mushroom", json={"stem_surface": "smooth"}).json()
    assert body["threshold"] == pytest.approx(0.139)
    expected = "poisonous" if body["probability_poisonous"] >= 0.139 else "edible"
    assert body["verdict"] == expected


def test_mushroom_accepts_a_completely_empty_observation():
    response = client.post("/api/mushroom", json={})
    assert response.status_code == 200
    assert response.json()["has_stem"] is None


def test_mushroom_tolerates_an_unknown_category():
    """handle_unknown is set on the encoder; an odd value must not be a 500."""
    response = client.post("/api/mushroom", json={"gill_color": "chartreuse"})
    assert response.status_code == 200
    assert any("chartreuse" in note for note in response.json()["notes"])


def test_mushroom_reports_values_outside_the_training_range():
    body = client.post("/api/mushroom", json={"cap_diameter": 99}).json()
    assert any("training range" in note for note in body["notes"])


def test_stemless_mushroom_is_flagged_poisonous():
    """The EDA found stemless mushrooms are 92% poisonous; the model must agree."""
    body = client.post("/api/mushroom", json={"stem_surface": "none"}).json()
    assert body["verdict"] == "poisonous"


def test_citibike_either_predicts_or_explains_itself():
    """Without the monthly level file the endpoint must 503 with a reason,
    never invent a trips number."""
    response = client.post("/api/citibike", json={
        "date": "2026-10-09", "tmax_c": 18.5, "precipitation_mm": 0.0})
    assert response.status_code in (200, 503)
    if response.status_code == 200:
        body = response.json()
        assert body["trips"] > 0
        assert body["calendar"]["weekday"] == 4
        # trips must be the ratio applied to the level, not a raw model output
        assert body["trips"] == pytest.approx(body["ratio"] * body["level_12m"], rel=1e-3)
    else:
        assert "citibike_monthly.csv" in response.json()["detail"]


def test_citibike_rejects_a_missing_date():
    assert client.post("/api/citibike", json={"tmax_c": 18.5}).status_code == 422
