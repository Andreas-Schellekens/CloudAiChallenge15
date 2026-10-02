"""Download, unpack and assemble the NYC Citi Bike trip data.

Step 00 of the NYCCitiBikeSystemData pipeline. Run it before any notebook:

    python NYCCitiBikeSystemData/00_download_citibike.py                    # all years
    python NYCCitiBikeSystemData/00_download_citibike.py --from 2019 --to 2020
    python NYCCitiBikeSystemData/00_download_citibike.py --from 2025-06     # June 2025 up to the newest month
    python NYCCitiBikeSystemData/00_download_citibike.py --dry-run          # only show what would happen

Result (the folder layout of Citi Bike's own yearly archives, also used for the newer monthly files):

    NYCCitiBikeSystemData/Data/
        2013-citibike-tripdata/6_June/201306-citibike-tripdata_1.csv
        2013-citibike-tripdata/6_June/Origineel/201306-citibike-tripdata.csv   (unsplit copy, see below)
        ...
        2026-citibike-tripdata/8_August/202608-citibike-tripdata_1.csv
        zip/                          downloaded archives (deleted after unpacking unless --keep-zips)
        .download_manifest.json       which archives are complete (do not edit)

What the script does, per archive listed on https://s3.amazonaws.com/tripdata/ (yearly zips for 2013-2023,
monthly zips from 2024; Jersey City files are skipped):
1. Skip it when its data is already in Data/ (recorded in the manifest, or, for data assembled earlier by hand,
   every month folder already holds CSV files).
2. Otherwise look for the zip on this computer (Data/zip/, Data/, ~/Downloads/output, ~/Downloads and any
   --search-dir). A zip only counts when its size equals the size on the server, so half-finished downloads
   are never used.
3. Otherwise download it to Data/zip/ (resumable: an interrupted download continues where it stopped).
4. Unpack it, including the monthly zips nested inside the 2020-2023 archives, and skip macOS junk
   (__MACOSX/, .DS_Store).
5. Move every CSV to <year>-citibike-tripdata/<m>_<Month>/ based on the YYYYMM at the start of its name.
   Some yearly archives (2013, 2018) contain every month twice: split into parts (_1, _2, ...) and as one
   unsplit file. The unsplit copy goes to the month's Origineel/ subfolder, so code that reads the month
   folder does not count those trips twice. Exact duplicates are not copied twice.

Only the Python standard library is used, so the script runs without installing anything.

For AI agents and automation:
- Never asks for input; safe to run again at any time (finished archives are skipped, downloads resume).
- Run --dry-run first: it only reads the archive list from the server (a few seconds) and prints the plan,
  including how many GB will be downloaded. A full run downloads about 32 GB and writes about 62 GB; that takes
  from tens of minutes to hours, so run it in the background and limit it with --from/--to when possible.
- Output is line-buffered (safe to follow in a log). The last line is always one machine-readable summary:
      SUMMARY status=ok archives=43 already_assembled=43 unpacked_local_zip=0 downloaded=0 dry_run=no
  status is ok, dry_run or error.
- Exit codes: 0 = success (or dry run), 1 = error (network, disk space, damaged archive; the message says what
  to do, usually just run again), 2 = invalid command-line arguments.
"""

import argparse
import json
import re
import shutil
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

BUCKET_URL = "https://s3.amazonaws.com/tripdata/"
DEFAULT_DATA_DIR = Path(__file__).resolve().parent / "Data"
MANIFEST_NAME = ".download_manifest.json"

MONTH_FOLDERS = {1: "1_January", 2: "2_February", 3: "3_March", 4: "4_April", 5: "5_May", 6: "6_June",
                 7: "7_July", 8: "8_August", 9: "9_September", 10: "10_October", 11: "11_November",
                 12: "12_December"}

ARCHIVE_RE = re.compile(r"^(\d{4})(\d{2})?-citibike-tripdata\.zip$")    # 2013-... (yearly) or 202401-... (monthly)
CSV_MONTH_RE = re.compile(r"^(\d{4})(\d{2})-citibike-tripdata")         # every trip CSV starts with YYYYMM
UNSPLIT_RE = re.compile(r"^\d{6}-citibike-tripdata\.csv$")              # one file for the whole month
PART_RE = re.compile(r"-part(\d+)\.csv$")                               # 202604-...-part1.csv -> ...-1.csv


# ---------------------------------------------------------------- archives on the server

def list_archives():
    """All NYC trip archives on the server as dicts: name, size, year, month (None for a yearly archive)."""
    archives, marker = [], ""
    while True:
        xml = urllib.request.urlopen(f"{BUCKET_URL}?marker={marker}", timeout=60).read()
        root = ET.fromstring(xml)
        ns = {"s3": root.tag.split("}")[0].strip("{")}
        for item in root.findall("s3:Contents", ns):
            name = item.find("s3:Key", ns).text
            match = ARCHIVE_RE.match(name)
            if match:  # skips JC-... (Jersey City) and index.html
                archives.append({"name": name, "size": int(item.find("s3:Size", ns).text),
                                 "year": int(match.group(1)),
                                 "month": int(match.group(2)) if match.group(2) else None})
        if root.find("s3:IsTruncated", ns).text != "true":
            return sorted(archives, key=lambda a: (a["year"], a["month"] or 0))
        marker = name


def parse_period(text, is_end):
    """'2019' -> (2019, 1) or (2019, 12); '2019-06' -> (2019, 6)."""
    match = re.fullmatch(r"(\d{4})(?:-(\d{1,2}))?", text)
    if not match:
        raise argparse.ArgumentTypeError(f"use YYYY or YYYY-MM, not {text!r}")
    year, month = int(match.group(1)), match.group(2)
    return year, int(month) if month else (12 if is_end else 1)


def in_period(archive, start, end):
    first = (archive["year"], archive["month"] or 1)
    last = (archive["year"], archive["month"] or 12)
    return first <= end and last >= start


# ---------------------------------------------------------------- what is already on this computer

def month_dir(data_dir, year, month):
    return data_dir / f"{year}-citibike-tripdata" / MONTH_FOLDERS[month]


def months_with_data(data_dir, year):
    """Months of a year whose folder directly contains at least one CSV (Origineel/ is not counted)."""
    return {m for m in MONTH_FOLDERS if month_dir(data_dir, year, m).is_dir()
            and any(month_dir(data_dir, year, m).glob("*.csv"))}


def already_assembled(archive, data_dir, manifest):
    """True when the archive's data is in Data/ already. Updates the manifest for data assembled earlier."""
    entry = manifest.get(archive["name"])
    if entry is not None:
        # "complete" with the same size; an "incomplete" entry means the last run stopped halfway
        return entry.get("status") == "complete" and entry.get("size") == archive["size"]
    have = months_with_data(data_dir, archive["year"])
    if archive["month"] is not None:
        found = archive["month"] in have
    else:
        # A yearly archive covers every month from the first one with data up to December
        # (the 2013 archive starts in June, when Citi Bike started).
        found = bool(have) and have == set(range(min(have), 13))
    if found:
        manifest[archive["name"]] = {"status": "complete", "size": archive["size"], "source": "existing files"}
    return found


def find_local_zip(archive, search_dirs):
    """A local copy of the archive with exactly the size on the server, or None."""
    for folder in search_dirs:
        candidate = folder / archive["name"]
        if candidate.is_file():
            if candidate.stat().st_size == archive["size"]:
                return candidate
            print(f"    ignoring {candidate} (size differs from the server: incomplete or outdated)")
    return None


def load_manifest(data_dir):
    path = data_dir / MANIFEST_NAME
    return json.loads(path.read_text()) if path.exists() else {}


def save_manifest(data_dir, manifest):
    (data_dir / MANIFEST_NAME).write_text(json.dumps(manifest, indent=2, sort_keys=True))


# ---------------------------------------------------------------- download

def download(archive, zip_dir):
    """Download (or resume) the archive into zip_dir and return its path."""
    zip_dir.mkdir(parents=True, exist_ok=True)
    target = zip_dir / archive["name"]
    partial = target.with_name(target.name + ".part")
    done = partial.stat().st_size if partial.exists() else 0
    if done > archive["size"]:  # left over from an older version of the file
        partial.unlink()
        done = 0
    request = urllib.request.Request(BUCKET_URL + archive["name"])
    if done:
        request.add_header("Range", f"bytes={done}-")
        print(f"    resuming at {done / 1e6:.0f} of {archive['size'] / 1e6:.0f} MB")
    with urllib.request.urlopen(request, timeout=60) as response, open(partial, "ab" if done else "wb") as out:
        if done and response.status != 206:  # the server ignored the range request: start again
            out.seek(0)
            out.truncate()
            done = 0
        next_report, start = 0.0, time.time()
        while chunk := response.read(1024 * 1024):
            out.write(chunk)
            done += len(chunk)
            if done / archive["size"] >= next_report:
                speed = done / max(time.time() - start, 1e-6) / 1e6
                print(f"    {done / 1e6:7.0f} / {archive['size'] / 1e6:.0f} MB ({done / archive['size']:4.0%}, "
                      f"{speed:.1f} MB/s)", flush=True)
                next_report += 0.10
    if partial.stat().st_size != archive["size"]:
        raise RuntimeError(f"download of {archive['name']} is incomplete; run the script again to resume")
    partial.replace(target)
    return target


# ---------------------------------------------------------------- unpack and assemble

def unpack(zip_path, staging):
    """Extract the CSVs of one archive, and of the zips nested in it, into the staging folder.

    Every file is written as staging/<member number>/<file name>, without the archive's own folders:
    short paths (Windows refuses paths over 260 characters) and no clash when an archive contains the
    same file name twice. macOS junk (__MACOSX/, .DS_Store) is skipped. Reading through archive.open
    checks every file's CRC, so a damaged archive raises an error instead of producing broken CSVs.
    """
    with zipfile.ZipFile(zip_path) as archive:
        for number, member in enumerate(archive.infolist()):
            name = Path(member.filename).name
            if member.is_dir() or member.filename.startswith("__MACOSX/") or not name.endswith((".csv", ".zip")):
                continue
            target = staging / str(number) / name
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, open(target, "wb") as out:
                shutil.copyfileobj(source, out, 1024 * 1024)
    for nested in sorted(staging.rglob("*.zip")):
        print(f"    unpacking nested {nested.name}")
        unpack(nested, nested.parent / "n")
        nested.unlink()


def assemble(staging, data_dir):
    """Move the CSVs from the staging folder to <year>/<m>_<Month>/; returns the months that were filled."""
    by_month = {}
    for csv in staging.rglob("*.csv"):
        match = CSV_MONTH_RE.match(csv.name)
        if not match:
            print(f"    skipping unexpected file {csv.name}")
            continue
        by_month.setdefault((int(match.group(1)), int(match.group(2))), []).append(csv)

    for (year, month), files in sorted(by_month.items()):
        target_dir = month_dir(data_dir, year, month)
        has_parts = any(not UNSPLIT_RE.match(f.name) for f in files)
        for csv in sorted(files):
            name = PART_RE.sub(r"-\1.csv", csv.name)
            destination = target_dir / name
            if UNSPLIT_RE.match(name) and has_parts:
                destination = target_dir / "Origineel" / name  # same trips as the parts: keep apart
            if destination.exists():
                if destination.stat().st_size == csv.stat().st_size:
                    continue  # exact duplicate (e.g. the 2018 archive contains April twice)
                raise RuntimeError(f"{destination} exists with a different size; remove it and run again")
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(csv), str(destination))
    return sorted(by_month)


def needed_space(zip_path):
    """Rough number of bytes the unpacked archive needs (nested zips are counted twice, to be safe)."""
    with zipfile.ZipFile(zip_path) as archive:
        return sum(m.file_size * (2 if m.filename.endswith(".zip") else 1) for m in archive.infolist())


# ---------------------------------------------------------------- report on data assembled earlier

def stray_duplicates(data_dir):
    """CSVs lying loose in a year folder while the same file (same name and size) is in its month folder."""
    strays = []
    for year_dir in sorted(data_dir.glob("*-citibike-tripdata")):
        for csv in year_dir.glob("*.csv"):
            match = CSV_MONTH_RE.match(csv.name)
            if match:
                twin = year_dir / MONTH_FOLDERS[int(match.group(2))] / csv.name
                if twin.exists() and twin.stat().st_size == csv.stat().st_size:
                    strays.append(csv)
    return strays


# ---------------------------------------------------------------- main

STATS = {"archives": 0, "already_assembled": 0, "unpacked_local_zip": 0, "downloaded": 0}


def print_summary(status, dry_run):
    counts = " ".join(f"{key}={value}" for key, value in STATS.items())
    print(f"SUMMARY status={status} {counts} dry_run={'yes' if dry_run else 'no'}", flush=True)


def main(args):
    data_dir = args.data_dir.resolve()
    zip_dir = data_dir / "zip"
    search_dirs = [zip_dir, data_dir, Path.home() / "Downloads" / "output", Path.home() / "Downloads",
                   *[d.resolve() for d in args.search_dir]]
    data_dir.mkdir(parents=True, exist_ok=True)
    manifest = load_manifest(data_dir)

    print(f"Data folder: {data_dir}")
    if sys.platform == "win32" and len(str(data_dir)) > 180:
        print("Warning: this folder path is very long. Windows refuses paths over 260 characters, so unpacking "
              "may fail. Move the repository to a shorter path or use --data-dir.")
    archives = [a for a in list_archives() if in_period(a, args.start, args.end)]
    STATS["archives"] = len(archives)
    print(f"{len(archives)} archives on the server in the chosen period "
          f"({sum(a['size'] for a in archives) / 1e9:.1f} GB zipped)\n")

    plan = []
    for archive in archives:
        if already_assembled(archive, data_dir, manifest):
            STATS["already_assembled"] += 1
            print(f"  {archive['name']:32s} already assembled, skipped")
            continue
        local = find_local_zip(archive, search_dirs)
        action = f"unpack local copy {local}" if local else f"download {archive['size'] / 1e6:.0f} MB"
        print(f"  {archive['name']:32s} {action}")
        plan.append((archive, local))
    if not args.dry_run:
        save_manifest(data_dir, manifest)  # remembers data that was assembled before this script existed
    to_download = sum(a["size"] for a, local in plan if local is None)
    print(f"\nPlan: {len(plan)} archive(s) to assemble, {to_download / 1e9:.1f} GB to download, "
          f"{shutil.disk_usage(data_dir).free / 1e9:.0f} GB free on this disk.")

    strays = stray_duplicates(data_dir)
    if strays:
        verb = "Removing" if args.remove_duplicates and not args.dry_run else "Found"
        print(f"\n{verb} {len(strays)} loose duplicate CSV(s) (identical copy in the month folder):")
        for csv in strays:
            print(f"  {csv.relative_to(data_dir)}")
            if args.remove_duplicates and not args.dry_run:
                csv.unlink()
        if not args.remove_duplicates:
            print("  Run with --remove-duplicates to delete them, so no trip is read twice.")

    if args.dry_run or not plan:
        print("\nNothing to do." if not plan else "\nDry run: nothing was downloaded or changed.")
        return

    for number, (archive, local) in enumerate(plan, start=1):
        print(f"\n[{number}/{len(plan)}] {archive['name']}")
        zip_path = local or download(archive, zip_dir)
        free = shutil.disk_usage(data_dir).free
        if needed_space(zip_path) > free:
            raise RuntimeError(f"not enough disk space to unpack {archive['name']} ({free / 1e9:.1f} GB free). "
                               "Free some space or use --from/--to for fewer years, then run again.")

        manifest[archive["name"]] = {"status": "incomplete", "size": archive["size"]}
        save_manifest(data_dir, manifest)  # if the script stops now, this archive is redone next time
        staging = data_dir / "_unpacking"
        shutil.rmtree(staging, ignore_errors=True)
        print("    unpacking")
        unpack(zip_path, staging)
        months = assemble(staging, data_dir)
        shutil.rmtree(staging)
        if not months:
            raise RuntimeError(f"{archive['name']} contained no trip CSVs; the archive format may have changed.")
        manifest[archive["name"]] = {"status": "complete", "size": archive["size"],
                                     "source": "local zip" if local else "downloaded",
                                     "months": [f"{y}-{m:02d}" for y, m in months]}
        save_manifest(data_dir, manifest)
        STATS["unpacked_local_zip" if local else "downloaded"] += 1
        print(f"    done: {len(months)} month(s), {months[0][0]}-{months[0][1]:02d} to {months[-1][0]}-{months[-1][1]:02d}")

        if zip_path.parent == zip_dir and not args.keep_zips:
            zip_path.unlink()  # only zips this script manages; never a zip found in another folder

    print("\nAll archives in the chosen period are assembled.")


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--from", dest="start", type=lambda t: parse_period(t, False), default=(2013, 1),
                        help="first year or month to get, YYYY or YYYY-MM (default: everything)")
    parser.add_argument("--to", dest="end", type=lambda t: parse_period(t, True), default=(9999, 12),
                        help="last year or month to get, YYYY or YYYY-MM (default: the newest)")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR,
                        help=f"where the data goes (default: {DEFAULT_DATA_DIR})")
    parser.add_argument("--search-dir", type=Path, action="append", default=[],
                        help="extra folder to look for already downloaded zips (can be repeated)")
    parser.add_argument("--keep-zips", action="store_true",
                        help="keep the downloaded zips in Data/zip after unpacking (about 32 GB for everything)")
    parser.add_argument("--remove-duplicates", action="store_true",
                        help="delete loose CSVs in a year folder that are exact copies of a file in its month folder")
    parser.add_argument("--dry-run", action="store_true", help="only show what would be done (changes nothing)")
    args = parser.parse_args()
    if args.start > args.end:
        parser.error("--from is later than --to")
    return args


if __name__ == "__main__":
    sys.stdout.reconfigure(line_buffering=True)  # progress shows up immediately when the output goes to a log
    arguments = parse_args()  # invalid arguments exit with code 2
    try:
        main(arguments)
    except KeyboardInterrupt:
        print("\nStopped by the user. Run the script again to continue where it stopped.")
        print_summary("error", arguments.dry_run)
        sys.exit(1)
    except (OSError, RuntimeError, zipfile.BadZipFile) as error:  # OSError includes network errors (URLError)
        print(f"\nERROR: {error}")
        print("Run the script again to retry: finished archives are skipped and downloads resume. If a zip in "
              "Data/zip/ is damaged (BadZipFile), delete it first.")
        print_summary("error", arguments.dry_run)
        sys.exit(1)
    print_summary("dry_run" if arguments.dry_run else "ok", arguments.dry_run)
