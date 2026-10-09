"""Step 06, local part: pack everything the AWS Academy lab needs into Data/aws/.

The SageMaker notebook in the lab has no access to this repository, so it only gets what we upload:
- Data/aws/mushroom_aws_data.zip : the prepared train / validation / test files made by 02_data_preparation.ipynb
- Data/aws/06_model_aws.ipynb    : a copy of the notebook that runs in the lab

Run from anywhere (after 02_data_preparation.ipynb):
    .venv/Scripts/python.exe SecondaryMushroom/06_prepare_aws_upload.py

Data/ is git-ignored, so nothing made here ends up on GitHub. See README_AWS.md for the steps in the lab.
"""
import shutil
import sys
import zipfile
from pathlib import Path

import pandas as pd

HERE = Path(__file__).resolve().parent
DATA_DIR = HERE / "Data"
OUT_DIR = DATA_DIR / "aws"
DATA_ZIP = OUT_DIR / "mushroom_aws_data.zip"
NOTEBOOK = HERE / "06_model_aws.ipynb"
TARGET = "is_poisonous"
EXPECTED_ROWS = {"train": 3500, "validation": 750, "test": 750}  # the fixed split of 02 (CLAUDE.md 5.2)
EXPECTED_COLUMNS = 65  # 64 prepared feature columns + the target


def check(split, path):
    if not path.exists():
        sys.exit(f"ERROR: {path} is missing. Run 02_data_preparation.ipynb first.")
    frame = pd.read_csv(path, index_col="row_id")
    problems = []
    if len(frame) != EXPECTED_ROWS[split]:
        problems.append(f"{len(frame)} rows instead of {EXPECTED_ROWS[split]}")
    if frame.shape[1] != EXPECTED_COLUMNS:
        problems.append(f"{frame.shape[1]} columns instead of {EXPECTED_COLUMNS}")
    if frame.isna().any().any():
        problems.append("missing values (the prepared files should have none)")
    if set(frame[TARGET].unique()) != {0, 1}:
        problems.append(f"target {TARGET} is not 0/1")
    if problems:
        sys.exit(f"ERROR in {path.name}: " + "; ".join(problems))
    return frame


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(DATA_ZIP, "w", zipfile.ZIP_DEFLATED) as archive:
        for split in EXPECTED_ROWS:
            path = DATA_DIR / split / f"mushroom_prepared_{split}.csv"
            frame = check(split, path)
            archive.write(path, arcname=f"{split}/{path.name}")  # same layout as Data/ in the lab
            print(f"{split:10s} {len(frame):5d} rows, {int(frame[TARGET].sum()):4d} poisonous  <- {path.relative_to(HERE)}")
    shutil.copy2(NOTEBOOK, OUT_DIR / NOTEBOOK.name)

    print("\nUpload these two files to the lab (README_AWS.md, step 4):")
    for path in [OUT_DIR / NOTEBOOK.name, DATA_ZIP]:
        print(f"  {path}  ({path.stat().st_size / 1e3:.0f} KB)")


if __name__ == "__main__":
    main()
