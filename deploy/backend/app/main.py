"""Inference API for the two CloudAiChallenge15 models.

FastAPI, because the models are scikit-learn pipelines: loading the committed
.joblib files means the preprocessing that runs in production is literally the
code from the notebooks, with no reimplementation to keep in sync.

Endpoints (see deploy/README.md for the full contract):
    GET  /api/health
    POST /api/mushroom
    POST /api/citibike
    GET  /api/citibike/period?start=YYYY-MM-DD&days=30   period forecast, normal weather
    GET  /api/weather?date=YYYY-MM-DD   convenience, NOAA Central Park

Run locally:
    .venv/Scripts/python.exe -m uvicorn app.main:app --reload --port 8000
    (from deploy/backend)
"""

from __future__ import annotations

import datetime as dt
import logging
import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .models import ModelUnavailable, PeriodOutOfRange, Registry
from .weather import WeatherUnavailable, observed_weather

logging.basicConfig(level=logging.INFO,
                    format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("ggi.api")

app = FastAPI(
    title="Fieldcast API",
    description="Observe. Model. Explore. Mushroom edibility and Citi Bike daily demand, "
                "CloudAiChallenge15 (Thomas More).",
    version="1.0.0",
)

# The front end is hosted separately (Vercel), so the browser calls this API
# cross-origin. ALLOWED_ORIGINS is a comma-separated list; the default is
# permissive because this is a public, read-only, unauthenticated demo API.
# Tighten it by setting the variable on the host.
origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

registry = Registry()


# --------------------------------------------------------------------- schemas

class MushroomRequest(BaseModel):
    """Every field is optional: an unobserved feature is a real input."""
    cap_diameter: float | None = None
    stem_height: float | None = None
    stem_width: float | None = None
    cap_shape: str | None = None
    gill_color: str | None = None
    spore_print_color: str | None = None
    stem_surface: str | None = None
    ring_type: str | None = None
    habitat: str | None = None
    season: str | None = None


class CitibikeRequest(BaseModel):
    date: dt.date = Field(..., description="The day to forecast, YYYY-MM-DD")
    tmax_c: float | None = None
    tmin_c: float | None = None
    precipitation_mm: float | None = None
    snowfall_mm: float | None = None
    snow_depth_mm: float | None = None
    wind_ms: float | None = None


# --------------------------------------------------------------------- routes

@app.get("/api/health")
def health() -> dict:
    return registry.health()


@app.post("/api/mushroom")
def predict_mushroom(request: MushroomRequest) -> dict:
    if registry.mushroom is None:
        raise HTTPException(503, registry.errors.get("mushroom", "model not loaded"))
    try:
        return registry.mushroom.predict(request.model_dump())
    except Exception as error:  # noqa: BLE001
        log.exception("mushroom prediction failed")
        raise HTTPException(500, f"prediction failed: {error}") from error


@app.post("/api/citibike")
def predict_citibike(request: CitibikeRequest) -> dict:
    if registry.citibike is None:
        raise HTTPException(503, registry.errors.get("citibike", "model not loaded"))

    payload = request.model_dump()
    day = payload.pop("date")
    try:
        return registry.citibike.predict(day, payload)
    except ModelUnavailable as error:
        raise HTTPException(503, str(error)) from error
    except Exception as error:  # noqa: BLE001
        log.exception("citibike prediction failed")
        raise HTTPException(500, f"prediction failed: {error}") from error


@app.get("/api/citibike/period")
def citibike_period(
    start: dt.date | None = Query(None, description="First day, YYYY-MM-DD. Default: today, "
                                  "moved into the forecast range."),
    days: int = Query(30, ge=1, le=30, description="Length of the period, 1-30 days"),
) -> dict:
    """Expected trips for every day of a period, under normal weather.

    A lookup in the forecast table of 05d_model_timeseries.ipynb, not a model run.
    No weather forecast is used: each number is what a day with that date brings
    in typical weather, with the spread over eleven past years as a band.
    """
    if registry.citibike_period is None:
        raise HTTPException(503, registry.errors.get("citibike_period", "forecast not loaded"))
    try:
        return registry.citibike_period.period(start, days)
    except PeriodOutOfRange as error:
        raise HTTPException(422, str(error)) from error


@app.get("/api/weather")
def weather(date: dt.date = Query(..., description="YYYY-MM-DD")) -> dict:
    """Observed weather for a past day, from the station the model was trained on.

    A convenience so the page can fill a realistic day instead of asking for six
    numbers. It is observed weather, not a forecast: NOAA publishes with a lag of
    a few days, so recent and future dates are not available.
    """
    try:
        return observed_weather(date)
    except WeatherUnavailable as error:
        raise HTTPException(404, str(error)) from error
    except Exception as error:  # noqa: BLE001
        log.exception("weather lookup failed")
        raise HTTPException(502, f"weather lookup failed: {error}") from error


@app.get("/")
def root() -> JSONResponse:
    return JSONResponse({
        "service": "Fieldcast API",
        "docs": "/docs",
        "endpoints": ["/api/health", "/api/mushroom", "/api/citibike",
                      "/api/citibike/period", "/api/weather"],
    })
