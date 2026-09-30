# Secondary Mushroom – edible or poisonous?

Binary classification on the **noisy** Secondary Mushroom dataset supplied by the lecturer
(missing values, fewer features and rows, possibly flipped labels). Not the UCI version.

## Data

Place `mushroom_project_dataset.csv` in `Data/`. The contents of `Data/` are not tracked by git (see `.gitignore`).
Running `02_data_preparation.ipynb` creates (the raw file is never modified):

| File | Content |
|---|---|
| `Data/mushroom_cleaned.csv` | Readable labels, noise columns dropped, `has_stem`, categorical NaN → `"missing"`, numerical NaN kept, `split` column (train/test) |
| `Data/mushroom_prepared_train.csv` / `_test.csv` | Model-ready: imputed, `log1p` + standardised, one-hot encoded, target `is_poisonous` |
| `models/mushroom_preprocessor.joblib` | Preprocessing pipeline fitted on the training set (reuse in models and API) |

The model notebooks add:

| File | Content |
|---|---|
| `models/mushroom_baseline.joblib` | Baseline pipeline (preprocessor + balanced logistic regression). Input: cleaned, readable features; output: `predict_proba` for edible / poisonous |
| `models/mushroom_pycaret_rf.pkl` | PyCaret's best model (default random forest, trained on train only; ~17 MB, not in git: run `04_model_automl.ipynb` to create it). Kept for the comparison; loading it requires PyCaret |
| `models/metrics.csv` | Test-set metrics of every model (one row per model, column `notebook` says where it came from), read by `07_model_comparison.ipynb` |

## Notebooks (run in this order)

| # | Notebook | Content | Status |
|---|---|---|---|
| 01 | `01_eda.ipynb` | Exploratory data analysis: target, noise columns, missing values, outliers, categoricals, label noise | Done (first version) |
| 02 | `02_data_preparation.ipynb` | All cleaning steps from 01, without graphs → cleaned + prepared datasets, fitted preprocessor | Done (first version) |
| 03 | `03_model_baseline.ipynb` | Quick first model (to start deployment early): balanced logistic regression vs. naive baseline | Done (first version) |
| 04 | `04_model_automl.ipynb` | PyCaret / AutoML comparison: tree ensembles win, PyCaret's tuning and blending do not help | Done (first version) |
| 05 | `05_model_*.ipynb` | Tuned models, one notebook per model | Planned |
| 06 | `06_model_aws.ipynb` | Model trained & tuned on AWS SageMaker | Planned |
| 07 | `07_model_comparison.ipynb` | Comparison of all models, error analysis, conclusion | Planned |

## Folder structure

```
SecondaryMushroom/
├── Data/          raw and prepared data (not in git)
├── models/        saved models (.pkl, large files gitignored)
├── deploy/        API backend + frontend
└── 0X_*.ipynb     numbered notebooks
```
