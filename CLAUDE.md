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

## Conventions (from the assignment)

- Notebooks are numbered in run order: `01_eda`, `02_data_preparation`, `03_model_baseline`, ... (see `SecondaryMushroom/README.md` for the planned list).
- Every notebook starts with one short markdown cell: the title, a one-line `**Worked on by:** name (what they did)` and a `> **GenAI disclosure:**` quote. No tables, table of contents or input/output overview in the header; keep it streamlined. Every code cell gets a markdown cell above it explaining what it does and why, because team members are examined orally on the code.
- Keep only code that supports the story. Explain decisions, including paths not taken.
- Data files are not committed (`*/Data/*` is git-ignored except `.gitkeep`). Citi Bike data must be downloaded and assembled by code, never manually.
- Model pickles over 100 MB must not be committed.
- Notebook prose is in English.

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
- `02_data_preparation.ipynb` is done (first version) and implements the EDA decision table. Outputs: `Data/mushroom_cleaned.csv` (numerical NaN kept, `split` column), `Data/mushroom_prepared_{train,test}.csv` (target `is_poisonous`, key `row_id`), `models/mushroom_preprocessor.joblib`.
  - One fixed stratified 80/20 split (`random_state=42`): 4000 train / 1000 test. All model notebooks must use it and never re-split. Use the prepared train/test CSVs for scikit-learn models, and filter `mushroom_cleaned.csv` on the `split` column for PyCaret/AutoML and SageMaker. Tuning and experiments (e.g. removing suspected label noise) use CV inside train only; the test set is touched only for the final evaluation.
  - Stemless rule: `has_stem` comes from stem height/width **and** `stem_surface = none` (never contradict). For stemless rows, missing measures are set to 0 and missing surface to `none`.
  - Preprocessor (fit on train): median → `log1p` → StandardScaler; one-hot with `min_frequency=10` (30 would merge near-pure categories); `has_stem` most-frequent.
  - 16 feature-level duplicates (look-alike rows, no label conflicts) are kept on purpose.
  - Random forest CV on train: dropping noise gives about +1.5 pt accuracy and +5 pt poisonous recall. Poisonous recall is only about 0.52 at threshold 0.5, so tune the threshold or class weights when modelling.
- **Next:** `03_model_baseline.ipynb`.

### NYCCitiBikeSystemData
- Only a download script so far (`Download/download_citibike.py`). EDA not started.
