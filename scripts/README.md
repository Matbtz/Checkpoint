# Checkpoint Scripts

This directory contains various utility scripts for data fetching, enrichment, and maintenance of the Checkpoint game library.

Run these scripts using `npx tsx scripts/<script-name>.ts [options]`.

## Core Scripts

### `enrich-library.ts`
The master enrichment script. It intelligently checks the database for games missing specific data (art, metadata, steam info, HLTB times) and fills it.

**Usage:**
```bash
npx tsx scripts/enrich-library.ts [options]
```
**Options:**
- `(default)`: Implies `--art`, `--metadata`, `--steam`.
- `--full`: Enables all enrichment modes.
- `--art`: Updates missing Cover/Background images.
- `--metadata`: Updates missing Descriptions, IGDB IDs, Genres, etc.
- `--steam` / `--reviews`: Enriches Steam IDs, URLs, and Review Scores.
- `--hltb`: Enriches "HowLongToBeat" times (Use with caution, slower/rate-limited).
- `--refresh-recent`: Forces a refresh of data for games released in the last 3 months.
- `--scan-dlc`: Special mode that scans games with known IGDB IDs to verify if they are DLCs, Expansions, or Main games, and links them to parent games if found.

### `sync-opencritic-catalog.ts`
Crawls the OpenCritic API to populate the database with games. This is often the primary source of truth for "Released" games and Review Scores.

**Usage:**
```bash
npx tsx scripts/sync-opencritic-catalog.ts [options]
```
**Options:**
- `--continue` / `continue`: Resume syncing from the last saved state (skip count).
- `--sort=[newest|popular|score]`: API Sort order (Default: `newest`).
- `--platform=[pc|ps5|ps4|switch|xbox|series]`: Filter by specific platform.

### `sync-upcoming.ts`
Fetches "Most Anticipated" and "Upcoming" games from IGDB to populate the "Discover" section with future releases.

**Usage:**
```bash
npx tsx scripts/sync-upcoming.ts
```

## Data Import/Export

### `fetch-year-games.ts`
Fetches a comprehensive list of games for a specific year from IGDB and dumps them into a CSV file in `scripts/csv/`. Useful for bulk backfilling.

**Usage:**
```bash
npx tsx scripts/fetch-year-games.ts <year>
# Example:
npx tsx scripts/fetch-year-games.ts 2023
```

### `import-year-games.ts`
Reads all CSV files from `scripts/csv/` and upserts them into the Prisma database.

**Usage:**
```bash
npx tsx scripts/import-year-games.ts
```

## Specialized / Legacy

### `enrich-media.ts`
Focused enrichment for Art and Metadata.
- `--hltb-only`: Specialized mode to only update missing HLTB times from a list.

### `enrich-steam.ts`
Focused enrichment for Steam IDs and Review Stats.

### `diagnose_home.ts`
A diagnostic tool to verify if there is enough data in the database to populate the Home Page sections (Recent, Upcoming, Top Rated, etc.).

**Usage:**
```bash
npx tsx scripts/diagnose_home.ts
```

## Setup & Utils
- `env-loader.ts`: Helper to load `.env` variables in scripts.
- `db-patch.ts`: Database utility patcher (if applicable).
