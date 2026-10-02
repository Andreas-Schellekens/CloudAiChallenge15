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
| `models/mushroom_random_forest.joblib` + `.json` | Tuned random forest pipeline (preprocessor + forest, 18 MB compressed; the `.joblib` is not in git: run `05a_model_random_forest.ipynb` or the retraining pipeline to create it) and its decision threshold (0.266, for 90% recall on poisonous) |
| `models/mushroom_gradient_boosting.joblib` + `.json` | Tuned gradient boosting pipeline (ordinal encoder + `HistGradientBoostingClassifier`, 1.3 MB) and its decision threshold (0.161) |
| `models/metrics.csv` | Test-set metrics of every model (one row per model and threshold, column `notebook` says where it came from), read by `07_model_comparison.ipynb` |

All deployable pipelines take the same cleaned, readable columns (as in `mushroom_cleaned.csv`) and return `predict_proba`. A mushroom is called poisonous when its probability is **at least the threshold in the model's JSON file**; `predict()` would use 0.5.

## Notebooks (run in this order)

| # | Notebook | Content | Status |
|---|---|---|---|
| 01 | `01_eda.ipynb` | Exploratory data analysis: target, noise columns, missing values, outliers, categoricals, label noise | Done (first version) |
| 02 | `02_data_preparation.ipynb` | All cleaning steps from 01, without graphs → cleaned + prepared datasets, fitted preprocessor | Done (first version) |
| 03 | `03_model_baseline.ipynb` | Quick first model (to start deployment early): balanced logistic regression vs. naive baseline | Done (first version) |
| 04 | `04_model_automl.ipynb` | PyCaret / AutoML comparison: tree ensembles win, PyCaret's tuning and blending do not help | Done (first version) |
| 05a | `05a_model_random_forest.ipynb` | Random forest with own search space (deep trees), threshold for 90% recall, label-noise experiment | Done (first version) |
| 05b | `05b_model_gradient_boosting.ipynb` | `HistGradientBoostingClassifier`: native missing values/categoricals vs. our preprocessing, tuning, threshold | Done (first version) |
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
