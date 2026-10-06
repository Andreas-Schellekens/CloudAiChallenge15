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
    ├── README.md                 data layout, CSV formats, how to get the data
    ├── 00_download_citibike.py   step 00: download, unpack and assemble the data (see section 6.2)
    ├── 01a_eda_data_quality.ipynb   EDA phase 1: Parquet layer, completeness, data quality, overview, decisions (6.4)
    ├── 01b_eda_patterns.ipynb       EDA phase 2: weather, time, bikes and distance, stations, hypotheses (6.5)
    ├── 01c_eda_hypothesis.ipynb     EDA phase 3: out-of-sample test of H1 and H4 (6.6)
    ├── 02_data_preparation.ipynb    daily-demand dataset: cleaning, features, level, split (6.7)
    ├── 03_model_baseline.ipynb      protocol for the model notebooks + baseline linear regression (6.8)
    ├── 04_model_automl.ipynb        PyCaret regression with the yearly folds (6.9)
    ├── models/                   citibike_daily_dataset.json, metrics.csv, citibike_baseline.joblib + .json (committed); citibike_pycaret.pkl (git-ignored)
    └── Data/                     git-ignored: trip CSVs (about 61 GB), parquet/ (about 10 GB), weather/ (18 MB),
                                  train/ validation/ test/ (daily CSVs), citibike_monthly.csv
```

There is no `deploy/` folder yet (the mushroom README mentions it as planned).

## 3. Environment and tooling

- Windows 11, Python **3.11.9** in `.venv` (git-ignored). Create with `py -3.11 -m venv .venv`, then `.venv\Scripts\pip install -r requirements.txt`. Use `.venv/Scripts/python.exe` explicitly from bash.
- Installed versions that matter: pycaret 3.3.2, scikit-learn 1.4.2, pandas 2.1.4, numpy 1.26.4, scipy 1.11.4, matplotlib 3.7.5, seaborn 0.13.2, lightgbm 4.7.0, joblib 1.3.2, ipykernel 7.3, jupyter_client 8.10, nbformat 5.11, duckdb 1.5.6, pyarrow 25.0.1, statsmodels 0.15.
- `pycaret==3.3.2` is pinned on purpose: older 3.x versions don't cap scikit-learn, and pip then installs an incompatible one (e.g. 1.9 → `ImportError: _print_elapsed_time`). Because of this pin, scikit-learn is 1.4: there is **no** `TunedThresholdClassifierCV` (thresholds are chosen by hand, see 5.3).
- Not installed: `nbconvert`, `nbclient`, polars, XGBoost, CatBoost, `sagemaker`/`boto3`, any web framework. Add packages to `requirements.txt` when you introduce them.
- Known pitfalls:
  - matplotlib 3.7: `ax.bar_label` crashes on zero-width bars; label bars with `ax.text` instead.
  - Windows/joblib prints a harmless `[WinError 2] ... physical cores` warning. Every notebook sets `os.environ.setdefault("LOKY_MAX_CPU_COUNT", "4")` before importing scikit-learn.
  - LightGBM 4.7 crashes (`OSError: access violation reading 0x0000000000000000`) in any process where PyCaret was imported first. Fix: `import lightgbm` before `pycaret`, and `setup(..., n_jobs=1)` so CV folds don't run in worker processes.
  - Printing notebook text from Python on Windows fails on characters like `→` (cp1252). Set `PYTHONIOENCODING=utf-8`.
  - Charts in the Citi Bike notebooks use one style defined in the setup cell of `01a` (`INK_*` colours, `plt.rcParams`, the `DIVERGING` red-grey-blue colormap; formats coloured blue / orange / aqua). Reuse it in `01b`/`01c` so the notebooks look alike.
  - DuckDB in a notebook: run `con.execute("SET enable_progress_bar = false")`, otherwise queries write progress widgets into the outputs. `first`, `last`, `name` and `months` are reserved words in DuckDB SQL; don't use them as column aliases.
  - DuckDB `read_csv` guesses the CSV dialect from a sample of each file; always pass `delim=',', quote='"', escape='"'` for the Citi Bike files (some station names are quoted and contain commas).
- **Running notebooks headlessly:** there is no runner script in the repo. Write a small `jupyter_client` loop: start `KernelManager(kernel_name="python3")` with `cwd` = the notebook's folder (all paths in the notebooks are relative to `SecondaryMushroom/`), run `%matplotlib inline`, execute each code cell with `execute_interactive`, collect stream / execute_result / display_data / error outputs into the cell with `nbformat`, stop at the first error, and write the notebook back. Editing cells programmatically with `nbformat` is fine (keep cell ids).
- Approximate run times (mushroom): 02 about 80 s, 03 about 5 s, 04 about 2.5 min, 05a about 4 min, 05b about 4 min, 05c about 40 s, 07 about 25 s.
- Approximate run times (Citi Bike): `04` about 80 s. `03` about 5 s. `02` about 70 s (one 55 s pass over the Parquet files). `01c` about 35 s. `01b` about 7-8 min. `01a` about 19 min on the first run (CSV to Parquet conversion about 4 min, duplicate search about 1 min, CSV line counts about 1.5 min, final key check about 2 min, the data-quality section about 7 min and the overview about 2.5 min of full passes over the Parquet files; the completeness section takes seconds); later runs skip the conversion (about 15.5 min).
- **Git:** default branch `main`, remote `origin` = `https://github.com/Andreas-Schellekens/CloudAiChallenge15.git`. Work on a feature branch (e.g. `mushroom-tuned-models`), commit, push, then merge into `main`. The GitHub CLI (`gh`) is **not installed**, so pull requests cannot be opened from the terminal; merges have been done locally with `git merge --no-ff` and pushed. Only commit, push or merge when the user asks.

## 4. Conventions

- Notebooks are numbered in run order per dataset: `01_eda`, `02_data_preparation`, `03_model_baseline`, `04_model_automl`, `05a/05b/05c_model_*`, `06_model_aws`, `07_model_comparison`. The Citi Bike EDA is split in three: `01a_eda_data_quality`, `01b_eda_patterns`, `01c_eda_hypothesis`; its step 00 is the script `00_download_citibike.py`.
- Every notebook starts with **one** short markdown cell: the title (`# 0X – Title: Dataset`), one line `**Worked on by:** name (what they did)` and a `> **GenAI disclosure:** ...` quote. No tables, table of contents or input/output overview in the header.
- Every code cell has a markdown cell above it explaining what it does and **why** (oral exam). Interpretation cells after results quote the actual numbers; when results change after a re-run, update the text, never leave stale numbers.
- Explain decisions, including paths not taken and experiments that did not help. Report honestly when a result contradicts an earlier claim.
- Notebook prose, comments and READMEs are in English.
- **No emojis anywhere** (notebooks, READMEs, comments, commit messages). Use plain words, e.g. "Done" / "Planned".
- Data files are never committed (`*/Data/*` is git-ignored except `.gitkeep`). Citi Bike data must be downloaded, unpacked and assembled **by code**, never by hand.
- Model files: nothing over 100 MB may be committed. Large models that a notebook regenerates are git-ignored: `SecondaryMushroom/models/mushroom_pycaret_rf.pkl`, `mushroom_random_forest.joblib`, `mushroom_ensemble.joblib` (15–27 MB each), and `NYCCitiBikeSystemData/models/citibike_pycaret.pkl` (32 MB). Small deployable pipelines (`mushroom_baseline.joblib`, `mushroom_gradient_boosting.joblib`, `mushroom_preprocessor.joblib`), all model `.json` files and `metrics.csv` are committed.

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

- Step 00 (getting the data) is done: `00_download_citibike.py`.
- `01a_eda_data_quality.ipynb` (EDA phase 1) is done (2 October 2026), all five steps: harmonised schema, Parquet layer, duplicate removal and conversion checks (notebook sections 1-5, summarised in 6.4 below), completeness over time (section 6), data quality per column with nine cleaning rules (section 7), a first overview with graphs (section 8) and the table of 15 decisions for the data-preparation notebook plus paths not taken (section 9). The work was done on branch `citibike-eda-phase1` and merged into `main` on 2 October 2026.
- `01b_eda_patterns.ipynb` (EDA phase 2) is done (4 October 2026), done on branch `citibike-eda-phase2` and merged into `main` on 4 October 2026: daily demand and the weather, time patterns, bikes and distance, stations and flows, and a summary with four candidate hypotheses and three candidate prediction targets for `01c`. See 6.5.
- `01c_eda_hypothesis.ipynb` (EDA phase 3) is done (5 October 2026), done on branch `citibike-eda-phase3` and merged into `main` on 5 October 2026: H1 and H4 tested out of sample, both not rejected (H1 with a qualification, see 6.6). The team chose H1 as the main hypothesis and **daily demand** as the prediction target (5 October 2026).
- `02_data_preparation.ipynb` (daily-demand dataset) is done (6 October 2026), done on branch `citibike-data-preparation` and merged into `main` on 6 October 2026; the split proposed in 01c was confirmed by the user. See 6.7.
- `03_model_baseline.ipynb` is done (6 October 2026), done on branch `citibike-model-baseline` and merged into `main` on 6 October 2026: shared protocol (6.8) and the baseline. See 6.8.
- `04_model_automl.ipynb` is done (6 October 2026), done on branch `citibike-model-automl` and merged into `main` on 6 October 2026. See 6.9.
- No tuned or AWS model and no deployment yet. This is the biggest risk for the deadline.
- Agreed with the user: the EDA covers all years 2013–2026; external weather data (e.g. NOAA Central Park or Open-Meteo, downloaded by code) may be added in the pattern/hypothesis notebooks; statistics on trip level use effect sizes and confidence intervals, tests on daily aggregates or a fixed sample (p-values are meaningless at n = 323 million).

### 6.2 Getting the data: `00_download_citibike.py`

**How an agent runs it** (needs Python 3.8+ and internet; only the standard library; never asks for input):
1. `.venv/Scripts/python.exe NYCCitiBikeSystemData/00_download_citibike.py --dry-run` (a few seconds). Read the `Plan:` line (archives to assemble, GB to download, GB free) and the last line, `SUMMARY status=dry_run archives=.. already_assembled=.. ...`. If `already_assembled` equals `archives`, the data is complete: stop.
2. Check with the user before a large download (a full run is about 32 GB download and 62 GB on disk, tens of minutes to hours). Prefer a limited period with `--from`/`--to` when the task allows it.
3. Run the same command without `--dry-run` **in the background** (e.g. Bash `run_in_background`) and wait for it to exit; output is line-buffered, so progress can be read from the log.
4. Check the result by the exit code and the last line: exit 0 + `SUMMARY status=ok` = done. Exit 1 + `SUMMARY status=error` = network, disk or archive problem; the `ERROR:` line says what to do, and re-running the same command is always safe (finished archives are skipped, downloads resume). Exit 2 = invalid arguments.
5. Do not use `--remove-duplicates` (it deletes files) or delete anything in `Data/` without the user's consent.

Details:
- Run from anywhere: `python NYCCitiBikeSystemData/00_download_citibike.py` (all data), `--from 2019 --to 2020` or `--from 2025-06` (periods as `YYYY` or `YYYY-MM`), `--dry-run` (show the plan only). Other options: `--search-dir` (extra folder with already downloaded zips), `--keep-zips`, `--remove-duplicates`, `--data-dir`. Only the Python standard library is used.
- It reads the archive list from the S3 bucket `https://s3.amazonaws.com/tripdata/` (yearly zips 2013–2023, monthly zips from 2024, about 32 GB zipped; `JC-...` Jersey City files are skipped), so new months are picked up automatically.
- No double downloads: an archive is skipped when `Data/.download_manifest.json` marks it complete, or (for data assembled before the script existed) when its month folders already contain CSVs. Otherwise a local zip with the exact server size is reused (`Data/zip/`, `Data/`, `~/Downloads/output`, `~/Downloads`, `--search-dir`); otherwise it downloads to `Data/zip/` with resume support. An archive is marked "incomplete" in the manifest before unpacking, so an interrupted unpack is redone.
- Unpacking: every CSV (and every zip nested inside the 2020–2023 yearly archives) is extracted to the short staging folder `Data/_unpacking/<n>/` (Windows' 260-character path limit), macOS junk is skipped, and every CSV is moved to `Data/<year>-citibike-tripdata/<m>_<Month>/` by the `YYYYMM` at the start of its name. `-partN.csv` names (2026-04) become `-N.csv`. Zips in `Data/zip/` are deleted after unpacking unless `--keep-zips`.
- Archive quirks it handles: 2013 and 2018 contain every month twice (split parts in the month folders plus an unsplit CSV in the year folder); the unsplit copy goes to `<month>/Origineel/`. 2018 also contains the April parts twice; exact duplicates are stored once. 2017 parts are named `YYYYMM-citibike-tripdata.csv_1.csv` (kept as is).
- Tested: a dry run recognises all 43 archives on Andreas's machine as complete; assembling 2013 and 2026-04 from scratch gives file names and sizes identical to Andreas's folders.
- Andreas's data (assembled by hand before step 00 existed) was verified and tidied on 2 October 2026: all 280 files of 2013–2019 and 2024–2026 match the server sizes exactly, the 139 files of 2020–2023 (nested compressed zips, not size-checkable without downloading) all end with a complete last line. The two loose 2018 duplicates, the old helper scripts, the `.DS_Store` files and the empty 2013 January–May folders were removed, and the manifest was written. His `Data/` folder now has the same layout as a fresh run of step 00: 14 year folders, 419 CSVs (400 in month folders, 19 unsplit copies in `Origineel/`) and `.download_manifest.json`.
- **Reading the data:** new notebooks read the Parquet layer made by `01a` (section 6.4), not the CSVs. If CSVs must be read, read only those directly inside the month folders, never `Origineel/` (same trips again).

### 6.3 Three CSV schemas (harmonised in `01a`, see 6.4)

| Period | Header style | Columns |
|---|---|---|
| 2013-06 to 2016-09, and 2017-04 to 2019-12 | lowercase with spaces | `tripduration, starttime, stoptime, start station id, start station name, start station latitude, start station longitude, end station id, end station name, end station latitude, end station longitude, bikeid, usertype, birth year, gender` |
| 2016-10 to 2017-03 | Title Case | same 15 columns, e.g. `Trip Duration, Start Time, ..., User Type, Birth Year, Gender` |
| 2020-01 onwards | new system | `ride_id, rideable_type, started_at, ended_at, start_station_name, start_station_id, end_station_name, end_station_id, start_lat, start_lng, end_lat, end_lng, member_casual` |

Consequences (all handled in `01a`): trip duration must be computed from start/end times in the new format; `usertype` (Subscriber/Customer) maps roughly to `member_casual` (member/casual); birth year and gender exist only in the old format; `rideable_type` (classic/electric bike) only in the new format; station ids changed format between the systems. Missing birth year is written as `\N` in 2013 files.

### 6.4 The harmonised Parquet layer (made by `01a_eda_data_quality.ipynb`)

- `NYCCitiBikeSystemData/Data/parquet/trips/trips_YYYY-MM.parquet`: one file per month (159 files, about 10 GB), **323,817,107 trips**, every trip once. Built from the CSVs directly in the month folders only. A month is converted only when its file is missing (written to `.tmp`, then renamed); to rebuild, delete `Data/parquet/` and re-run `01a`.
- Read it with DuckDB: `con.execute("CREATE VIEW trips AS SELECT * FROM read_parquet('Data/parquet/trips/*.parquet')")` (path relative to `NYCCitiBikeSystemData/`). Do not load it into pandas as a whole; aggregate or sample in SQL.
- Columns: `ride_id` (new only), `started_at`, `ended_at` (TIMESTAMP, local New York time, no time zone), `duration_s` (ended - started, all formats), `tripduration_s` (reported, old only), `start_station_id`, `start_station_name`, `start_lat`, `start_lng`, `end_station_id`, `end_station_name`, `end_lat`, `end_lng`, `user_type` (`member`/`casual`; old Subscriber/Customer mapped), `rideable_type` (new only), `bike_id`, `birth_year`, `gender` (old only; gender 0 unknown, 1 male, 2 female), `source_format` (`old`, `old_title_case`, `new`), `source_month` (DATE, month of the file), `source_file`.
- Station ids are text. Old ids are whole numbers (`3359.0` was converted to `3359`). New ids always have two decimals: a share of the rows in every month since 2020 wrote `5024.1` for `5024.10`; the conversion adds the zero back (verified with the station names).
- Timestamp shapes parsed: ISO with 0, 3 or 4 decimals, `M/D/YYYY HH:MM:SS` (2014-09 to 2016-09), `M/D/YYYY H:MM` (2015-01 to 2015-06, no seconds). 0 unparsed timestamps.
- Duplicates removed (key: `ride_id`, or `bike_id` + `started_at` for the old system; keep the copy in the file of the start month, then the one with the earliest end): 512 trips of 30 April 2026 that are also in the May 2026 files, 1 trip of 2013-07-01 00:00:00 in both the June and July 2013 files, 18 pairs inside one old file (same rental logged twice). The removed copies are in `Data/parquet/removed_duplicates.parquet`; for every file, CSV lines = Parquet rows + removed copies.
- **Count trips by `started_at`, never by `source_month`:** the old system files a trip by its start month, the new system (2020+) by its **end** month (except April 2026, filed by start month, which caused the April/May duplicates). 45,871 new trips started before their file month: 38,799 on the evening before the 1st, 7,072 more than a day earlier (durations of weeks to over a year, median about 32 days; all removed by rule D2). Trips that start on 31 August 2026 and end in September are not published yet.
- **Completeness (01a section 6):** every month and every day from 2013-06-01 to 2026-08-31 has trips, except 10 days with zero trips: 2016-01-23 to 26, 2017-02-09, 2017-03-14 to 16, 2021-02-02, 2026-02-23 (winter storms; the day after is always far below normal; to be confirmed with weather data). Biggest year-on-year drops: April 2020 -61% (COVID-19), February 2021 -45%, February 2026 -40%. Trips per year by start: 8.1 million (2014) to 45.8 million (2025); January-August 2026 equals January-August 2025 (30.2 million).
- **Cleaning rules (01a section 7.5)**, to be applied in the Citi Bike data-preparation notebook, not in the Parquet files:
  - D1 duration: old system `tripduration_s` (the computed difference is minute-rounded in 2015-01..06 and 1 hour off across daylight-saving changes); new system the time-zone-aware difference (`timezone('America/New_York', ...)`, DuckDB `icu` extension) plus 3600 s when still negative (the repeated 01:00-01:59 hour on the November change). Corrects about 1.7 million durations; no negatives remain. The SQL is `CORRECTED_DURATION` in 01a.
  - D2 remove trips over 24 h (156,916; lost/stolen bikes; since 2024 the system closes rentals after about 26 h).
  - S1 keep trips without a station; skip trips without any end location (607,626: no end station and no end coordinates) in end-station, route and duration analyses.
  - S2 coordinates outside lat 40.4-41.0 / lng -74.3 to -73.6 (0,0, Montreal and Los Angeles test stations) to NULL.
  - S3 remove trips from/to non-public stations (regex `NON_PUBLIC` in 01a: depots, workshops, test/lab/demo stations; about 23,000 trips). Valet stations stay.
  - R1 remove round trips under 3 minutes (1.68 million; re-docks: 31% of 1-minute trips are round trips against a 1% baseline from 4 minutes).
  - U1 empty user type (51,780, 2016-10..2017-03) stays unknown; U2 gender 0 to NULL (9.4 million); U3 birth year before 1920 or 1969 with gender 0 (the system's default, mainly 2018-2019) to NULL (2.8 million).
  - Together the remove rules drop 0.58% of the trips; about 322 million remain.
- Other facts from 01a section 7: no trip under 60 s in the published data (Citi Bike removes them); median trip about 10 minutes in both systems; only `classic_bike` and `electric_bike` occur as bike types.
- 01a section 8 defines the view `clean_trips` (the remove rules D2, S3, R1 applied on the fly, plus the corrected `duration`): 321,939,739 trips. Reuse that SQL in `01b`/`01c` until the data-preparation notebook writes a cleaned dataset. Overview findings (2025 unless stated): working days have rush-hour peaks at 08:00 (7.7% of the day's trips) and 17:00 (9.9%), weekends one broad afternoon hump; Tuesday-Friday about 128,000-134,000 trips a day, Sunday about 107,000; casual share 10-14% until 2019, 27% in 2021, 17-19% since 2023, seasonal (9.5% in January/February, 22.5% in August); casual trips 18.7 min vs. member 11.1 min on average; electric bikes 14% of trips in 2020, 70.5% in 2025 (dips to about 20% mid-2021 and about 40% spring 2023), average trip as long as a classic one (12.2 vs. 12.7 min); stations 334 (2013) to 2,244 (2025), the busiest 10% have 38% of the trips (top: W 21 St & 6 Ave, Pier 61 at Chelsea Piers).
- Known issues still to analyse: 86,482 electric-bike trips without start station and mostly without start coordinates (origin unclear, kept); birth year missing for about 6.2 million old trips (96% casual).

### 6.5 EDA phase 2: `01b_eda_patterns.ipynb`

- Plan (agreed step by step with the user): 1. daily demand and the weather (done, notebook section 2), 2. time patterns with evidence (done, section 3), 3. bikes and distance (done, section 4), 4. stations and flows (done, section 5), 5. summary and candidate hypotheses for `01c` (done, section 6). All five steps are done.
- Setup: same plot style as `01a`; `clean_trips` is defined with the same SQL as `01a` section 8 (copied, with `CORRECTED_DURATION`, `NON_PUBLIC`, `REMOVE_RULES`).
- Weather: NOAA GHCN-Daily, Central Park station `USW00094728`, file `Data/weather/USW00094728.csv` (about 18 MB, whole station history), downloaded once by the notebook from `https://www.ncei.noaa.gov/data/global-historical-climatology-network-daily/access/USW00094728.csv` (no account). Units: PRCP tenths of mm, SNOW and SNWD mm, TMAX/TMIN tenths of degrees C, AWND tenths of m/s. Complete for 2013-06-01..2026-08-31 except snow depth (4 days) and wind (226 days). Path not taken: Open-Meteo (modelled grid values instead of station measurements).
- Step 1 findings (daily cleaned trips, 4,840 days):
  - All days without trips and the near-empty days were snowstorms (e.g. 693 mm of snow on 2016-01-23, 376 mm on 2021-02-01, 224 + 277 mm on 2026-02-22/23).
  - Model: OLS on log(daily trips) with max temperature + its square, precipitation class (dry / light up to 2.5 mm / moderate 2.5-10 / heavy 10-25 / very heavy over 25), snow on the ground, weekday and `year_month` fixed effects (159 values: growth, season, COVID); Newey-West (HAC, 7 lags) standard errors; the 10 zero days left out. R-squared 0.905.
  - Effects against a dry day: light -9.7% (95% CI -11.4 to -7.9), moderate -23.3%, heavy -37.9%, very heavy -54.1%, snow on the ground -24.3%. Temperature against 20 degrees: 0 degrees -56%, 10 degrees -27%, peak at about 32 degrees (+14%). Wind (robustness, 4,604 days) -4.0% per m/s; rain effects unchanged.
  - Casual riders are more weather-sensitive than members (separate models): heavy rain -51% vs. -36%, very heavy -69% vs. -52%, snow on the ground -38% vs. -24%, 0 instead of 20 degrees -80% vs. -52%; the rain and temperature intervals do not overlap. Candidate hypothesis for `01c`.
  - Fit 2025: within 10% on 55% of days, within 20% on 78%; largest misses are holidays (Christmas -74%, Thanksgiving -62%, New Year's Day -57%), examined in step 2.
- Step 2 findings (section 3; the weather model plus `holiday` (US federal holidays, pandas `USFederalHolidayCalendar`) and `christmas_week` (other days 24 Dec - 1 Jan), separate models per user type):
  - Weekdays against Monday: members Tue-Thu +4.5 to +6.4%, Saturday -22%, Sunday -28%; casual Friday +19%, Saturday +84%, Sunday +63%.
  - Federal holiday: members -40% (95% CI -44 to -35), casual +38% (+28 to +48); Christmas week members -39%, casual +13% (CI -3 to +31). Per holiday (median of the weather-model residual over the years): members Christmas -73%, Thanksgiving -68%, New Year's Day -56%, Veterans Day +5% (often a working day); casual up on most holidays, down only on Thanksgiving (-12%).
  - Working-day rush-hour share (trips starting 07-09 and 17-19): members about 37% before 2020, 31-33% since (-4.5 points 2023-2025 vs. 2017-2019, CI -5.0 to -3.9; the morning peak dropped most, likely hybrid work); casual about 20-23% before 2020, 25-26% since. 2025 gap member minus casual 6.8 points (CI 6.6 to 7.0), was 14-18 points before 2020.
  - Median trip duration: members 8-10 min (11.5 in 2020, 8.1 in 2025); casual about 18.5-21 min until 2020, 11.7 in 2025; 2025 difference 3.6 min (CI 3.3 to 3.9). The two groups converge since 2020 (causes not testable with this data: pricing, more casual riders using the bike as transport, hybrid work).
  - Confidence intervals on daily series use HAC (Newey-West, 7 lags) regressions, also for simple means (`mean_with_hac_ci`).
- Step 3 findings (section 4; view `rides` = `clean_trips` with `distance_km`, the haversine straight-line distance, a lower bound of the route; round trips, trips without end coordinates and coordinates outside the New York box left out; 97.7% of the cleaned trips have a distance; coordinates are precise, almost none rounded):
  - 2025 medians: member classic 1.09 km at 9.3 km/h, member electric 1.66 km at 12.6 km/h, casual classic 1.65 km at 7.6 km/h, casual electric 1.86 km at 10.8 km/h.
  - Same-day comparison 2025 (daily medians, HAC CI): member electric trips +0.55 km (+51%, CI 0.53 to 0.58) and +3.4 km/h (+36%) vs. classic; casual +0.20 km (+13%) and +3.3 km/h (+42%). Explains the equal durations found in 01a.
  - Electric share grows with distance: 45% under 0.5 km, 70% at 1 km, 77% at 2 km, 88% at 9.5-10 km. Members' classic trips got shorter (median 1.46 km in 2020, 1.09 km in 2025).
  - Distance ridden (straight line, lower bound): 10.5 million km in 2013, 36.4 in 2019, 91.2 in 2025. CO2 only as an illustrated upper bound (EPA about 400 g CO2 per mile = about 250 g/km: about 23,000 t in 2025 if every km replaced a car km; about 4,600 t if a fifth did); the data cannot tell what the trips replaced.
- Step 4 findings (section 5; 2025, cleaned trips; working days = weekdays without federal holidays, 250 days):
  - Routes (ordered station pairs, no round trips): 1,552,661 routes for 44.7 million trips; the 1,000 busiest carry 4.7%, the 10,000 busiest 20.1%. The busiest are short hops within a neighbourhood (Long Island City, Williamsburg, Lower East Side; median 3-5 min), used about equally in both directions. Predicting per station or area is more realistic than per route.
  - Net flow per station (arrivals minus departures per working day; morning = trips starting/ending 07:00-09:59, evening 16:00-18:59; stations with at least about 2 trips a day: 2,196): in the morning residential areas (Upper West/East Side, East Village, Lower East Side, more faintly Brooklyn and Queens) empty and Midtown and Lower Manhattan fill up; the evening mirrors it. Spearman morning vs. evening -0.86 (95% CI -0.87 to -0.85, Fisher z). Most emptying in the morning: W 43 St & 10 Ave (-61 a day); most filling: E 47 St & Park Ave (+98).
  - About 6,000 bikes per working day end the morning rush in another part of the city (sum of morning surpluses), but only about 790 remain as net surplus over the whole day (0.6% of about 130,000 trips per working day): the commute largely rebalances itself; the imbalance in between is the rebalancing task (an hourly station-level forecast would help).
- Step 5 (section 6): summary table and the hypotheses for `01c`. Because the hypotheses were found on all the data, `01c` must test them out of sample: fit on days up to 2023-12-31, test on the hold-out period 2024-01-01..2026-08-31 (974 days, about 120 million trips). Pre-registered in 01b section 6.2:
  - H1 (recommended main hypothesis): rain reduces casual trips relatively more than member trips. Test: daily trips per user type (two rows per day), one log-linear model with the weather/weekday/month terms and a user type x precipitation class interaction, HAC SEs. Rejected if on the hold-out period the interaction for heavy and very heavy rain is not negative or its 95% CI includes 0.
  - H2: on federal holidays member trips fall and casual trips rise (holiday terms of section 3.1 on the hold-out period, 28 holidays). Rejected if the member effect is not below 0 or the casual effect not above 0 (95% CI).
  - H3: the longer a trip, the more likely it is electric (logistic regression of electric on straight-line distance per user type, fixed random sample of hold-out trips). Rejected if the odds ratio per km is not above 1.
  - H4 (bridge to the model): weather and calendar predict daily demand better than the calendar alone (two models fitted up to 2023, both with trend, month, weekday and holidays, one also with temperature, precipitation and snow; MAPE on the hold-out days, paired comparison of daily errors). Rejected if the weather model is not more accurate.
  - Candidate prediction targets: daily demand (recommended: strongest signal, about 4,800 rows, deployable with a weather forecast as input, fits "going green"), member vs. casual per trip (groups converge since 2020), hourly demand per station (useful for rebalancing, large and noisy). On 5 October 2026 the team chose H1 as the main hypothesis and daily demand as the prediction target.

### 6.6 EDA phase 3: `01c_eda_hypothesis.ipynb`

- Tests H1 (main) and H4 (bridge to the daily-demand model) exactly as pre-registered in 01b section 6.2: discovery period 2013-06-01..2023-12-31 (3,866 days), hold-out period 2024-01-01..2026-08-31 (974 days, 119.7 million cleaned trips, 59 heavy and 29 very heavy rain days). H2 and H3 are not tested (they stay findings of 01b). Same setup, views and weather file as 01b.
- **H1 not rejected, with a qualification.** Stacked daily data (two rows per day: member and casual), log-linear model with everything per user type (`C(user_type, Treatment('member')) * (tmax + tmax^2 + C(precipitation) + snow_on_ground + C(weekday)) + user_type:year_month`), HAC on the per-day sums (`cov_type="hac-groupsum"`, 7 lags). Hold-out interaction casual x heavy rain -0.142 (95% CI -0.188 to -0.096, about -13% relative to members), very heavy -0.222 (-0.278 to -0.166, about -20%); light -0.040, moderate -0.118. Per group on the hold-out: heavy rain members -33%, casual -42%; very heavy -47% vs. -58%. In the discovery period the gap was about twice as large (heavy -0.287, very heavy -0.500): the groups converge.
- Robustness (01c section 4.4), five specifications on the hold-out: the interaction is negative in all; both intervals exclude 0 as soon as weekday or monthly level may differ per user type (specifications 2-5); with everything shared (specification 1, residual sd 0.31 vs. 0.21, R-squared 0.919 vs. 0.964) the intervals include 0 (heavy -0.094, CI -0.220 to 0.031; very heavy -0.163, CI -0.328 to 0.003). Reported as: consistent in direction, significant only when the different weekly/monthly patterns of the groups are modelled. Specification 5 is the test because it mirrors the separate models of 01b.
- **H4 not rejected.** Fitted on the discovery period: calendar model `log(total) ~ years (linear trend) + C(month) + C(weekday) + holiday + christmas_week` (R-squared 0.696) vs. the same plus `tmax + tmax^2 + C(precipitation) + snow_on_ground` (0.849); no `year_month` terms (unknown for a new month). Hold-out: MAPE 30.8% vs. 16.2%, median APE 15.6% vs. 11.4%, within 20% on 59.6% vs. 74.4% of days; paired difference 14.6 points (95% CI 7.5 to 21.6, HAC); weather model better in every hold-out year (2024 22.4 vs. 12.3, 2025 23.3 vs. 15.1, 2026 54.7 vs. 23.8; 2026 high because of the snowy January-February). Both models too high in summer 2025 (the linear trend up to 2023 does not know that growth slowed).
- Implications for the daily-demand model (01c section 6): weather features essential (tmax non-linear, precipitation, snow on the ground; wind small); calendar features (weekday, month/season, federal holidays, Christmas week); the trend is the hardest part; time-based split only. Proposed split for the data preparation (to be decided with the team): train 2013-06..2023-12, validation 2024, test 2025-01..2026-08 (the EDA saw all years, so the test period is unseen by the models, not by us). Because H1 holds, predicting members and casual riders separately and adding them up is an option.

### 6.7 Data preparation: `02_data_preparation.ipynb`

- One SQL pass (about 55 s) applies D1, D2, S3, R1 and counts the cleaned trips per start day: 321,939,739, identical to `clean_trips` of 01a. Rules S2 and U1-U3 are not needed for daily counts; no cleaned trip-level copy is written (path not taken, 10 GB). Trips with an unknown user type are in `total` (`unknown` column, 51,244).
- The last day is **30 August 2026**: trips that start on 31 August and end in September are in the unpublished September file (0.1-0.7% of last-day trips cross midnight). 4,839 days, 10 storm days kept with 0 trips.
- Weather (NOAA, units converted): `tmax_c`, `tmin_c`, `precipitation_mm`, `snowfall_mm`, `snow_depth_mm` (4 missing warm days filled with 0), `wind_ms` (226 missing, mostly October 2018 - March 2019, kept as NaN); derived `precipitation` (5 classes as in 01b) and `snow_on_ground`. Calendar: `weekday`, `month`, `day_of_year`, `holiday` (US federal), `christmas_week`.
- **Level feature** `level_12m` = mean trips per day over months *m-13..m-2* for a day in month *m* (also `member_level_12m`, `casual_level_12m`). Reason: Citi Bike publishes month data 3-12 days after the month ends (S3 listing, 2025-06..2026-09), so *m-1* is not known early in month *m*. First day with a level: 2014-07-01. Every validation/test day has a higher level than any training day (train max 92,565; validation 93,751-117,725; test 120,167-127,394), so the recommended target is **`demand_ratio` = total / level_12m** (median 1.16 train, 1.24 validation, 1.07 test); predicted trips = ratio x level. The ratio still drifts with growth (above 1 in growth years): the remaining trend problem.
- Rolling-origin check inside train (01c weather model, fit on years before Y, predict Y = 2016..2023, MAPE): trend 21.7% vs ratio 17.4% without 2020-2021 (trend better only in 2016 and slightly in 2021); free coefficient on log level 18.3%; COVID flag 17.6% (not adopted); wind, new snow, tmin, precipitation in mm change the error by at most 0.2 points (columns kept as extras).
- **Split** (confirmed by the user, 6 October 2026): train 2014-07-01..2023-12-31 (3,471 days, 193.3 M trips, 9 zero days, 220 missing wind), validation 2024 (366 days, 44.1 M), test 2025-01-01..2026-08-30 (607 days, 75.4 M, 1 zero day 2026-02-23). Files `Data/<split>/citibike_daily_<split>.csv` (key `date`), `Data/citibike_monthly.csv`, `models/citibike_daily_dataset.json` (committed). Sanity checks: no gaps or overlap, no NaN except wind, the level uses only past months, trip totals add up.
- Suggestions for the model notebooks (not yet fixed): model `demand_ratio` or its log; leave zero days out of fitting for log targets, keep them in evaluation; metrics MAE, MAPE on days with trips, share within 20%; time-series CV inside train (expanding window or `TimeSeriesSplit`), never shuffled; impute wind inside the pipeline or leave it out. Deployment needs calendar + weather forecast (tmax, precipitation, snow depth) + level from `citibike_monthly.csv`; trained on measured weather, used with forecasts. Open question for the deployment: the retraining pipeline cannot read the 10 GB Parquet layer on GitHub, so it will need the small daily files from somewhere (they are git-ignored now).

### 6.8 Model protocol and baseline: `03_model_baseline.ipynb`

**Protocol for every Citi Bike model notebook** (fixed in 03 section 3, follow it like 5.3 for the mushrooms):
- Load the sets via `models/citibike_daily_dataset.json` (`DATASET["files"][split]`, `index_col="date"`). Never re-split.
- Fit target `log(demand_ratio)`; predicted trips = `exp(prediction) * level_12m`. Every saved pipeline takes the input columns and returns the log ratio.
- Days without trips (9 in train, 1 in test) are left out of fitting, kept in evaluation.
- Metrics via `evaluate(name, split, actual, predicted)` (copy it): `model, notebook, split, days, mae, rmse` (trips, all days), `mape, median_ape, within_20pct, bias_pct` (days with trips; bias > 0 = too many trips predicted). Rows for validation and test go to `NYCCitiBikeSystemData/models/metrics.csv`; a notebook replaces its own rows (key `notebook`).
- Choices on yearly expanding-window folds inside train: `yearly_folds(index)` with `CV_YEARS = [2016, 2017, 2018, 2019, 2022, 2023]` (2020-2021 stay in training data but are not predicted); for scikit-learn searches `cv=yearly_folds(fit_days.index)`, `scoring="neg_mean_absolute_error"` on the log ratio. Then check on validation 2024; the test period once per model; no refit on train + validation.
- Deployment recipe `features_for_day(date, tmax_c, precipitation_mm, snow_depth_mm, monthly)` in 03 section 8 (calendar from the date, precipitation class, snow flag, `level_12m` from `Data/citibike_monthly.csv`); verified on all 607 test days.

**Baseline results:**
- Candidates on the folds (mean MAPE) and validation: seasonal naive (median ratio per month x weekday) 31.6% / 22.2%; linear regression on the total 17.4% / 12.4%; linear per user type summed (H1 idea) 17.3% / 12.2% (MAE 12,177 vs 12,787, but within 20% 80.3 vs 82.2): practically equal, not adopted (twice the parts; members are about 82% of trips).
- Baseline = `LinearRegression` in a `Pipeline` (`OneHotEncoder(drop="first")` on weekday, month, precipitation; `PolynomialFeatures(2)` on `tmax_c`; passthrough holiday, christmas_week, snow_on_ground). Input columns: `weekday, month, holiday, christmas_week, tmax_c, precipitation, snow_on_ground`. Saved as `models/citibike_baseline.joblib` (4 KB) + `.json`.
- Validation: MAE 12,787, RMSE 16,670, MAPE 12.4%, within 20% 82.2%, bias -4.2%. Test: MAE 17,206, MAPE 17.4%, within 20% 73.6%, bias +7.8%. Seasonal naive test MAPE 38.0%. Over 2024-2026 (972 days with trips) 15.5% vs 16.2% for the 01c trend model.
- Error analysis: monthly bias -14% (January 2024) to -6% (June 2024) in the growth year, +9% to +18% from June 2025 (growth stopped, the model learned a median ratio of about 1.16), +34% / +31% in January / February 2026 (deep snow, mean depth 115 mm in February). Biggest validation misses: Thanksgiving and the day after (+81%), Christmas (+59%), summer days with very heavy rain (-42% to -48%, rain timing unknown), old snow of 30-50 mm (-42% to -44%).
- Coefficients match 01b: rain -9.3 / -24.4 / -37.7 / -52.4%, 0 degrees -57% vs 20, Saturday -11%, Sunday -19%, holiday -32%, Christmas week -35%, snow on the ground -34% (01b -24%).
- Candidate improvements for the tuned models: big-holiday features (Thanksgiving and the day after, Christmas, New Year's Day), snow depth as a number, a recent-growth feature, more weight for recent years; per user type as an option.

### 6.9 AutoML: `04_model_automl.ipynb`

- PyCaret regression (`lightgbm` imported first, `n_jobs=1`), `data` = training days with trips, `test_data` = validation 2024, target `log_ratio`, `fold_strategy=YearlyFolds(fit_days.index)` (a small splitter class with the protocol folds; `data_split_shuffle=False`, `fold_shuffle=False`, order checked), `normalize=True`, median imputation. A `tmax_c_sq` column is added so linear models can draw the temperature curve. PyCaret's linear regression reproduces the baseline (max difference 0.9%, validation MAE 12,817 vs 12,787).
- Base features, fold MAE on the log scale: gbr 0.154, huber 0.157, lightgbm 0.159, rf 0.168, lr 0.168; lasso / elastic net / lasso-LARS = dummy 0.387 (default alpha=1 too strong). Validation MAPE: gbr 11.1, huber 11.2 (lowest MAE 10,768, bias -1.0%), lightgbm 11.8, lr 12.4, rf 13.5.
- Extended features (`day_of_year, precipitation_mm, snow_depth_mm, snowfall_mm, tmin_c, wind_ms`): trees gain most (et -0.032, rf -0.021, gbr -0.013, lightgbm -0.009), linear less (lr -0.008, huber -0.005); top gbr 0.140, rf 0.147, lightgbm 0.150. LAR breaks (0.49, collinear columns).
- Tuning gbr (30 iterations): folds 0.1404 -> 0.1402, validation 10.2% -> 9.9%. Blend gbr + rf + lightgbm: folds 0.1381 (chosen), validation MAPE 9.5%, MAE 9,658.
- Chosen blend: validation MAE 9,658, MAPE 9.5%, within 20% 88.5%, bias -3.1%; test MAE 13,806, MAPE 14.6%, within 20% 80.9%, bias +8.6% (baseline 17,206 / 17.4% / 73.6% / +7.8%). Predicts about 5,000 trips on the blizzard day 2026-02-23 (actual 0).
- Monthly bias has the same shape as the baseline (2025 from June +9 to +16%, January/February 2026 +37.5% / +29.5%; training has 104 days with >= 100 mm snow depth, so not unseen weather): the drift is a target/level problem, not a model problem.
- Importance (first gbr of the blend): tmax 48%, precipitation_mm 15%, tmin 8%, tmax_sq 7%, day_of_year 6%, snow depth 5%, snowfall 4%; month columns and the snow flag almost 0.
- `models/citibike_pycaret.pkl` (32 MB) git-ignored, regenerated by 04; not for deployment (needs PyCaret).

### 6.10 Next steps (Citi Bike)

1. `01a` is done. If `01b` needs row-level plots, add a fixed, seeded sample (e.g. 1% per month) of `clean_trips`.
2. `01b` is done.
3. `01c` is done (6.6).
4. `02` is done (6.7).
5. `03` and `04` are done (6.8, 6.9). Next: `05a/05b...` tuned models on the extended features (hand-tuned gradient boosting, e.g. `HistGradientBoostingRegressor` with native NaN handling; a second family such as random forest or Huber), with candidate features against the drift (recent growth: last published months vs. the same months a year earlier) and for the big holidays (Thanksgiving and the day after, Christmas, New Year's Day); then `06` AWS, `07` comparison. Then a deployment that predicts tomorrow's trips from a weather forecast (the baseline can already be deployed).
