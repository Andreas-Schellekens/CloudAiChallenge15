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

`deploy/frontend/` is a static site: `index.html`, `styles.css`, `app.js`. No
framework, no build step, no dependencies. Open the folder on any static host.

Why no build step: every team member is examined orally on this code, and a page
that can be read top to bottom is worth more here than a component tree. It also
makes the Vercel setup trivial and removes a class of deploy failures.

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

The page expects these three endpoints. Field names match `input_columns` in the
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
   `USFederalHolidayCalendar`), `christmas_week` (24 December to 1 January).
   Return them, so the page can show what the model actually saw.
2. Look up `level_12m` from `Data/citibike_monthly.csv`: trips over months
   m-13 to m-2 divided by the days in those months. `features_for_day` in `03` is
   the reference implementation.
3. Build a one-row frame with the columns of `input_columns`.
4. The model outputs a log ratio, so `trips = exp(model.predict(row)[0]) * level_12m`.
   Return `trips`, `level_12m` and `ratio`; the page shows the day against the
   twelve-month baseline and must not do this arithmetic itself.

**Open issue before the backend can run:** `Data/citibike_monthly.csv` is
git-ignored and is produced by `02_data_preparation.ipynb`. Without it there is no
`level_12m` and no prediction. It is small, so the simplest fix is to commit it
next to the model files, or to bake it into the API image. Decide this before
wiring the backend.

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

- **422** - the request did not match the schema (for example a missing date).
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
calendar columns, and the promise that an unobserved value stays unobserved
instead of becoming a zero. They run on every push.

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
