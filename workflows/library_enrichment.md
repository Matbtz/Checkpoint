---
description: "Best practices for maintaining, enriching, and expanding the game library."
---

# Library Management Workflow

This guide outlines the optimal processes for both **Fixing/Enriching Existing Games** and **Importing New Games**.

## 1. Initial Data Repair (CSV Re-Import)
*Use this if your database has "split" entries (e.g., God of War 2018 vs God of War 2022 PC) that should be merged.*

1.  **Regenerate the Merged CSV**:
    Run the Python script updates with the new "Multi-Year Matching" logic.
    ```bash
    python Initialization/merge_csv.py
    ```
2.  **Import to Database**:
    Use your standard import data flow (e.g., Prisma Studio, SQL Import, or your seed script) to load `merged_games.csv` into your database.

---

## 2. Filling Missing Data (Gap Filling)
*Use this to enrich games that are already in your database but missing specific fields.*

We have a powerful "Master Enricher" script (`scripts/enrich-library.ts`) that can fill specific gaps.

### Command Structure
```bash
npx tsx scripts/enrich-library.ts [flags]
```

### Common Scenarios

*   **Fill Missing HLTB Times (Sorted by Popularity/Score)**:
    Target high-rated games first.
    ```bash
    npx tsx scripts/enrich-library.ts --hltb --sort-score
    ```

*   **Fill Missing OpenCritic Scores**:
    If your CSV didn't have scores for some games.
    ```bash
    npx tsx scripts/enrich-library.ts --opencritic
    ```

*   **Enrich Everything (Full Sweep)**:
    Checks Art, Metadata, Steam, HLTB, and OpenCritic.
    ```bash
    npx tsx scripts/enrich-library.ts --full
    ```

*   **Targeting Specific Gaps**:
    ```bash
    npx tsx scripts/enrich-library.ts --art --metadata --steam --resume-from=100
    ```

---

## 3. Importing NEW Games (Bulk Discovery)
*Use this to discover and add NEW games from the web (OpenCritic) that aren't in your CSV.*

The **OpenCritic Sync Script** is best for this. It fetches games from OpenCritic's catalog, creates them in your DB, and automatically adds IGDB art/metadata.

### Step 1: Sync Catalog
```bash
npx tsx scripts/sync-opencritic-catalog.ts --sort=popular
```
*   **Options**:
    *   `--sort=popular`: Best for getting top games.
    *   `--sort=newest`: Best for keeping up to date.
    *   `--platform=ps5`: Filter by platform.
    *   `--continue`: Resume where you left off.

### Step 2: Post-Import Enrichment
The sync script adds the game and basic metadata. To get HLTB times for these new games, run the enricher afterwards:
```bash
npx tsx scripts/enrich-library.ts --hltb --refresh-recent
```

---

## Summary of Tools

| Script | Purpose | Best For |
| :--- | :--- | :--- |
| `Initialization/merge_csv.py` | Intelligent CSV Merging | Fixing duplicate/split entries (Console vs PC) |
| `scripts/enrich-library.ts` | Data Enrichment | Filling missing HLTB times, OpenCritic scores, Art, Steam Stats |
| `scripts/sync-opencritic-catalog.ts` | Bulk Discovery | Adding **new** games to the library |
| `actions/add-game.ts` | Single Game Add | Manually adding one specific game |
