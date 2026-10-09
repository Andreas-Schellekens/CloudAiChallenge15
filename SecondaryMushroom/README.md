# Secondary Mushroom – edible or poisonous?

Binary classification on the **noisy** Secondary Mushroom dataset supplied by the lecturer
(missing values, fewer features and rows, possibly flipped labels). Not the UCI version.

## Data

Place `mushroom_project_dataset.csv` in `Data/`. The contents of `Data/` are not tracked by git (see `.gitignore`).
Running `02_data_preparation.ipynb` splits the data once (stratified, `random_state=42`) into three sets, each in its own folder (the raw file is never modified):

| Folder | Rows | Used for |
|---|---|---|
| `Data/train/` | 3500 (70%) | Fitting the models; hyperparameter search with 5-fold CV inside train |
| `Data/validation/` | 750 (15%) | Never used for fitting: decision threshold, checking tuned models, choosing the deployed model |
| `Data/test/` | 750 (15%) | Final evaluation, once per model |

Every folder holds two files (key `row_id` = row number in the raw file):

| File | Content |
|---|---|
| `mushroom_cleaned_<set>.csv` | Readable labels, noise columns dropped, `has_stem`, categorical NaN → `"missing"`, numerical NaN kept, target `class` |
| `mushroom_prepared_<set>.csv` | Model-ready: imputed, `log1p` + standardised, one-hot encoded, target `is_poisonous` |

It also saves `models/mushroom_preprocessor.joblib`, the preprocessing pipeline fitted on the training set (reused in the models and the API).

The model notebooks add:

| File | Content |
|---|---|
| `models/mushroom_baseline.joblib` | Baseline pipeline (preprocessor + balanced logistic regression). Input: cleaned, readable features; output: `predict_proba` for edible / poisonous |
| `models/mushroom_pycaret_rf.pkl` | PyCaret's best model (default random forest, trained on train only; ~15 MB, not in git: run `04_model_automl.ipynb` to create it). Kept for the comparison; loading it requires PyCaret |
| `models/mushroom_random_forest.joblib` + `.json` | Tuned random forest pipeline (preprocessor + forest, 26 MB compressed; the `.joblib` is not in git: run `05a_model_random_forest.ipynb` to create it) and its decision threshold (0.161, for 90% recall on poisonous) |
| `models/mushroom_gradient_boosting.joblib` + `.json` | **Deployed model.** Tuned gradient boosting pipeline (ordinal encoder + `HistGradientBoostingClassifier`, 1.0 MB) and its decision threshold (0.139) |
| `models/mushroom_ensemble.joblib` + `.json` | Stacked ensemble of the forest and the gradient boosting model (27 MB, not in git: run `05c_model_ensemble.ipynb`) and its threshold (0.130) |
| `models/mushroom_xgboost_sagemaker.tar.gz` + `.json` | XGBoost trained and tuned on AWS SageMaker (06), the file as SageMaker saved it (0.7 MB) and its threshold (0.116). Takes the 64 prepared columns, so it is used behind `mushroom_preprocessor.joblib`; loading needs `xgboost==1.7.6`. `mushroom_xgboost_tuning_jobs.csv` lists the 20 trials of the search |
| `models/metrics.csv` | Validation and test metrics of every model (one row per model, set and threshold; column `split` = validation/test, column `notebook` says where it came from), read by `07_model_comparison.ipynb` |

All deployable pipelines take the same cleaned, readable columns (as in `mushroom_cleaned_<set>.csv`) and return `predict_proba`. A mushroom is called poisonous when its probability is **at least the threshold in the model's JSON file** (chosen on the validation set); `predict()` would use 0.5.

## Notebooks (run in this order)

| # | Notebook | Content | Status |
|---|---|---|---|
| 01 | `01_eda.ipynb` | Exploratory data analysis: target, noise columns, missing values, outliers, categoricals, label noise | Done (first version) |
| 02 | `02_data_preparation.ipynb` | All cleaning steps from 01, without graphs; train / validation / test split (70/15/15) → cleaned + prepared datasets per set, fitted preprocessor | Done |
| 03 | `03_model_baseline.ipynb` | Quick first model (to start deployment early): balanced logistic regression vs. naive baseline | Done |
| 04 | `04_model_automl.ipynb` | PyCaret / AutoML comparison: tree ensembles win, PyCaret's tuning and blending do not help | Done |
| 05a | `05a_model_random_forest.ipynb` | Random forest with own search space (deep trees), threshold for 90% recall on validation, label-noise experiment | Done |
| 05b | `05b_model_gradient_boosting.ipynb` | `HistGradientBoostingClassifier`: native missing values/categoricals vs. our preprocessing, tuning, threshold | Done |
| 05c | `05c_model_ensemble.ipynb` | Heterogeneous ensemble (forest, boosting, KNN, logistic regression): diversity check, averaging vs. stacking | Done |
| 06 | `06_model_aws.ipynb` + `06_prepare_aws_upload.py` | XGBoost trained and tuned on AWS SageMaker, run in an AWS Academy lab (guide: [`README_AWS.md`](README_AWS.md)). The lab could not create tuning jobs, so the search ran as 20 SageMaker training jobs (random, seed 42) on an 80/20 hold-out of train. Validation AUC 0.811, test AUC 0.835 (21 of 284 poisonous missed at threshold 0.116) | Done |
| 07 | `07_model_comparison.ipynb` | Comparison of all models on the same rows (paired bootstrap), including the SageMaker model; choice of the deployed model, permutation importance, error analysis | Done |

## Folder structure

```
SecondaryMushroom/
├── Data/          raw and prepared data (not in git)
├── models/        saved models (.pkl, large files gitignored)
├── README_AWS.md  how to run 06_model_aws.ipynb in the AWS Academy lab
├── images/aws/    screenshots of the SageMaker run
├── deploy/        API backend + frontend
└── 0X_*.ipynb     numbered notebooks
```
