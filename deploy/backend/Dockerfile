# Inference API image.
#
# Build context is the REPOSITORY ROOT, not this folder, because the image needs
# the committed model files from both dataset folders:
#   docker build -f deploy/backend/Dockerfile -t ggi-api .
#
# The artefacts are copied in rather than downloaded at start-up, so the running
# container is pinned to exactly what was committed and a cold start costs only
# the time to load two small .joblib files.

FROM python:3.11.9-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    LOKY_MAX_CPU_COUNT=1

# Dependencies first: this layer stays cached while only application code moves.
WORKDIR /srv/deploy/backend
COPY deploy/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY deploy/backend/app ./app

# Model artefacts. app/models.py resolves these relative to the repository root,
# which is three parents above app/models.py, so the layout has to mirror the
# repository. Whole folders are copied because they are small (about 2 MB) and
# because that keeps the Citi Bike level file optional: if the folder does not
# contain citibike_monthly.csv yet, the image still builds, the mushroom
# endpoint still serves, and /api/health reports why Citi Bike cannot.
COPY SecondaryMushroom/models /srv/SecondaryMushroom/models
COPY NYCCitiBikeSystemData/models /srv/NYCCitiBikeSystemData/models

ENV PORT=8000
EXPOSE 8000

# One worker: the free tier has little memory and scikit-learn keeps a copy of
# the model per process. A prediction takes milliseconds, so concurrency is not
# the bottleneck here.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1"]
