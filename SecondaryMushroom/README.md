# Secondary Mushroom – edible or poisonous?

Binary classification on the **noisy** Secondary Mushroom dataset supplied by the lecturer
(missing values, fewer features and rows, possibly flipped labels). Not the UCI version.

## Data

Place `mushroom_project_dataset.csv` in `Data/`. The contents of `Data/` are not tracked by git (see `.gitignore`).

## Notebooks (run in this order)

| # | Notebook | Content | Status |
|---|---|---|---|
| 01 | `01_eda.ipynb` | Exploratory data analysis: target, noise columns, missing values, outliers, categoricals, label noise | ✅ first version |
| 02 | `02_data_preparation.ipynb` | All cleaning steps from 01, without graphs → prepared dataset | ⏳ |
| 03 | `03_model_baseline.ipynb` | Quick first model (to start deployment early) | ⏳ |
| 04 | `04_model_automl.ipynb` | PyCaret / AutoML comparison | ⏳ |
| 05 | `05_model_*.ipynb` | Tuned models, one notebook per model | ⏳ |
| 06 | `06_model_aws.ipynb` | Model trained & tuned on AWS SageMaker | ⏳ |
| 07 | `07_model_comparison.ipynb` | Comparison of all models, error analysis, conclusion | ⏳ |

## Folder structure

```
SecondaryMushroom/
├── Data/          raw and prepared data (not in git)
├── models/        saved models (.pkl, large files gitignored)
├── deploy/        API backend + frontend
└── 0X_*.ipynb     numbered notebooks
```
