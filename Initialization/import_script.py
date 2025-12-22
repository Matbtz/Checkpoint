import pandas as pd
import psycopg2
import psycopg2.extras
import os
import json
import numpy as np
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables (DATABASE_URL)
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL not found in .env")
    exit(1)

def import_data():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(base_dir, 'merged_games.csv')
    print(f"Reading merged CSV from {csv_path}...")
    df = pd.read_csv(csv_path)

    # Deduplicate based on 'id' (Primary Key)
    if 'id' in df.columns:
        dups_id = df[df.duplicated('id', keep='first')]
        if not dups_id.empty:
            print(f"Removing {len(dups_id)} duplicate IDs...")
            df = df[~df.index.isin(dups_id.index)]

    # Deduplicate based on steamAppId
    # Identify duplicates where steamAppId is not null
    mask = df['steamAppId'].notna()
    duplicates = df[mask & df.duplicated('steamAppId', keep='first')]
    if not duplicates.empty:
        print(f"Removing {len(duplicates)} duplicate steamAppIds...")
        df = df[~df.index.isin(duplicates.index)]

    # Convert NaNs to None (NULL in SQL)
    df = df.replace({np.nan: None})

    print(f"Connecting to database...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        # 1. TRUNCATE Game table
        # CASCADE ensures we also remove dependent rows in UserLibrary/ActivityLog if FK exists
        print("Truncating 'Game' table...")
        cur.execute('TRUNCATE TABLE "Game" CASCADE;')

        # 2. Prepare Insert Query
        insert_query = """
            INSERT INTO "Game" (
                "id", "title", "steamAppId", "steamUrl", "opencriticScore",
                "hltbMain", "hltbExtra", "hltbCompletionist",
                "releaseDate", "genres", "platforms", "studio",
                "steamReviewScore", "steamReviewCount", "steamReviewPercent", "isDlc",
                "dataMissing", "dataFetched", "updatedAt"
            ) VALUES %s
        """

        # 3. Prepare Data for Insertion
        # We need to ensure the order matches the query columns
        data_values = []
        now = datetime.utcnow()

        for _, row in df.iterrows():
            # Handle JSON fields explicitly if they are strings in CSV
            # 'genres' and 'platforms' are already JSON strings in CSV, so we pass them as is.
            # However, if psycopg2 needs valid json, passing the string usually works for JSON/JSONB types
            # or we can use psycopg2.extras.Json if needed. Since they are text in CSV, passing string is fine.

            val = (
                str(row['id']),
                row['title'],
                row['steamAppId'],
                row['steamUrl'],
                row['opencriticScore'],
                row['hltbMain'],
                row['hltbExtra'],
                row['hltbCompletionist'],
                row['releaseDate'], # already ISO string or None
                row['genres'],      # JSON string
                row['platforms'],   # JSON string
                row['studio'],
                row['steamReviewScore'],
                row['steamReviewCount'],
                row['steamReviewPercent'],
                bool(row['isDlc']) if row['isDlc'] is not None else False,
                False, # dataMissing
                True,  # dataFetched
                now    # updatedAt
            )
            data_values.append(val)

        # 4. Execute Batch Insert
        print(f"Inserting {len(data_values)} records...")
        psycopg2.extras.execute_values(
            cur, 
            insert_query, 
            data_values, 
            template=None, 
            page_size=1000
        )

        conn.commit()
        print("Import completed successfully!")

    except Exception as e:
        print(f"Error: {e}")
        if conn:
            conn.rollback()
    finally:
        if conn:
            cur.close()
            conn.close()

if __name__ == "__main__":
    import_data()