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

## Folder layout after step 00

```
Data/
├── 2013-citibike-tripdata/
│   ├── 6_June/
│   │   ├── 201306-citibike-tripdata_1.csv     the trips of the month, in one or more parts
│   │   └── Origineel/201306-citibike-tripdata.csv   unsplit copy of the same trips (2013 and 2018 only)
│   └── ...
├── ...
└── 2026-citibike-tripdata/8_August/202608-citibike-tripdata_1.csv
```

Read the CSVs **directly inside** the month folders. The `Origineel/` subfolders hold the same trips a second time
(Citi Bike ships 2013 and 2018 both split and unsplit), so reading them as well would count every trip twice.

## Three CSV formats

| Period | Columns |
|---|---|
| 2013-06 to 2016-09 and 2017-04 to 2019-12 | `tripduration, starttime, stoptime, start station id, start station name, start station latitude, start station longitude, end station id, end station name, end station latitude, end station longitude, bikeid, usertype, birth year, gender` |
| 2016-10 to 2017-03 | the same 15 columns in Title Case (`Trip Duration, Start Time, ...`) |
| 2020-01 onwards | `ride_id, rideable_type, started_at, ended_at, start_station_name, start_station_id, end_station_name, end_station_id, start_lat, start_lng, end_lat, end_lng, member_casual` |

These still have to be harmonised before the analysis (planned in the data-preparation notebook).

## Notebooks

| # | Notebook | Content | Status |
|---|---|---|---|
| 00 | `00_download_citibike.py` | Download, unpack and assemble the data | Done |
| 01 | `01_eda*.ipynb` | Exploratory data analysis, aggregations, hypothesis | Planned |
| 02 | `02_data_preparation.ipynb` | Harmonised, cleaned data without graphs | Planned |
| 03+ | model notebooks and comparison | Same sequence as the mushroom dataset | Planned |
