# Deployment

Assignment requirements for this part (see `project assignment.md`, section "Deploy"):

| Piece | Requirement | Status |
|---|---|---|
| Frontend | A custom webpage that listens to an API | Done, `deploy/frontend/` |
| Backend | Code that loads the model and predicts from user input | Done, `deploy/backend/` |
| Pipeline | Automated model update on every push to GitHub | Done, `.github/workflows/deploy.yml` |
| Hosting | Reachable by the lecturer for two weeks, restartable afterwards | Needs accounts: see `HOSTING.md` |

The interface is a hand-written page rather than Streamlit, which the assignment
lists as an extension. The API is Python so that the committed scikit-learn
pipelines run the exact preprocessing from the notebooks; writing it in another
language is a second listed extension and remains open (see "Choices" below).

Layout:

```
deploy/
  README.md          this file: the API contract and the reasoning
  HOSTING.md         the step-by-step hosting checklist
  frontend/          static page: index.html, styles.css, app.js, vercel.json
  backend/
    app/
      main.py        FastAPI routes
      models.py      loads the artefacts, turns a request into a prediction
      contracts.py   the deployment contracts: cleaning, stem rule, calendar
      weather.py     NOAA lookup for the "use real weather" button
    tests/           contract tests, run on every push
    Dockerfile       what Render builds
    requirements.txt pinned to the training versions
```

## Frontend

`deploy/frontend/` is a static site with no build step. Three.js, the fonts and
the icons load from jsDelivr, pinned to a version; everything else is in the
folder.

```
index.html           structure, import map for Three.js
styles.css           all styling, both themes
js/app.js            form, API calls, result cards, mode switch, settings
js/period.js         Citi Bike "Next 30 days" view: SVG chart, summary, table
js/stage.js          renderer, camera, switching between the two scenes
js/mushroom-scene.js the mushroom built from the form
js/bike-scene.js     the city island and its riders
js/motion.js         tween and smoothing helpers, reduced-motion handling
js/palette.js        gill and spore colours, shared by swatches and scene
```

Why no build step: every team member is examined orally on this code, and files
that can be read top to bottom are worth more here than a component tree. It also
makes the Vercel setup trivial and removes a class of deploy failures.

### The 3D scenes are a picture of the input

The scene is not decoration on the side; it is the form, drawn:

- **Mushroom:** the cap morphs between the seven shapes, the sliders grow the cap
  and stem (on a log scale, so 1 cm and 57 cm both fit), gill and spore colours
  paint the gills and the spore print on the ground, the ring type puts a ring on
  the stem, the habitat changes the ground and props, the season changes the
  light and the falling leaves or snow. **A field left as "not observed" is drawn
  as a wireframe**, because the model receives `missing` for it and treats it as
  unknown, not as blank. "none" is drawn as absent: no ring, no gills, no stem.
- **Citi Bike:** temperature colours the sky and sunlight, rain and snow fall at
  a rate that follows the millimetres, snow on the ground whitens the grass, wind
  bends the trees and slants the rain. After a forecast the number of riders on
  the loop is the normal-day count times the model's ratio, straight from the
  API: the same quantity as the "x% of a normal day" meter, drawn as people.
- While the API answers, a ring sweeps the mushroom or a light runs around the
  loop; when the answer lands the ring flashes out in the verdict colour.

The scene draws what was typed, literally: a stem height of 0 draws no stem. It
never computes `has_stem` or any other feature; the result card shows the API's
own value. If WebGL or the CDN is unavailable the scene is skipped
(`body.no-3d`) and the form and predictions work as before.

Inputs are sliders and chip groups rather than number boxes. Sliders cannot hold a
malformed number (a comma typed where the browser expects a full stop used to
arrive as "not observed"), chips are real radio buttons (arrow keys work, screen
readers announce them), and a slider can be cleared back to "not measured".

Kept cheap: the scene renders only while visible, caps the pixel ratio, uses
instancing for every repeated object, and on touch screens dragging is off so a
finger scrolls the page. Under `prefers-reduced-motion` nothing moves by itself.

### The one rule the page follows

**The page never derives a model feature.** It collects raw inputs, posts them,
and renders the response. The mushroom stem rule, the Citi Bike calendar columns
and the twelve-month level all live in the backend. If the page recomputed any of
them there would be two implementations of the deployment contract, and they
would drift apart at the first retrain. Everything shown under "Derived by the
API" is read out of the response body.

### Running it locally

```
py -3.11 -m http.server 5173 --directory deploy/frontend
```

Then open `http://localhost:5173`. Opening `index.html` as a `file://` URL also
works, but a server is closer to the deployed setup.

The backend address is set in the page itself (click the status pill, top right)
and stored in `localStorage`, so the deployed front end can be pointed at a
laptop, a VM or a tunnel without redeploying. Leave it empty when the API serves
the page itself or when a rewrite maps `/api` to the backend.

**Demo mode** is a checkbox in the same dialog. It fills the interface with
placeholder numbers from a crude formula so the layout can be shown without a
backend. It is off by default, a banner stays on screen while it is on, and every
result is labelled. It is not the model and must never be demonstrated as if it
were.

### Deploying to Vercel

The site is static, so no build command is needed.

- Root directory: `deploy/frontend`
- Build command: none
- Output directory: `.` (`vercel.json` already sets this)

If the API ends up on its own host, add a rewrite so the browser calls the same
origin and no CORS headers are needed:

```json
{ "rewrites": [{ "source": "/api/:path*", "destination": "https://YOUR-API-HOST/api/:path*" }] }
```

Otherwise the API must send `Access-Control-Allow-Origin` for the Vercel domain.

## API contract

The page expects these endpoints. Field names match `input_columns` in the
model JSON files, so the backend can pass them through with no renaming.

`null` means "not observed" everywhere. The backend maps it to the `missing`
category for mushroom categoricals and to `NaN` for numbers. An omitted key is
treated the same as `null`.

### GET /api/health

```json
{ "status": "ok", "models": ["mushroom gradient boosting", "citibike gradient boosting"] }
```

Used for the status pill and the footer line. Any non-2xx marks the backend as
unreachable.

### POST /api/mushroom

Request (all keys optional, `null` allowed):

```json
{
  "cap_diameter": 8.4, "stem_height": 6.2, "stem_width": 14.8,
  "cap_shape": "convex", "gill_color": "brown", "spore_print_color": "white",
  "stem_surface": "smooth", "ring_type": "none", "habitat": "woods", "season": "autumn"
}
```

Response:

```json
{
  "probability_poisonous": 0.586,
  "threshold": 0.139,
  "verdict": "poisonous",
  "has_stem": 1,
  "model": "gradient boosting (tuned)",
  "notebook": "05b_model_gradient_boosting"
}
```

Backend responsibilities, from CLAUDE.md section 5.5:

1. Clean the input as in `02_data_preparation.ipynb` sections 2 to 5.
2. Apply the stem rule to derive `has_stem` and the logical zeros, and return the
   value it derived. Never contradict the rule.
3. Build a one-row frame with the 11 columns of `input_columns`, in that order.
4. `p = model.predict_proba(row)[:, 1]`. Poisonous when `p >= threshold`, with the
   threshold read from `mushroom_gradient_boosting.json`, currently **0.139**.
   Never call `predict()`: it uses 0.5 and random forests produce exact 0.5 ties.
5. Return the probability as well as the verdict. The page shows both, because at
   this threshold roughly two thirds of edible mushrooms are flagged poisonous and
   a bare verdict would misrepresent the model.

`none` and `missing` are different inputs. `none` means the feature is absent (no
ring, no gills, no stem surface) and carries information; `missing` means it was
not observed. The form keeps them apart and so must the backend.

### POST /api/citibike

Request (`wind_ms` may be `null`):

```json
{
  "date": "2026-10-09",
  "tmax_c": 18.5, "tmin_c": 11.0,
  "precipitation_mm": 0.0, "snowfall_mm": 0.0, "snow_depth_mm": 0.0, "wind_ms": 3.2
}
```

Response:

```json
{
  "trips": 122709,
  "level_12m": 120000,
  "ratio": 1.0226,
  "calendar": {
    "weekday": 4, "month": 10, "day_of_year": 282,
    "holiday": false, "christmas_week": false
  },
  "model": "citibike_gradient_boosting"
}
```

Backend responsibilities, from CLAUDE.md section 6.14:

1. Derive the calendar columns from the date as in `02` section 5: `weekday`
   (0 = Monday), `month`, `day_of_year`, `holiday` (pandas
   `USFederalHolidayCalendar`), `christmas_week` (24 December to 1 January,
   except the federal holidays in it, 25 December and 1 January, exactly as in
   `02`; until 10 October 2026 the API set it on those two days too). Return them, so the page can show what the model actually saw.
2. Look up `level_12m` from `Data/citibike_monthly.csv`: trips over months
   m-13 to m-2 divided by the days in those months. `features_for_day` in `03` is
   the reference implementation.
3. Build a one-row frame with the columns of `input_columns`.
4. The model outputs a log ratio, so `trips = exp(model.predict(row)[0]) * level_12m`.
   Return `trips`, `level_12m` and `ratio`; the page shows the day against the
   twelve-month baseline and must not do this arithmetic itself.

`Data/citibike_monthly.csv` is git-ignored (it is produced by
`02_data_preparation.ipynb`), so a committed copy lives in
`NYCCitiBikeSystemData/models/` and is baked into the API image. After re-running
`02`, copy the new file there and commit it.

### GET /api/citibike/period?start=YYYY-MM-DD&days=30

Expected trips for every day of a period of up to 30 days, under **normal
weather**. Nothing is computed with a model here: `05d_model_timeseries.ipynb`
forecasts every day from 2026-08-31 to 2027-12-31 and writes
`NYCCitiBikeSystemData/models/citibike_timeseries_forecast.csv` plus
`citibike_timeseries.json`; the API reads that table at start-up. That keeps
PyCaret, sktime and LightGBM out of the container.

- `days`: 1 to 30, default 30. Anything else is a 422.
- `start`: optional. Default is today, moved into the range
  `[forecast_first_day, forecast_last_day - days + 1]` so a whole period fits. An
  explicit start outside that range is a 422 whose `detail` names the range.

```json
{
  "model": "time series lightgbm_cds_dt (PyCaret)",
  "notebook": "05d_model_timeseries",
  "fitted_on": "2014-07-01 to 2026-08-30",
  "weather_assumption": "normal weather: the mean of the forecasts over the weather of the same calendar day in every complete past year; low/high = 10th/90th percentile",
  "start": "2026-10-10", "end": "2026-11-08",
  "days_after_last_data": 41,
  "first_day_available": "2026-08-31", "last_day_available": "2027-12-31",
  "typical_daily_error_pct": 20.62,
  "period_total_error_pct": 9.06,
  "total_trips": 4537715, "mean_trips_per_day": 151257,
  "busiest_day": { "date": "2026-10-21", "trips": 183178 },
  "quietest_day": { "date": "2026-11-08", "trips": 126392 },
  "note": "This period starts 41 days after the last day the model was fitted on ...",
  "days": [
    { "date": "2026-10-10", "weekday": 5, "weekend": true, "holiday": false,
      "christmas_week": false, "predicted_trips": 150488,
      "low_trips": 135580, "high_trips": 170750,
      "tmax_c": 20.3, "tmin_c": 13.0, "precipitation_mm": 3.3, "snow_depth_mm": 0.0,
      "level_source": "published months" }
  ]
}
```

- `predicted_trips` is the mean of the forecasts over the weather of the same
  calendar day in eleven past years; `low_trips` / `high_trips` are the 10th and
  90th percentile over those years. The band shows how much weather alone moves
  a day. It is **not** a prediction interval, and on a date where one past year
  had a storm the mean can fall outside it.
- `typical_daily_error_pct` and `period_total_error_pct` come from
  `period_error_validation_2024` in the JSON: 30-day forecasts made at the start
  of every month of 2024, scored against what happened.
- `days_after_last_data` is `start` minus the last fitted day. Above 30, `note`
  warns that the error figures were measured on forecasts up to 30 days ahead.
- The weather columns are the typical weather of that date, for display only.
- To move the forecast forward after new data: re-run `02`, then `05d`, and
  commit the two files. The retraining pipeline does not refit this model (CI
  has neither the data nor PyCaret).

### GET /api/weather?date=YYYY-MM-DD

Observed weather for one past day from NOAA GHCN-Daily station `USW00094728`
(New York, Central Park) - the same series `02_data_preparation.ipynb` trained
on, so the numbers are on the same scale.

```json
{ "date": "2025-06-14", "station": "USW00094728", "tmax_c": 24.4, "tmin_c": 17.2,
  "precipitation_mm": 0.0, "snowfall_mm": 0.0, "snow_depth_mm": 0.0,
  "wind_ms": 2.8, "source": "NOAA GHCN-Daily, observed" }
```

This is observed weather with a few days of publication lag, not a forecast
service: recent and future dates return 404 and the page says so. It exists so
the model can be tried on a real day without typing six numbers.

### Errors

Any non-2xx carries a JSON body with `detail`; the page shows that string.

- **422** - the request did not match the schema (for example a missing date),
  or a period that the forecast table does not cover.
- **503** - the model or an artefact it needs is not available. The Citi Bike
  endpoint returns this, with an explanation, when `citibike_monthly.csv` is
  missing. It never invents a trips number.
- **500** - the prediction itself failed. This should not happen: unknown
  categories, out-of-range numbers and completely empty observations are all
  valid inputs and are covered by the tests.

### Tests

`deploy/backend/tests/test_contracts.py` guards the things that are cheap to
break and expensive to notice: the stem rule in all six of its cases, the
decision threshold coming from the JSON rather than a hard-coded 0.5, the
calendar columns, the promise that an unobserved value stays unobserved
instead of becoming a zero, and the period endpoint (range limits, consecutive
days, totals, holiday flags, the error figures from the JSON). They run on every
push.

```
cd deploy/backend && ../../.venv/Scripts/python.exe -m pytest -q
```

## Choices worth defending in the oral exam

- **No framework.** The deliverable is one page with two forms. A build step would
  add deploy failure modes and code nobody on the team wrote by hand.
- **Feature derivation only in the backend.** One implementation of the contract,
  so a retrain cannot silently disagree with the interface.
- **The mushroom threshold is shown, not hidden.** 0.139 is far from the default
  0.5 and is the single most surprising thing about the model. The meter marks it,
  the result states the rule, and the probability is always visible.
- **Demo mode is opt-in and labelled.** Showing an interface without a backend is
  useful; showing fake numbers that look like predictions is not.
- **Empty is a value.** Blank fields are sent as `null`, never as `0`. A number
  input that cannot be parsed is refused instead of being sent as `null`, so a
  typo cannot quietly become "not observed" and change the prediction.
