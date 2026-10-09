# Step 06 on AWS: training and tuning XGBoost on SageMaker (mushroom)

The assignment asks for at least one model that is trained **and** tuned on AWS SageMaker. For the mushroom dataset that is `06_model_aws.ipynb`. It runs in a SageMaker notebook inside an **AWS Academy lab**, which we start from **Canvas**. It does not run on a laptop.

This guide covers the whole procedure: what to prepare on your laptop, how to start the lab from Canvas, where to upload and run the notebook, what to download, and how to bring the results back into the repository. Plan about **1 to 1.5 hours** in the lab, mostly waiting.

> **Which "Canvas"?** This guide uses Canvas only as the place where the AWS Academy course and its labs are started. *Amazon SageMaker Canvas* is something else: a no-code AutoML tool inside SageMaker. We do not use it, because it cannot run our notebook and it chooses the model itself, while the assignment asks for a model that we tune ourselves (and our AutoML step is already notebook 04).

---

## What happens where

```
Laptop (this repository)                AWS Academy lab (started from Canvas)
------------------------                -------------------------------------------------
02_data_preparation.ipynb               SageMaker notebook (Jupyter)
   -> Data/<split>/mushroom_prepared_*     06_model_aws.ipynb + mushroom_aws_data.zip
06_prepare_aws_upload.py   --upload-->        | 1. training rows -> S3 bucket
   -> Data/aws/06_model_aws.ipynb             | 2. tuning job: 20 XGBoost training jobs  ---> separate
   -> Data/aws/mushroom_aws_data.zip          | 3. two final training jobs                     machines
                                              | 4. download the models, evaluate in the notebook
Data/aws/mushroom_aws_results.zip <--download-- 5. mushroom_aws_results.zip
06_model_aws.ipynb (executed)     <--download--    + the executed notebook
   -> models/, metrics.csv, 07
```

- **The notebook only gives orders.** Every training job runs on its own machine, which SageMaker starts, uses and shuts down. So the jobs keep running when the browser closes.
- **The data leaves the laptop as one small zip** (about 180 KB): only the prepared train, validation and test files. No raw data, no credentials, nothing from the rest of the repository.
- **The validation and test sets never go to S3.** They are only used inside the notebook, with the same protocol as notebooks 03 to 05c (`CLAUDE.md` 5.3).

---

## Step 1: prepare the upload on your laptop (2 minutes)

You need the prepared data from `02_data_preparation.ipynb`, in `SecondaryMushroom/Data/train`, `validation` and `test`. If `02` has never run on your machine, run it first.

Then, from the repository folder:

```bash
.venv/Scripts/python.exe SecondaryMushroom/06_prepare_aws_upload.py
```

The script checks the three prepared files (3500 / 750 / 750 rows, 65 columns, no missing values) and writes two files to `SecondaryMushroom/Data/aws/`:

| File | Size | What it is |
|---|---|---|
| `06_model_aws.ipynb` | about 50 KB | a copy of the notebook that runs in the lab |
| `mushroom_aws_data.zip` | about 180 KB | `train/`, `validation/`, `test/` with the prepared CSV files |

`Data/` is git-ignored, so these files never reach GitHub. If you change the notebook later, run the script again so the copy is up to date.

---

## Step 2: start the lab from Canvas (5 minutes)

1. Log in to **Canvas** with your AWS Academy account. This is the AWS Academy Canvas (usually `awsacademy.instructure.com`), not the school's own Canvas. Open the AWS Academy course of this subject.
2. Go to **Modules** and open the lab with SageMaker: either the **Learner Lab** or the lab "room" the lecturer pointed to. The names differ per course.
3. Click **Start Lab** at the top of the lab page. Wait until the dot next to **AWS** turns **green** (1 to 5 minutes the first time).
   - The timer next to it shows how long the session lasts (often 4 hours). When it runs out, the lab stops. Click **Start Lab** again to add time.
   - **Never click "Reset"**: it deletes everything in the lab account, including the jobs, the bucket and your files.
4. Click **AWS** (the green dot). The AWS console opens in a new browser tab. Allow pop-ups if nothing happens.
5. Top right in the console, check the **region**. AWS Academy labs use **N. Virginia (us-east-1)**. Do not change it.

---

## Step 3: open Jupyter in the lab (5 to 10 minutes)

The notebook needs a Jupyter environment inside the lab that may use SageMaker. Find the case that matches your lab:

### Case A: the lab already has a notebook (most lab rooms)

1. In the console, search for **SageMaker AI** (or "SageMaker") and open it.
2. In the left menu, open **Notebooks** (or **Notebook instances**, under *Applications and IDEs*).
3. There is a notebook instance made by the lab. Wait until its status is **InService**. If it is **Stopped**, select it and click **Start** (takes about 5 minutes).
4. Click **Open JupyterLab**.

Some labs instead put a direct link to Jupyter in the lab instructions on the Canvas page. That opens the same thing.

### Case B: Learner Lab without a notebook

Create one notebook instance:

1. **SageMaker AI > Notebooks > Notebook instances > Create notebook instance**.
2. Name: e.g. `cloudai15-mushroom`. Instance type: **ml.t3.medium** (the notebook only gives orders; the training runs on separate machines).
3. Under **Permissions and encryption > IAM role**, choose the existing role **LabRole**. In Learner Lab you cannot create new roles; the other options will fail.
4. Leave everything else at the defaults and click **Create notebook instance**. Wait until the status is **InService** (about 5 minutes), then click **Open JupyterLab**.

### Case C: the lab uses SageMaker Studio

Open **Studio**, start or open a **JupyterLab** space and open it. Everything below works the same. The kernel is called "Python 3 (ipykernel)" there instead of `conda_python3`.

### Look at the lab's own notebook first

The lab usually opens with its own notebook and data. **Do not run it and do not delete it.** Open it only to look up three things. It already works in this lab, so its settings are the safe ones:

- the **instance type** of its training job: search for `instance_type` or `InstanceType`, e.g. `ml.m5.large` or `ml.m4.xlarge`;
- the **bucket**, if it uses a fixed name instead of `default_bucket()`: search for `bucket`;
- the **role**: usually `get_execution_role()`. Our notebook does the same, so there is nothing to change.

Write down these values for step 5.

---

## Step 4: upload our two files (1 minute)

1. In JupyterLab, use the file browser on the left. You can stay in the top folder or make a new folder, e.g. `cloudai15`, and open it.
2. Click the **Upload** button (arrow pointing up, above the file list) and select both files from `SecondaryMushroom/Data/aws/` on your laptop:
   - `06_model_aws.ipynb`
   - `mushroom_aws_data.zip`
3. **Both files must be in the same folder.** You do not have to unpack the zip: the notebook does that itself.

---

## Step 5: open the notebook and check the settings (2 minutes)

1. Double-click `06_model_aws.ipynb`. When asked for a kernel, choose **`conda_python3`** on a notebook instance, or "Python 3 (ipykernel)" in Studio. Do not choose an R, Spark or TensorFlow kernel.
2. In section 2, the first block of the code cell holds the settings:

| Setting | Default | Change it when |
|---|---|---|
| `INSTANCE_TYPE` | `"ml.m5.large"` | the lab's own notebook trains on another type: use that one |
| `MAX_JOBS` | `20` | keep it; only lower it (e.g. 12) if the lab session is almost over |
| `MAX_PARALLEL_JOBS` | `2` | the tuning job fails with `ResourceLimitExceeded`: set it to `1` |
| `BUCKET` | `None` (automatic) | section 3 fails on the bucket, or the lab's notebook uses a fixed bucket: put that name here, e.g. `"my-lab-bucket"` |
| `ROLE_ARN` | `None` (automatic) | only when the role is refused (see troubleshooting) |
| `REUSE_TUNING_JOB` | `None` | only after a lab reset (see troubleshooting) |

---

## Step 6: run the notebook (about 1 hour, mostly waiting)

1. **First run sections 2 and 3 one cell at a time** (Shift+Enter). Section 3 must print the region, the role and the bucket without errors. If it fails, see troubleshooting; nothing has started yet, so you can fix it and run it again.
2. Then **Run > Run All Cells**.

| Section | What happens | Time |
|---|---|---|
| 2-6 | setup, connecting, loading the data, 80/20 tuning split, upload to S3 | under 1 min |
| 7-8 | XGBoost image, search space, the tuning job starts | seconds |
| 8 (wait cell) | 20 trials, 2 at a time; a line per change | about 40 min |
| 9 | table and plots of all trials, best hyperparameters | seconds |
| 10 | two final training jobs (tuned and default), in parallel | about 5 min |
| 11 | XGBoost 1.7.6 is installed in the notebook (if needed), models downloaded | 1 to 2 min |
| 12-15 | validation check, threshold, test evaluation, results zip | seconds |
| 16 | check that nothing is still running | seconds |

**While you wait**, follow the jobs in the console: **SageMaker AI > Training > Hyperparameter tuning jobs** > the job `mushroom-xgb-...`. The *Training jobs* tab lists every trial with its status and its `validation:auc`. A failed job shows its error under *Failure reason*, and the full log is behind *View logs* (CloudWatch). **Take a screenshot of this page for the presentation**: it shows that the tuning ran on AWS.

**The browser may close.** The jobs run in AWS. When you come back, open the notebook and choose *Run All Cells* again. The job names are saved in `outputs/job_names.json`, so the notebook picks up the running jobs instead of starting new ones.

---

## Step 7: download the results (before ending the lab!)

When section 15 has run, the folder holds `mushroom_aws_results.zip` (a few hundred KB). Download **two files**: right-click each in the file browser and choose **Download**.

1. `mushroom_aws_results.zip`
2. `06_model_aws.ipynb`: first **File > Save Notebook** (Ctrl+S), so the outputs are in the file.

Also download any screenshots you took. Only then end the lab with **End Lab** on the Canvas page.

> Files in a lab do **not** always survive. In a lab room, ending or resetting the lab can wipe the notebook. In Learner Lab the notebook instance usually keeps its files, but do not count on it.

---

## Step 8: bring the results back into the repository

1. Replace `SecondaryMushroom/06_model_aws.ipynb` with the downloaded, executed notebook.
2. Put `mushroom_aws_results.zip` in `SecondaryMushroom/Data/aws/`. That folder is git-ignored. The zip also holds the default model, which is not needed in git.
3. Then integrate the results. This is done in the repository, by a teammate or by Claude Code ("integrate the AWS results"):
   - copy `mushroom_xgboost_sagemaker.tar.gz` (a few hundred KB), `mushroom_xgboost_sagemaker.json` and `mushroom_xgboost_tuning_jobs.csv` into `models/`;
   - add the rows of `mushroom_xgboost_metrics.csv` to `models/metrics.csv` (notebook `06_model_aws`);
   - add `xgboost==1.7.6` to `requirements.txt`, so that `07_model_comparison.ipynb` can load the model locally; check with `mushroom_xgboost_predictions.csv` that the local predictions are identical;
   - add the model to `07` (paired bootstrap on the same validation rows), and write the interpretation cells of `06` with the real numbers;
   - update `README.md` (notebook table, model files) and `CLAUDE.md` (5.4, 5.6).

---

## Costs and cleaning up

- An `ml.m5.large` costs about 0.12 dollars per hour, and only for the minutes a job really trains. The whole run (22 jobs of a few minutes) costs well under 1 dollar of the lab budget. The notebook instance itself (`ml.t3.medium`) costs about 0.05 dollars per hour while it is running.
- The notebook creates **no endpoints** (hosted models that cost money every hour). Section 16 checks that no endpoint exists and that no job is still running.
- The S3 data is a few MB and costs practically nothing. To delete it, set `CLEAN_UP = True` in section 16, **but only after step 7**.
- If you created a notebook instance yourself (case B), select it and click **Stop** when you are done. *End Lab* also stops it.

---

## Troubleshooting

| Problem (where) | Cause | What to do |
|---|---|---|
| `NoCredentialsError` or `ExpiredToken` (section 3 or later) | the lab session has expired | **Start Lab** again on Canvas, then re-run the notebook from the top. Running jobs are picked up again (step 6) |
| `Could not create bucket ...` (section 3) | the lab does not allow new buckets | the error lists the existing buckets: put one of them (or the one from the lab's notebook) in `BUCKET` |
| `AccessDenied ... iam:PassRole` (sections 8 or 10) | the job may not use the role that was found | put the role ARN of the lab's notebook in `ROLE_ARN`, e.g. `"arn:aws:iam::<account>:role/LabRole"` (the account number is printed in section 3) |
| `ResourceLimitExceeded` (section 8) | too many machines at the same time for this lab | `MAX_PARALLEL_JOBS = 1`, re-run section 2 and then sections 8 and on |
| `ValidationException ... instance type` or `not authorized ... instance type` | this instance type is not allowed in the lab | use the instance type of the lab's own notebook in `INSTANCE_TYPE` |
| All trials fail (section 8: "No trial succeeded") | usually a data or permission error inside the jobs | open a failed job in the console (step 6) and read *Failure reason* |
| `KeyError: 'eu-...'` (section 7) | an unexpected region | AWS Academy uses `us-east-1`: check the region in the console (step 2) |
| `pip install` fails (section 11) | the notebook has no internet | download `outputs/` (it has `job_names.json`) and the model files from S3 via the console; the evaluation (sections 11-15) can then run in the repository, where `xgboost==1.7.6` can be installed |
| The lab was reset or the files are gone, but the tuning job had started | the notebook lost `outputs/job_names.json` | upload both files again, copy the name of the tuning job (`mushroom-xgb-MMDD-HHMMSS`) from the console into `REUSE_TUNING_JOB` and run all cells: the search is not repeated |
| `FileNotFoundError: mushroom_aws_data.zip` (section 4) | the zip is not in the same folder as the notebook | move it (drag it in the file browser) next to the notebook |

---

## Why the notebook is built this way (for the oral exam)

- **Built-in XGBoost:** AWS provides the algorithm as a ready container, so we send only data and hyperparameters, no training code. The version is fixed at 1.7-1, so the model file can be read with `xgboost==1.7.6`.
- **A tuning hold-out instead of 5-fold CV:** every trial in a SageMaker tuning job scores itself on one `validation` channel. Five folds would mean 100 jobs instead of 20. So the training set is split once, 80/20 and stratified. Our own validation set stays out of the search, because it is reserved for the threshold and the comparison (07).
- **Bayesian search:** SageMaker learns from the finished trials which hyperparameters look promising, so 20 trials go further than 20 random ones (05b used 40 random combinations with `RandomizedSearchCV`).
- **Same protocol as every other model:** the final model is trained on all 3500 training rows, ROC-AUC on validation, a threshold for 90% recall chosen on validation, one test evaluation, and the same metric columns.
- **`boto3` instead of the SageMaker SDK:** `boto3` is installed in every SageMaker notebook and its interface does not change, while the SDK's `Estimator` and `HyperparameterTuner` changed between major versions. Every setting sent to AWS is visible in the notebook.
- **Tested before the lab:** the notebook was run end to end on a laptop against a simulated AWS (fake S3 and SageMaker, scikit-learn in place of the training jobs). That test covered the data handling, the request formats, the restart logic and the evaluation. The real AWS calls can only be tested in the lab.
