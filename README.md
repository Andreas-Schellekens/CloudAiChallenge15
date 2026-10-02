# CloudAiChallenge15

Machine Learning / Cloud AI challenge – theme "Going green".

## Group

**Group name:** CloudAiChallenge15

| # | Member |
|---|---|
| 1 | Andreas Schellekens |
| 2 | Finn Vangronsveld |
| 3 | Mihai Constantin |
| 4 | Zjef Schaeken |

## Repository structure

| Folder | Dataset |
|---|---|
| [`SecondaryMushroom/`](SecondaryMushroom/) | Secondary Mushroom – predict edible vs. poisonous |
| [`NYCCitiBikeSystemData/`](NYCCitiBikeSystemData/) | NYC Citi Bike trip data |

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
