---
description: How to run the full CSV-based library enrichment pipeline
---

# CSV Library Enrichment Pipeline

This workflow describes how to build, enrich, and import your game library using the CSV pipeline.

## 1. Initialize Baseline
Merge your raw data sources (Steam, OpenCritic, HLTB) into a baseline CSV.

```bash
# Sourcing from data/raw...
python Initialization/merge_csv.py
# Output: merged_games.csv (Pipe Delimited)
```

## 2. Fetch Year Data
Fetch high-quality data from IGDB for specific years to fill gaps.

```bash
// turbo
npx tsx scripts/fetch-year-games.ts 2023
// turbo
npx tsx scripts/fetch-year-games.ts 2024
```

## 3. Merge All Data
Consolidate the baseline CSV and year CSVs into one master file.

```bash
// turbo
npx tsx scripts/consolidate-csvs.ts
# Output: scripts/csv/merged_all_games.csv
```

## 4. Enrich Data
Enrich the master CSV with missing data (HLTB, OpenCritic scores, etc.) using `enrich-library.ts`.

```bash
npx tsx scripts/enrich-library.ts --input="scripts/csv/merged_all_games.csv" --csv --hltb --opencritic
# Output: scripts/csv/enrich_results.csv
```

## 5. Validate
Run checks to ensure data integrity before import.

```bash
// turbo
npx tsx scripts/check-csv.ts scripts/csv/enrich_results.csv
```

## 6. Import
Import the final validated CSV into the database.

```bash
npx tsx scripts/import-year-games.ts
```
