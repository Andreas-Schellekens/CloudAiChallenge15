<p align="center">
  <img src="deploy/frontend/brand/apple-touch-icon.png" width="72" alt="Fieldcast logo">
</p>

# Fieldcast

**Observe. Model. Explore.** Two machine-learning models with a live web interface: is a
mushroom edible or poisonous, and how many Citi Bike trips will New York ride on a given day?

**Live site: <https://fieldcast.flipforward.be/>**

Machine Learning / Cloud AI challenge – theme "Going green" (Thomas More, group CloudAiChallenge15).

## Group

**Group name:** CloudAiChallenge15

| # | Member |
|---|---|
| 1 | Andreas Schellekens |
| 2 | Finn Vangronsveld |
| 3 | Mihai Constantin |
| 4 | Zjef Schaeken |

## Live demo: Fieldcast

Observe. Model. Explore.

- **Web interface:** <https://fieldcast.flipforward.be/> - both models on one page
  (also at <https://fieldcast-app.vercel.app/>)
- **API documentation:** <https://fieldcast.flipforward.be/docs> - interactive

The API runs on a free tier that sleeps when idle, so the **first request can take about a
minute** while it wakes up. The page shows "Waking the backend" and retries on its own.

Architecture, API contract and design choices: [`deploy/README.md`](deploy/README.md).

## Repository structure

| Folder | Content |
|---|---|
| [`SecondaryMushroom/`](SecondaryMushroom/) | Secondary Mushroom – predict edible vs. poisonous |
| [`NYCCitiBikeSystemData/`](NYCCitiBikeSystemData/) | NYC Citi Bike trip data – predict daily demand |
| [`deploy/`](deploy/) | Web interface, inference API, hosting configuration |
| [`tools/`](tools/) | Headless notebook runner and the retraining script used by the pipeline |

Notebooks in each folder are numbered in the order they should be run. The data is not in the repository: the
mushroom CSV comes from the lecturer, and the Citi Bike data is downloaded by a script (see
[`NYCCitiBikeSystemData/README.md`](NYCCitiBikeSystemData/README.md)).

## Setup

Python 3.11.9:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```
