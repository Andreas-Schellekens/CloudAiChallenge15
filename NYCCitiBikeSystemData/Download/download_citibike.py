import os
import urllib.request
from pathlib import Path

# 1. Genereer de lijst met alle bestandsnamen
filenames = []

# Jaren 2013 t/m 2023 (Jaarlijkse bestanden)
for year in range(2013, 2024):
    filenames.append(f"{year}-citibike-tripdata.zip")

# Jaren 2024 t/m 2025 (Maandelijkse bestanden)
for year in range(2024, 2026):
    for month in range(1, 13):
        filenames.append(f"{year}{month:02d}-citibike-tripdata.zip")

# Jaar 2026 (Maandelijkse bestanden t/m augustus)
for month in range(1, 9):
    filenames.append(f"2026{month:02d}-citibike-tripdata.zip")

# 2. Bepaal het pad naar de Downloads/output folder
# Path.home() pakt automatisch C:\Users\JouwNaam\
download_dir = os.path.join(str(Path.home()), "Downloads", "output")

# Maak de map aan als deze nog niet bestaat
os.makedirs(download_dir, exist_ok=True)
print(f"Bestanden worden opgeslagen in: {download_dir}\n")

# 3. Download de bestanden
base_url = "https://s3.amazonaws.com/tripdata/"

for file in filenames:
    url = base_url + file
    dest_path = os.path.join(download_dir, file)
    
    # Check of het bestand al bestaat, zodat je bij een crash gewoon opnieuw kan starten
    if not os.path.exists(dest_path):
        print(f"Bezig met downloaden: {file}...")
        try:
            # urlretrieve downloadt direct naar de hardeschijf (voorkomt RAM-problemen bij grote files)
            urllib.request.urlretrieve(url, dest_path)
            print(f"Klaar: {file}")
        except Exception as e:
            print(f"Fout bij downloaden van {file}: {e}")
    else:
        print(f"Bestand bestaat al (overgeslagen): {file}")

print("\nAlle downloads zijn voltooid!")