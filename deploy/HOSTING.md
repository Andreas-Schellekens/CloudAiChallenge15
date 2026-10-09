# Hosting checklist

What has to happen, and who has to do it. Everything marked **you** needs an
account or a dashboard click that cannot be done from the repository.

Target architecture:

```
  browser
     |  HTTPS
     v
  Vercel (static)            Render (Docker)
  deploy/frontend     --->   deploy/backend      --->  committed .joblib models
  index/styles/app           FastAPI + uvicorn         + citibike_monthly.csv
     ^                          ^
     |  git push                |  git push (autoDeploy)
     +--------- GitHub ---------+
                  |
                  +-- Actions: contract tests, image build, retrain, commit
```

Both hosts rebuild on a push to `main`, so one `git push` updates the whole
chain. That is the assignment's "pipeline" requirement.

---

## 1. Frontend on Vercel  (**you**, about 3 minutes)

1. Sign in at <https://vercel.com> with the GitHub account that can see
   `Andreas-Schellekens/CloudAiChallenge15`.
2. **Add New -> Project**, import the repository.
3. Set **Root Directory** to `deploy/frontend`. Leave the framework preset on
   "Other"; there is no build command and no output directory to change
   (`deploy/frontend/vercel.json` already pins them).
4. Deploy. You get a URL like `https://cloudaichallenge15.vercel.app`.

Nothing else is needed: the page is three static files.

## 2. Backend on Render  (**you**, about 5 minutes)

1. Sign in at <https://render.com> with GitHub.
2. **New -> Blueprint**, pick the same repository. Render reads `render.yaml`
   from the repository root and proposes one web service,
   `going-green-inference-api`.
3. Apply. The first build takes roughly 5 minutes (it installs scikit-learn).
4. Copy the service URL, something like
   `https://going-green-inference-api.onrender.com`.

Free-tier instances sleep after about 15 minutes idle and take roughly 50
seconds to wake. That is acceptable for a two-week evaluation window, and the
page shows "Backend unreachable" rather than hanging while it wakes. Tell the
lecturer to give it a minute on the first request.

## 3. Point the two at each other  (**you**, 2 minutes)

- Open the deployed page, click the status pill, paste the Render URL, save. It
  is stored per browser, so the lecturer would have to do the same.
- **Better:** avoid that entirely with a rewrite, so the page calls its own
  origin and no one has to configure anything. Add to
  `deploy/frontend/vercel.json`:

  ```json
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://YOUR-RENDER-URL/api/:path*" }
  ]
  ```

  Then leave the API address empty in the dialog. This also removes the CORS
  question completely.
- If you do not use the rewrite, set `ALLOWED_ORIGINS` on the Render service to
  the Vercel domain instead of `*`.

## 4. GitHub Actions  (**you**, 1 minute)

The workflow in `.github/workflows/deploy.yml` needs permission to push the
retrained artefacts back:

- Repository **Settings -> Actions -> General -> Workflow permissions** ->
  **Read and write permissions**.

It needs no secrets. Render and Vercel watch the repository themselves, so there
are no deploy keys to manage.

> You may not be an admin on Andreas's repository. If the setting is not
> available to you, ask him, or the retrain job will fail at the push step while
> the tests still pass.

---

## What is still open

**`citibike_monthly.csv` must be committed.** The Citi Bike endpoint converts the
model's ratio into trips with the twelve-month level from that file.
`02_data_preparation.ipynb` writes it to `Data/`, which is git-ignored, so it
cannot reach a deployment from there. Copy it to
`NYCCitiBikeSystemData/models/citibike_monthly.csv` and commit it; the API looks
there first and falls back to `Data/` for local runs.

Until that happens the API runs fine and serves the mushroom model, and
`/api/health` reports `citibike: monthly level file missing`. That still meets
the MVP ("deploying at least one model in a web interface"), but the Citi Bike
tab will show the 503 message.

**Retraining has no data in CI.** Both training sets are git-ignored, so the
retrain job reports `skipped(no training data)` on every push. To make it real,
commit the small training inputs:

| File | Size | Enables |
|---|---|---|
| `SecondaryMushroom/Data/{train,validation}/mushroom_cleaned_*.csv` | about 1 MB | mushroom retraining |
| `NYCCitiBikeSystemData/Data/{train,validation}/citibike_daily_*.csv` | under 1 MB | Citi Bike retraining |

These are derived, not raw: the 62 GB of trip CSVs and the lecturer's mushroom
file stay out of the repository either way. This is a team decision, because it
changes the "data files are never committed" rule in CLAUDE.md section 4.

---

## Turning it back on later

The assignment asks that the setup can be restarted after the evaluation window.

- Render free services are suspended, not deleted, after a long idle period;
  **Resume** in the dashboard brings the same URL back.
- Vercel static deployments do not expire.
- Both redeploy from a fresh `git push` if anything was removed, because the
  whole configuration lives in `render.yaml` and `deploy/frontend/vercel.json`.

## Running the whole thing locally

```
py -3.11 -m uvicorn app.main:app --port 8000     # from deploy/backend
py -3.11 -m http.server 5173 --directory deploy/frontend
```

Open `http://localhost:5173`, set the API address to `http://localhost:8000`.

Or with the container, which is what Render runs:

```
docker build -f deploy/backend/Dockerfile -t ggi-api .
docker run --rm -p 8000:8000 ggi-api
```
