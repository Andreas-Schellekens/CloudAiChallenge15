# CLAUDE.md

Guidance for Claude Code, other agents and teammates working in this repository. Read this file completely before changing anything; read `project assignment.md` before making structural decisions. When you finish a piece of work, update the relevant sections here (status, numbers, file list) so the next agent starts from the truth.

## 1. Project at a glance

- School project: Thomas More, Deep Learning / Cloud AI challenge, theme "Going green". Full assignment: `project assignment.md`.
- Team (see `README.md`): Andreas Schellekens, Finn Vangronsveld, Mihai Constantin, Zjef Schaeken. Every member is examined orally on every notebook, so code must be explainable.
- Two datasets, one folder each:
  - `SecondaryMushroom/`: binary classification, edible vs. poisonous (lecturer's noisy version of the dataset, **not** UCI).
  - `NYCCitiBikeSystemData/`: large trip data; EDA with statistical evidence, aggregations, at least one testable hypothesis, then a model.
- Deliverables per dataset: EDA notebooks (cleaning + graphs + explanation), one data-preparation notebook (all cleaning, no graphs), one notebook per model (quick baseline, PyCaret/AutoML, at least 2 more tuned models, at least one model trained and tuned on AWS SageMaker), one model-comparison notebook with conclusions, and a deployment: custom web frontend + API backend + hosting + an automated pipeline that retrains/updates the model on every push to GitHub.
- **Deadline:** upload (link to the repo on Canvas) on **Thursday 15 October 2026**. **Presentation:** 23 October 2026 (25 minutes including oral questions).
- Grading: Data & EDA 20%, Modelling & fine-tuning 30%, Evaluation & error analysis 15%, End-to-end pipeline & deployment 20%, Code & project quality 10%, Process & AI ownership 5%. The lecturer values quality over quantity: keep only code that supports the story, but explain paths not taken.

## 2. Repository layout

```
CloudAiChallenge15/
├── CLAUDE.md                     this file
├── README.md                     group name, members, setup
├── project assignment.md         the assignment (source of truth for requirements)
├── requirements.txt              Python dependencies (pycaret pinned, see section 3)
├── SecondaryMushroom/
│   ├── README.md                 data files, model files, notebook list with status
│   ├── 01_eda.ipynb ... 07_model_comparison.ipynb   numbered notebooks (run in order)
│   ├── Data/                     git-ignored except .gitkeep (raw CSV + generated split folders)
│   │   ├── mushroom_project_dataset.csv          raw file from the lecturer (never modified)
│   │   ├── train/       mushroom_cleaned_train.csv, mushroom_prepared_train.csv
│   │   ├── validation/  mushroom_cleaned_validation.csv, mushroom_prepared_validation.csv
│   │   └── test/        mushroom_cleaned_test.csv, mushroom_prepared_test.csv
│   └── models/                   fitted pipelines (.joblib), thresholds (.json), metrics.csv
└── NYCCitiBikeSystemData/
    ├── Download/download_citibike.py   download script (needs rework, see section 6)
    ├── Data/                     git-ignored, about 62 GB of trip CSVs on Andreas's machine
    └── test.txt                  empty placeholder (can be removed once real files exist)
```

There is no `deploy/` folder yet (the mushroom README mentions it as planned).

## 3. Environment and tooling

- Windows 11, Python **3.11.9** in `.venv` (git-ignored). Create with `py -3.11 -m venv .venv`, then `.venv\Scripts\pip install -r requirements.txt`. Use `.venv/Scripts/python.exe` explicitly from bash.
- Installed versions that matter: pycaret 3.3.2, scikit-learn 1.4.2, pandas 2.1.4, numpy 1.26.4, scipy 1.11.4, matplotlib 3.7.5, seaborn 0.13.2, lightgbm 4.7.0, joblib 1.3.2, ipykernel 7.3, jupyter_client 8.10, nbformat 5.11.
- `pycaret==3.3.2` is pinned on purpose: older 3.x versions don't cap scikit-learn, and pip then installs an incompatible one (e.g. 1.9 → `ImportError: _print_elapsed_time`). Because of this pin, scikit-learn is 1.4: there is **no** `TunedThresholdClassifierCV` (thresholds are chosen by hand, see 5.3).
- Not installed: `nbconvert`, `nbclient`, XGBoost, CatBoost, `sagemaker`/`boto3`, any web framework. Add packages to `requirements.txt` when you introduce them.
- Known pitfalls:
  - matplotlib 3.7: `ax.bar_label` crashes on zero-width bars; label bars with `ax.text` instead.
  - Windows/joblib prints a harmless `[WinError 2] ... physical cores` warning. Every notebook sets `os.environ.setdefault("LOKY_MAX_CPU_COUNT", "4")` before importing scikit-learn.
  - LightGBM 4.7 crashes (`OSError: access violation reading 0x0000000000000000`) in any process where PyCaret was imported first. Fix: `import lightgbm` before `pycaret`, and `setup(..., n_jobs=1)` so CV folds don't run in worker processes.
  - Printing notebook text from Python on Windows fails on characters like `→` (cp1252). Set `PYTHONIOENCODING=utf-8`.
- **Running notebooks headlessly:** there is no runner script in the repo. Write a small `jupyter_client` loop: start `KernelManager(kernel_name="python3")` with `cwd` = the notebook's folder (all paths in the notebooks are relative to `SecondaryMushroom/`), run `%matplotlib inline`, execute each code cell with `execute_interactive`, collect stream / execute_result / display_data / error outputs into the cell with `nbformat`, stop at the first error, and write the notebook back. Editing cells programmatically with `nbformat` is fine (keep cell ids).
- Approximate run times (mushroom): 02 about 80 s, 03 about 5 s, 04 about 2.5 min, 05a about 4 min, 05b about 4 min, 05c about 40 s, 07 about 25 s.
- **Git:** default branch `main`, remote `origin` = `https://github.com/Andreas-Schellekens/CloudAiChallenge15.git`. Work on a feature branch (e.g. `mushroom-tuned-models`), commit, push, then merge into `main`. The GitHub CLI (`gh`) is **not installed**, so pull requests cannot be opened from the terminal; merges have been done locally with `git merge --no-ff` and pushed. Only commit, push or merge when the user asks.

## 4. Conventions

- Notebooks are numbered in run order per dataset: `01_eda`, `02_data_preparation`, `03_model_baseline`, `04_model_automl`, `05a/05b/05c_model_*`, `06_model_aws`, `07_model_comparison`.
- Every notebook starts with **one** short markdown cell: the title (`# 0X – Title: Dataset`), one line `**Worked on by:** name (what they did)` and a `> **GenAI disclosure:** ...` quote. No tables, table of contents or input/output overview in the header.
- Every code cell has a markdown cell above it explaining what it does and **why** (oral exam). Interpretation cells after results quote the actual numbers; when results change after a re-run, update the text, never leave stale numbers.
- Explain decisions, including paths not taken and experiments that did not help. Report honestly when a result contradicts an earlier claim.
- Notebook prose, comments and READMEs are in English.
- **No emojis anywhere** (notebooks, READMEs, comments, commit messages). Use plain words, e.g. "Done" / "Planned".
- Data files are never committed (`*/Data/*` is git-ignored except `.gitkeep`). Citi Bike data must be downloaded, unpacked and assembled **by code**, never by hand.
- Model files: nothing over 100 MB may be committed. Large models that a notebook regenerates are git-ignored: `SecondaryMushroom/models/mushroom_pycaret_rf.pkl`, `mushroom_random_forest.joblib`, `mushroom_ensemble.joblib` (15–27 MB each). Small deployable pipelines (`mushroom_baseline.joblib`, `mushroom_gradient_boosting.joblib`, `mushroom_preprocessor.joblib`), all model `.json` files and `metrics.csv` are committed.

## 5. SecondaryMushroom

### 5.1 Data and cleaning

- Raw file: `SecondaryMushroom/Data/mushroom_project_dataset.csv` (lecturer's noisy version, place it there by hand; it is not in git). 5000 rows, 13 columns: 3 numerical (`cap-diameter` in cm, `stem-height`, `stem-width`), 9 categorical as one-letter UCI codes, target `class` (`e`/`p`). It has missing values everywhere (only 12 complete rows), fewer features than UCI, and about 2% suspected flipped labels.
- Cleaning, implemented in `02_data_preparation.ipynb` sections 2–5 (the API must repeat sections 2–5 on user input):
  1. Column names to snake_case (`cap-diameter` → `cap_diameter`).
  2. Letter codes to readable labels with the UCI dictionaries (`CODE_MAPS` in 02). Code `f` means `"none"` (no gills / ring / stem surface), which is information, not a missing value.
  3. Drop `jumbled_noise_0` and `jumbled_noise_1` (row-shuffled copies of `cap_shape`, pure noise).
  4. Keep all rows. Categorical NaN → the category `"missing"`. Numerical NaN stay NaN (imputed later, learned on train only).
  5. Stem rule: "no stem" if `stem_height == 0` or `stem_width == 0` or `stem_surface == "none"`; "stem" if a measure > 0 or `stem_surface` is a real surface. These never contradict. For stemless rows, missing measures become 0 and a missing surface becomes `"none"`. New column `has_stem` = 0 / 1 / NaN (unknown).
  6. Outliers are kept (large sizes are biologically plausible); no ordinal encoding (no categorical has a natural order; `season` is cyclic).
- Cleaned columns (the input of every deployable model, in this order): `cap_diameter, stem_height, stem_width` (float, NaN allowed), `has_stem` (0/1/NaN as float), `spore_print_color, gill_color, habitat, season, ring_type, cap_shape, stem_surface` (strings). Valid values:
  - `spore_print_color`: black, brown, gray, green, pink, purple, white, missing
  - `gill_color`: black, brown, buff, gray, green, none, orange, pink, purple, red, white, yellow, missing
  - `habitat`: grasses, heaths, leaves, meadows, paths, urban, waste, woods, missing
  - `season`: spring, summer, autumn, winter, missing
  - `ring_type`: evanescent, flaring, grooved, large, movable, none, pendant, zone, missing
  - `cap_shape`: bell, conical, convex, flat, others, spherical, sunken, missing
  - `stem_surface`: fibrous, grooves, none, scaly, shiny, silky, smooth, sticky, missing
  - Training ranges: `cap_diameter` 0.56–57.4, `stem_height` 0–32.4, `stem_width` 0–102.5.
- Preprocessor `models/mushroom_preprocessor.joblib` (fitted on train only), a `ColumnTransformer`: numerical → median imputation → `log1p` → `StandardScaler`; `has_stem` → most-frequent imputation; categoricals → `OneHotEncoder(handle_unknown="infrequent_if_exist", min_frequency=10)`. Output: 64 columns as a NumPy array.

### 5.2 The split and the role of each set

One fixed stratified split, made only in `02_data_preparation.ipynb` section 6 (`random_state=42`; the test set is split off first, then validation from the rest). **Never re-split in another notebook.**

| Set | Rows | Folder | Used for |
|---|---|---|---|
| train | 3500 (70%) | `Data/train/` | Fitting models; hyperparameter search with 5-fold CV inside train; experiments (e.g. label-noise removal) with CV inside train |
| validation | 750 (15%) | `Data/validation/` | Never fitted on. Choosing the decision threshold, checking tuned vs. default models, choosing between models (07) |
| test | 750 (15%) | `Data/test/` | Final evaluation only, once per model, after all choices; never used to change a choice |

- Each folder has `mushroom_cleaned_<set>.csv` (cleaned columns + target `class`, key `row_id`) and `mushroom_prepared_<set>.csv` (64 preprocessed columns + target `is_poisonous` (1 = poisonous), key `row_id`). `row_id` is the row number in the raw file; cleaned and prepared files of a set have the same rows in the same order.
- Use the prepared files for scikit-learn models behind our preprocessor, the cleaned files for PyCaret, for models with native missing-value handling, and for checking deploy pipelines.
- Loading pattern used in every notebook:
  ```python
  def data_path(split, kind):  # split: train / validation / test, kind: cleaned / prepared
      return Path("Data") / split / f"mushroom_{kind}_{split}.csv"
  train = pd.read_csv(data_path("train", "prepared"), index_col="row_id")
  ```
- Both classes are 62.1% edible / 37.9% poisonous in every set (284 poisonous in validation and in test).

### 5.3 Shared modelling protocol (follow it for every new mushroom model)

- **Positive class = poisonous.** The costly error is calling a poisonous mushroom edible, so the key metrics are recall (poisonous), missed poisonous mushrooms and false alarms; models are ranked on ROC-AUC (ranking quality, independent of the threshold).
- **CV:** `StratifiedKFold(n_splits=5, shuffle=True, random_state=42)` on the training set, the same folds everywhere. Tuned notebooks use `RandomizedSearchCV(n_iter=40, scoring="roc_auc", cv=cv, random_state=42)`.
- **Validation check:** after the search, score the tuned model and the default model on the validation set.
- **Threshold:** `RECALL_TARGET = 0.90`. The threshold is the highest one whose recall (poisonous) on the **validation set** is still >= 0.90, computed from the model trained on train:
  ```python
  _, recall, thresholds = precision_recall_curve(y_val, p_val)
  threshold = thresholds[recall[:-1] >= RECALL_TARGET].max()
  ```
- **Decision rule:** poisonous when `probability >= threshold` (ties go to the safe side). Never use `predict()` (it uses 0.5, and random forests produce exact 0.5 ties). Derive labels and confusion matrices from the probabilities.
- **Metrics:** use the helper `evaluate(name, split, y_true, p_poisonous, threshold=0.5)` (copied in every model notebook). It returns a row with the columns of `models/metrics.csv`: `model, notebook, split, threshold, accuracy, recall_poisonous, precision_poisonous, f1_poisonous, roc_auc, missed_poisonous, false_alarms`. Each notebook writes its validation and test rows (at 0.5 and at the tuned threshold) and replaces its own old rows (key `notebook`). If the columns of `metrics.csv` ever change, delete the file and re-run 03 → 04 → 05a → 05b → 05c in order.
- **Saved artefacts per model:** `models/<name>.joblib` = a complete pipeline that takes the 11 cleaned columns and returns `predict_proba` (saved with `joblib.dump(..., compress=3)`), plus `models/<name>.json` with `model, notebook, threshold, threshold_rule, cv_roc_auc, validation_roc_auc, hyperparameters, input_columns` (and model-specific extras). Verify that the pipeline on the cleaned test rows gives the same probabilities as the model on the prepared test rows.
- Models that sit behind the fitted preprocessor are trained on `X_train.to_numpy()` (the preprocessor outputs a NumPy array; fitting on a DataFrame makes scikit-learn warn about feature names).
- **No refit on train + validation:** the threshold belongs to the model trained on train only, so the deployed model is exactly the validated one. PyCaret's `finalize_model` is not used for the same reason.
- When re-running after a change in 02, run everything in order: 02 → 03 → 04 → 05a → 05b → 05c → 07 (05c reads the 05a JSON and the 05b model; 07 reads all models and `metrics.csv`), then update all interpretation text.

### 5.4 Model inventory

| File (`models/`) | Notebook | In git | Size | Threshold | CV AUC | Validation AUC | Test AUC | Test at threshold (missed / false alarms of 284 / 466) |
|---|---|---|---|---|---|---|---|---|
| `mushroom_baseline.joblib` | 03 balanced logistic regression | yes | 8 KB | 0.5 (07 computes 0.330 for 90% recall) | 0.697 | 0.704 | 0.711 | 105 / 137 at 0.5 |
| `mushroom_pycaret_rf.pkl` | 04 PyCaret default RF | no | 15 MB | 0.5 | 0.831 | 0.818 | 0.838 | 112 / 49 at 0.5 |
| `mushroom_random_forest.joblib` + `.json` | 05a tuned RF | joblib no, json yes | 26 MB | 0.161 | 0.837 | 0.817 | 0.842 | 20 / 296 |
| `mushroom_gradient_boosting.joblib` + `.json` | 05b tuned HGB (native) | yes | 1.0 MB | 0.139 | 0.821 | 0.819 | 0.847 | 17 / 301 |
| `mushroom_ensemble.joblib` + `.json` | 05c stack RF + HGB | joblib no, json yes | 27 MB | 0.130 | 0.838 | 0.821 | 0.851 | 22 / 292 |

**Deployed model (chosen in 07): `mushroom_gradient_boosting.joblib` with threshold 0.139** from its JSON file.

### 5.5 Deployment contract (for the API / frontend / retraining pipeline)

1. Accept the 11 inputs as readable values (section 5.1); unknown or empty values become NaN (numbers) or `"missing"` (categories). The frontend can offer the valid values listed in 5.1.
2. Apply the stem rule of 5.1 step 5 to fill `has_stem` and the logical zeros.
3. Build a one-row DataFrame with the 11 columns in the order of `input_columns` in the JSON; `has_stem` as float.
4. `p = model.predict_proba(row)[:, 1]`; poisonous if `p >= threshold` from the JSON. Show the probability as well as the verdict (07 found a blind spot: large mushrooms with a stem and no striking features).
5. Unknown categories do not crash: the gradient boosting pipeline's `OrdinalEncoder` maps them to NaN, the preprocessor's one-hot encoder to "infrequent".
6. Retraining pipeline (still to build): it must re-run the data preparation and the deployed model's notebook logic (or an equivalent script) on push, regenerate the git-ignored model files if needed, and keep the threshold rule (validation set) intact.

### 5.6 Notebook status and key findings

| Notebook | Status | Key content |
|---|---|---|
| `01_eda.ipynb` | Done (first version) | 62/38 classes; noise columns are shuffled `cap_shape`; missingness informative only for `stem_surface` and `spore_print_color` (MCAR elsewhere); stemless = 92% poisonous; `cap_diameter` vs `stem_width` Spearman 0.85; categoricals weak (Cramér's V <= 0.23); outliers kept; diagnostic HGB about 79% out-of-fold accuracy, about 2% suspected flipped labels |
| `02_data_preparation.ipynb` | Done | Cleaning 5.1, split 5.2, preprocessor. Section 9: random forest CV on train shows dropping the noise columns helps (+1.5 pt accuracy, +5 pt recall). Section 9.2 (3x5 repeated CV, paired, Nadeau-Bengio corrected SE, adopt only if gain > 2 SE): dropping `spore_print_color` hurts (-0.004 AUC, kept); iterative imputation + log-ratio features +0.005 AUC (1.4 SE), not adopted. 16 look-alike duplicate rows kept |
| `03_model_baseline.ipynb` | Done | Balanced vs. unweighted logistic regression (recall 0.37 → 0.59 in CV, same AUC 0.70); coefficients match the EDA's near-pure categories |
| `04_model_automl.ipynb` | Done | PyCaret with `test_data` = validation rows. CV AUC: RF 0.831, LightGBM 0.816, ExtraTrees 0.797, KNN 0.757, linear about 0.70. `tune_model` makes RF worse (validation 0.755; its space caps `max_depth` at 11); soft blend of top 3 adds nothing |
| `05a_model_random_forest.ipynb` | Done | Best: 800 trees, gini, no depth limit, `sqrt`, min_samples_leaf 1, max_samples 0.9, balanced_subsample (ties with depth 30 / leaf 3 / 30% features). Small leaves matter; depth 12 and `log2` worse. Label-noise cleaning inside the folds gives no gain; cleaning before CV is methodologically wrong (in an earlier 80/20 version it faked +0.009 AUC) |
| `05b_model_gradient_boosting.ipynb` | Done | `HistGradientBoostingClassifier` "native" (NaN kept, `OrdinalEncoder` + `categorical_features`) beats "prepared" (38 of 40 candidates, validation 0.819 vs 0.808). Tuning gains little (default better in CV 0.826 vs 0.821, worse on validation 0.814 vs 0.819; tuned kept). Best: learning_rate about 0.019, 55 leaves, min_samples_leaf 17, early stopping (365 trees), no class weights |
| `05c_model_ensemble.ipynb` | Done | Members RF, HGB, KNN (k=15, distance, CV 0.792), logistic regression. OOF Spearman: RF-HGB 0.88, RF-KNN 0.87, LR 0.46–0.61. Chosen by CV AUC: `StackingClassifier` of RF + HGB with logistic regression meta-learner (weights RF 4.22, HGB 2.10). KNN/LR add nothing; averaging all four hurts |
| `06_model_aws.ipynb` | Planned (postponed by the user) | XGBoost on SageMaker with SageMaker hyperparameter tuning, same split, threshold on validation; then add it to 07. Download the SageMaker notebook into the repo |
| `07_model_comparison.ipynb` | Done (without AWS model) | Paired bootstrap (2000 resamples) on validation: the three tree models are indistinguishable at 90% recall, logistic regression clearly worse. Deployed: gradient boosting (same quality, 1 MB vs 26–27 MB, about 5 ms vs 47–62 ms per prediction). Permutation importance (validation, cleaned columns): stem_surface, stem_width, gill_color, cap_shape, stem_height, ring_type. Error analysis: missed poisonous mushrooms are large and lack strong poisonous signals; mostly missed by all models (data limit) |

Observations to keep in mind: the test set is a little easier than the validation set for every model (AUC about +0.025), so test recall at the validation threshold is 0.92–0.94. A single set of 750 rows has an AUC standard error of about 0.015: compare models on the same rows (paired), never by single numbers from different sets.

### 5.7 Next steps (mushroom)

1. `06_model_aws.ipynb` when the user un-postpones it (see 5.6).
2. Deployment around `mushroom_gradient_boosting.joblib`: API (the assignment rewards a non-Python language and no Streamlit), custom frontend, hosting (e.g. Oracle free tier), automated retraining pipeline on push (e.g. GitHub Actions).
3. Optional extras from the assignment: unsupervised learning (e.g. clustering the mushrooms) with an explanation of what it shows.

## 6. NYCCitiBikeSystemData

### 6.1 Status

Barely started: only `Download/download_citibike.py` is in git. No EDA, hypothesis, preparation, model or deployment yet. This is the biggest risk for the deadline.

### 6.2 Data on Andreas's machine (git-ignored, not reproducible yet)

- `NYCCitiBikeSystemData/Data/<year>-citibike-tripdata/<m>_<Month>/` for 2013 (data from June; the January–May folders exist but are empty) up to 2026 (up to August); about 62 GB, about 400 CSV files. Years were downloaded as zips from `https://s3.amazonaws.com/tripdata/` (yearly zips for 2013–2023, monthly zips from 2024) and split into parts named `YYYYMM-citibike-tripdata_1.csv`, `_2.csv`, ... (up to `_6`). Exception: `2026-citibike-tripdata/4_April/` uses `-1.csv` ... `-4.csv` (hyphen). The 2013 and 2018 month folders also contain an `Origineel/` subfolder with the unsplit original CSV (duplicate data, must not be read twice).
- Four helper scripts live **inside the git-ignored `Data/` folder** (`move_zips.py`, `original.py`, `sort_citibike.py`, `sort_months.py`). They were used to sort files manually, use a hard-coded Windows path to Andreas's machine, and print emojis. They do not meet the "assembled by code, reproducibly" requirement and must be replaced by a committed, path-independent script or notebook.
- `download_citibike.py` saves to `~/Downloads/output` instead of the repo, does not unzip and does not assemble. It needs to download into `NYCCitiBikeSystemData/Data/`, unzip, and combine the files reproducibly (consider sampling or aggregating: the full data is far too large to load at once; Parquet is a good intermediate format).

### 6.3 Three CSV schemas (must be harmonised)

| Period | Header style | Columns |
|---|---|---|
| 2013-06 to 2016-09, and 2017-04 to 2019-12 | lowercase with spaces | `tripduration, starttime, stoptime, start station id, start station name, start station latitude, start station longitude, end station id, end station name, end station latitude, end station longitude, bikeid, usertype, birth year, gender` |
| 2016-10 to 2017-03 | Title Case | same 15 columns, e.g. `Trip Duration, Start Time, ..., User Type, Birth Year, Gender` |
| 2020-01 onwards | new system | `ride_id, rideable_type, started_at, ended_at, start_station_name, start_station_id, end_station_name, end_station_id, start_lat, start_lng, end_lat, end_lng, member_casual` |

Consequences: trip duration must be computed from start/end times in the new format; `usertype` (Subscriber/Customer) maps roughly to `member_casual` (member/casual); birth year and gender exist only in the old format; `rideable_type` (classic/electric bike) only in the new format; station ids changed format between the systems. Missing birth year is written as `\N` in 2013 files.

### 6.4 Next steps (Citi Bike)

1. Reproducible download + unzip + assembly script/notebook (committed, relative paths, no emojis) that also harmonises the schemas.
2. EDA with statistical evidence and aggregations (e.g. trips per day/hour/season, member vs. casual, electric vs. classic, duration distributions, "going green" angle).
3. At least one testable hypothesis, tested before modelling.
4. Data-preparation notebook, then the same model sequence as the mushrooms (baseline, PyCaret, tuned models, AWS model, comparison) and a deployment. Reuse the mushroom protocol ideas (fixed split, validation for choices, test once, shared metrics file).
