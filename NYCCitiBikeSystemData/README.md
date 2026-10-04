# NYC Citi Bike trip data

Trip data of all Citi Bike rides in New York (June 2013 up to the newest month), from
[citibikenyc.com/system-data](https://citibikenyc.com/system-data). The data is far too large for GitHub
(about 32 GB zipped, about 62 GB unpacked), so it is downloaded, unpacked and assembled by code.

## Getting the data (step 00)

From the repository root, with any Python 3.8+ (only the standard library is needed, no `pip install`):

```powershell
python NYCCitiBikeSystemData/00_download_citibike.py --dry-run           # show what would happen
python NYCCitiBikeSystemData/00_download_citibike.py                     # everything
python NYCCitiBikeSystemData/00_download_citibike.py --from 2019 --to 2020
python NYCCitiBikeSystemData/00_download_citibike.py --from 2025-06      # June 2025 up to the newest month
```

| Option | Effect |
|---|---|
| `--from`, `--to` | Period to get, as `YYYY` or `YYYY-MM` (default: everything). Yearly archives (2013–2023) always come as a whole year |
| `--search-dir` | Extra folder where you already have downloaded zips (can be repeated) |
| `--keep-zips` | Keep the downloaded zips in `Data/zip/` after unpacking (default: delete them to save space) |
| `--remove-duplicates` | Delete loose CSVs in a year folder that are exact copies of a file in its month folder |
| `--data-dir` | Use another data folder (default: `NYCCitiBikeSystemData/Data/`) |

The script never downloads anything twice:
- Data that is already assembled is skipped. `Data/.download_manifest.json` records every finished archive; data assembled earlier by hand is recognised by its month folders.
- A zip that is already on your computer (`Data/zip/`, `Data/`, `~/Downloads/output`, `~/Downloads`, or a `--search-dir`) is unpacked instead of downloaded, but only when its size matches the server (so half-finished downloads are ignored).
- An interrupted download resumes where it stopped; an interrupted unpack is redone on the next run.

For scripts and AI agents: the script never asks for input and is safe to run again at any time. The last line of
its output is always a summary such as `SUMMARY status=ok archives=43 already_assembled=43 unpacked_local_zip=0
downloaded=0 dry_run=no` (status `ok`, `dry_run` or `error`). Exit codes: 0 = success, 1 = error (the `ERROR:`
line says what to do; usually just run it again), 2 = invalid arguments. `python NYCCitiBikeSystemData/00_download_citibike.py --help`
shows all options and these rules.

## Folder layout after step 00, `01a` and `01b`

```
Data/
├── 2013-citibike-tripdata/
│   ├── 6_June/
│   │   ├── 201306-citibike-tripdata_1.csv     the trips of the month, in one or more parts
│   │   └── Origineel/201306-citibike-tripdata.csv   unsplit copy of the same trips (2013 and 2018 only)
│   └── ...
├── ...
├── 2026-citibike-tripdata/8_August/202608-citibike-tripdata_1.csv
├── parquet/                                    made by 01a_eda_data_quality.ipynb (about 10 GB)
│   ├── trips/trips_2013-06.parquet ...         all trips in one harmonised schema, one file per month
│   └── removed_duplicates.parquet              the 531 duplicate copies that were removed (for tracing)
└── weather/USW00094728.csv                     daily weather of Central Park (NOAA), downloaded by 01b
```

Read the CSVs **directly inside** the month folders. The `Origineel/` subfolders hold the same trips a second time
(Citi Bike ships 2013 and 2018 both split and unsplit), so reading them as well would count every trip twice.

## Three CSV formats

| Period | Columns |
|---|---|
| 2013-06 to 2016-09 and 2017-04 to 2019-12 | `tripduration, starttime, stoptime, start station id, start station name, start station latitude, start station longitude, end station id, end station name, end station latitude, end station longitude, bikeid, usertype, birth year, gender` |
| 2016-10 to 2017-03 | the same 15 columns in Title Case (`Trip Duration, Start Time, ...`) |
| 2020-01 onwards | `ride_id, rideable_type, started_at, ended_at, start_station_name, start_station_id, end_station_name, end_station_id, start_lat, start_lng, end_lat, end_lng, member_casual` |

`01a_eda_data_quality.ipynb` harmonises them into one schema and stores the result as Parquet in `Data/parquet/trips/`
(see the notebook, section 3, for the column mapping). All later notebooks read the trips with DuckDB:

```python
import duckdb
con = duckdb.connect()
con.execute("CREATE VIEW trips AS SELECT * FROM read_parquet('Data/parquet/trips/*.parquet')")
con.sql("SELECT user_type, count(*) FROM trips GROUP BY ALL").df()
```

## Running `01a_eda_data_quality.ipynb`

Run it from the `NYCCitiBikeSystemData/` folder after step 00. The first run converts all CSVs to Parquet (about
10 GB extra disk space) and takes about 19 minutes; later runs skip months that are already converted (about 15
minutes). DuckDB downloads its `icu` extension (time zones) the first time. To rebuild the Parquet layer, delete
`Data/parquet/` and run the notebook again. The cleaning rules for the data-preparation notebook are in its sections
7.5 and 9.

## Notebooks

| # | Notebook | Content | Status |
|---|---|---|---|
| 00 | `00_download_citibike.py` | Download, unpack and assemble the data | Done |
| 01a | `01a_eda_data_quality.ipynb` | Harmonised schema, Parquet conversion, duplicate removal, conversion checks, completeness over time, data quality per column with cleaning rules, first overview with graphs, decisions for the data preparation | Done |
| 01b | `01b_eda_patterns.ipynb` | Patterns with statistical evidence: weather effects on daily demand, time patterns, holidays, members vs. casual (done); bikes and distance, stations and flows (planned) | In progress |
| 01c | `01c_eda_hypothesis.ipynb` | Testable hypothesis, tested before modelling | Planned |
| 02 | `02_data_preparation.ipynb` | Harmonised, cleaned data without graphs | Planned |
| 03+ | model notebooks and comparison | Same sequence as the mushroom dataset | Planned |
