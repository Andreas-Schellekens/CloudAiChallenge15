# CLAUDE.md

Guidance for Claude Code (and teammates) working in this repository.

## Project

School project (Thomas More – Deep Learning / Cloud AI challenge, theme "Going green"). The full assignment is in `project assignment.md`: read it before making structural decisions.

- Two datasets, one folder each: `SecondaryMushroom/` (classification: edible vs. poisonous) and `NYCCitiBikeSystemData/` (large trip data, EDA + hypothesis + model).
- Deliverables per dataset: EDA notebooks, one data-preparation notebook (no graphs), one notebook per model (baseline, PyCaret/AutoML, tuned models, AWS SageMaker model), a model-comparison notebook, and a deployed API + frontend with an automated retraining pipeline.
- **Deadline:** upload on Thursday 15 October 2026. **Presentation:** 23 October 2026.

## Environment

- Python **3.11.9** in `.venv` (git-ignored). Create it with `py -3.11 -m venv .venv`, then run `pip install -r requirements.txt`.
- `pycaret==3.3.2` is pinned on purpose. Older 3.x versions don't cap scikit-learn, and pip then installs an incompatible one (e.g. 1.9 → `ImportError: _print_elapsed_time`). This pin brings in scikit-learn 1.4.x and matplotlib 3.7.x.
- matplotlib 3.7: `ax.bar_label` crashes on zero-width bars, so label bars with `ax.text` instead.
- `nbconvert`/`nbclient` are not installed. To execute a notebook headlessly, drive a kernel with `jupyter_client` (available through ipykernel), or run it in VS Code/Jupyter.
- On Windows, joblib prints a harmless `[WinError 2] … physical cores` warning (no `wmic`). Set `LOKY_MAX_CPU_COUNT` to silence it.
- LightGBM 4.7 crashes (`OSError: access violation reading 0x0000000000000000`) in any process where PyCaret was imported first (native library conflict). Fix: `import lightgbm` before `pycaret`, and `setup(..., n_jobs=1)` so CV folds don't run in worker processes (which import PyCaret first).

## Conventions (from the assignment)

- Notebooks are numbered in run order: `01_eda`, `02_data_preparation`, `03_model_baseline`, ... (see `SecondaryMushroom/README.md` for the planned list).
- Every notebook starts with one short markdown cell: the title, a one-line `**Worked on by:** name (what they did)` and a `> **GenAI disclosure:**` quote. No tables, table of contents or input/output overview in the header; keep it streamlined. Every code cell gets a markdown cell above it explaining what it does and why, because team members are examined orally on the code.
- Keep only code that supports the story. Explain decisions, including paths not taken.
- Data files are not committed (`*/Data/*` is git-ignored except `.gitkeep`). Citi Bike data must be downloaded and assembled by code, never manually.
- Model pickles over 100 MB must not be committed. Large model files that a notebook or the retraining pipeline regenerates are git-ignored too (currently `SecondaryMushroom/models/mushroom_pycaret_rf.pkl` and `SecondaryMushroom/models/mushroom_random_forest.joblib`, about 18 MB each). Small deployable pipelines (`*.joblib`, e.g. baseline and gradient boosting) and the model JSON files with the thresholds are committed.
- Notebook prose is in English.
- No emojis anywhere (notebooks, READMEs, comments): use plain words, e.g. "Done" / "Planned" in status tables.

## Status

### SecondaryMushroom
- The data is `SecondaryMushroom/Data/mushroom_project_dataset.csv` (the lecturer's noisy version, **not** UCI): 5000 rows, 12 features + `class`.
- `01_eda.ipynb` is done (first version). Key findings:
  - 62% edible / 38% poisonous. Prioritise recall on *poisonous*.
  - `jumbled_noise_0/1` are row-shuffled copies of `cap_shape` → drop them.
  - Only 12 rows are complete. Missingness is informative only for `stem_surface` and `spore_print_color`; elsewhere it is random (MCAR).
  - Stem height/width 0 = no stem (92% poisonous) → candidate feature `has_stem`.
  - `cap_diameter` ↔ `stem_width` Spearman correlation is 0.85 → consider model-based imputation.
  - Categoricals are individually weak (Cramér's V ≤ 0.23). Keep outliers (plausible sizes).
  - Diagnostic HistGradientBoosting gets ~79% out-of-fold accuracy; ~2% of rows are suspected label noise.
  - The earlier cosmetic issues (missing class-distribution image, loky traceback) are fixed; the notebook now sets `LOKY_MAX_CPU_COUNT`.
- `02_data_preparation.ipynb` is done (first version) and implements the EDA decision table. Outputs: `Data/mushroom_cleaned.csv` (numerical NaN kept, `split` column), `Data/mushroom_prepared_{train,test}.csv` (target `is_poisonous`, key `row_id`), `models/mushroom_preprocessor.joblib`.
  - One fixed stratified 80/20 split (`random_state=42`): 4000 train / 1000 test. All model notebooks must use it and never re-split. Use the prepared train/test CSVs for scikit-learn models, and filter `mushroom_cleaned.csv` on the `split` column for PyCaret/AutoML and SageMaker. Tuning and experiments (e.g. removing suspected label noise) use CV inside train only; the test set is touched only for the final evaluation.
  - Stemless rule: `has_stem` comes from stem height/width **and** `stem_surface = none` (never contradict). For stemless rows, missing measures are set to 0 and missing surface to `none`.
  - Preprocessor (fit on train): median → `log1p` → StandardScaler; one-hot with `min_frequency=10` (30 would merge near-pure categories); `has_stem` most-frequent.
  - 16 feature-level duplicates (look-alike rows, no label conflicts) are kept on purpose.
  - Random forest CV on train: dropping noise gives about +1.5 pt accuracy and +5 pt poisonous recall. Poisonous recall is only about 0.52 at threshold 0.5, so tune the threshold or class weights when modelling.
  - Section 9.2 answers the open questions with 3x5 repeated CV, paired per fold, Nadeau-Bengio corrected SE, rule "adopt only if gain > 2 SE". Dropping `spore_print_color` hurts (-0.0045 AUC, kept). Iterative imputation and log-ratio features give +0.005 AUC together (1.4 SE), so they are not adopted and the preprocessor is unchanged.
- `03_model_baseline.ipynb` is done (first version). Balanced logistic regression (chosen over unweighted by 5-fold CV on train: poisonous recall 0.36 → 0.58, same ROC-AUC 0.70). Test: accuracy 0.67, poisonous recall 0.60, ROC-AUC 0.71; naive floor 0.62 accuracy. Coefficients match the EDA's near-pure categories; linear is too weak (RF reference AUC ≈ 0.83).
  - `models/mushroom_baseline.joblib` = fitted preprocessor + model in one `Pipeline`; takes the cleaned, readable columns (as in `mushroom_cleaned.csv`). The preprocessor outputs a NumPy array, so fit sklearn models on `X_train.to_numpy()` when they go into a deploy pipeline (otherwise sklearn warns about feature names; `set_output(transform="pandas")` on the loaded preprocessor also warns, because its scaler was fitted without names). The API must still apply the cleaning from data prep sections 2–5 (code maps, stem rule, `"missing"`).
  - `models/metrics.csv` is the shared test-metrics file: every model notebook replaces its own rows (key `notebook`) with columns `model, notebook, threshold, accuracy, recall_poisonous, precision_poisonous, f1_poisonous, roc_auc, missed_poisonous, false_alarms`. Reuse the `test_metrics` helper from 03.
  - `test_metrics` classifies `p >= threshold` as poisonous (ties go to the safe side). Random forests produce exact 0.5 ties (12 test rows), so scikit-learn's `predict` / PyCaret's `prediction_label` / `plot_model(confusion_matrix)` give slightly different counts; always derive labels and plots from the probabilities.
- `04_model_automl.ipynb` is done (first version). PyCaret `setup` on the cleaned train rows with `test_data` = our test rows (median imputation, Yeo-Johnson, normalize, 5-fold stratified). CV AUC: RF 0.825, LightGBM 0.809, ExtraTrees 0.792, KNN 0.758, linear ≈ 0.69. PyCaret's `tune_model` makes RF worse (AUC 0.76, recall 0.32; its search space caps `max_depth` at 11 and `min_samples_leaf` ≥ 2); soft blend of the top 3 adds nothing. Chosen: default RF. Test: accuracy 0.796, recall 0.61, precision 0.81, AUC 0.84, 148 missed / 56 false alarms. Sizes dominate RF feature importance. Saved as `models/mushroom_pycaret_rf.pkl` (17 MB, git-ignored, not finalized, not for deployment).
- Shared protocol of the tuned-model notebooks: `RandomizedSearchCV` (40 candidates, ROC-AUC, the same 5 stratified folds with `random_state=42`), then the threshold = highest threshold with out-of-fold recall (poisonous) >= `RECALL_TARGET = 0.90` (`cross_val_predict` on train; scikit-learn 1.4 has no `TunedThresholdClassifierCV`). Each model writes two rows to `metrics.csv` (threshold 0.5 and the tuned threshold), and saves `models/<name>.joblib` (pipeline on cleaned columns, `compress=3`) plus `models/<name>.json` (threshold, rule, CV AUC, hyperparameters). The API must apply the JSON threshold, not `predict()`.
- `05a_model_random_forest.ipynb` is done (first version). Best: 800 trees, entropy, max_depth 30, max_features 0.3, min_samples_leaf 3, balanced_subsample. CV AUC 0.824 → 0.836. Small leaves and 30–50% of the features per split matter; depth 12 is worse. Threshold 0.266 (OOF: precision 0.50, 55% of edible flagged). Test: AUC 0.855; at 0.5, recall 0.686 (119 missed / 58 false alarms); at 0.266, recall 0.894 (40 missed / 317 false alarms). Label-noise cleaning (only edible-labelled rows, done inside the folds, inner CV flags) gives no gain; cleaning before the CV fakes +0.009 AUC. The model is 18 MB compressed and git-ignored: the retraining pipeline must rebuild it (its `.json` with the threshold is committed).
- `05b_model_gradient_boosting.ipynb` is done (first version). `HistGradientBoostingClassifier` instead of LightGBM (pure scikit-learn, no DLL conflict). "native" variant (numerical NaN kept, `OrdinalEncoder` + `categorical_features`) vs "prepared" (our preprocessor), same 40 candidates: best is equal (0.825 vs 0.824), but native is better for 36 of 40 → chosen, and it confirms that median imputation loses nothing. Best: learning_rate ≈ 0.019, 90 leaves, min_samples_leaf 24, early stopping (307 trees), no class weights. Threshold 0.161 (low because there are no class weights). Test: AUC 0.851; at 0.161, recall 0.910 (34 missed / 320 false alarms), so it equals the RF within noise. 1.3 MB.
- **Next:** `06_model_aws.ipynb` (XGBoost on SageMaker with its hyperparameter tuning, same split and threshold rule), `07_model_comparison.ipynb` (same test rows, bootstrap of the differences, permutation importance, error analysis of the missed poisonous mushrooms, choice of the deployed model: RF vs HGB, size 18 MB vs 1.3 MB). Optional: `05c` MLP as a non-tree model family.

### NYCCitiBikeSystemData
- Only a download script so far (`Download/download_citibike.py`). EDA not started.
