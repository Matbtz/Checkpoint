import pandas as pd
import os
import glob

def load_csv(path):
    if not os.path.exists(path):
        print(f"⚠️ Warning: File not found: {path}")
        return None
    try:
        # Try pipe delimiter first as it's our standard now
        df = pd.read_csv(path, sep='|', low_memory=False)
        # Check if it looks parsed correctly (more than 1 column)
        if len(df.columns) < 2:
            # Fallback to comma if pipe failed to split
            df = pd.read_csv(path, sep=',', low_memory=False)
        return df
    except Exception as e:
        print(f"❌ Error loading {path}: {e}")
        return None

def normalize_title(t):
    if pd.isna(t): return ""
    return str(t).lower().strip()

def run_merge():
    print("🔄 Starting CSV Merge Process...")
    
    # Paths
    base_dir = os.path.join(os.getcwd(), 'scripts', 'csv')
    out_path = os.path.join(base_dir, 'merged_all_games.csv')
    
    # 1. Load Base Files (merged_games + games_20XX)
    print("📂 Loading Base Files...")
    base_frames = []
    
    # merged_games.csv
    df_merged = load_csv(os.path.join(base_dir, 'merged_games.csv'))
    if df_merged is not None: base_frames.append(df_merged)
    
    # games_20XX.csv
    year_files = glob.glob(os.path.join(base_dir, 'games_20*.csv'))
    for f in year_files:
        print(f"   Found Year File: {os.path.basename(f)}")
        df_y = load_csv(f)
        if df_y is not None: base_frames.append(df_y)
        
    if not base_frames:
        print("❌ No base files found. Exiting.")
        return

    # Concat Base
    df_main = pd.concat(base_frames, ignore_index=True)
    print(f"   Base Total Rows: {len(df_main)}")
    
    # Deduplicate Base by ID (prefer last?) or Title?
    # Usually ID is safest if valid, else Title.
    # Let's deduplicate by 'id' first if present.
    if 'id' in df_main.columns:
        # Sort by title/releaseDate to have some determinism on 'last'?
        # Actually, let's just drop pure duplicates first
        df_main = df_main.drop_duplicates()
        # Then by ID, keeping last (assuming later files in concat are newer)
        df_main = df_main.drop_duplicates(subset=['id'], keep='last')
        # Also ensure 'id' is string and not null/empty
        df_main = df_main[df_main['id'].notna() & (df_main['id'] != '')]
    
    # Check for title duplicates if IDs are missing?
    # For now relying on ID is safer.
    print(f"   After Deduplication: {len(df_main)}")

    # 2. Load Enrich Results (Priority 1 for Metadata)
    print("📂 Loading Enrichment Data...")
    df_enrich = load_csv(os.path.join(base_dir, 'enrich_results.csv'))
    
    if df_enrich is not None:
        print(f"   Enriched Rows: {len(df_enrich)}")
        # Deduplicate Enrich by ID too!
        if 'id' in df_enrich.columns:
            df_enrich = df_enrich.drop_duplicates(subset=['id'], keep='last')
            df_enrich = df_enrich[df_enrich['id'].notna() & (df_enrich['id'] != '')]
        
        # Update main with enrich
        # Set indexes for update
        df_main.set_index('id', inplace=True)
        df_enrich.set_index('id', inplace=True)
        
        # update() in pandas overwrites matching index/columns with new values
        df_main.update(df_enrich)
        
        # Add new rows from enrich
        # Use simple filter based on index
        new_ids = df_enrich.index.difference(df_main.index)
        if len(new_ids) > 0:
            print(f"   Adding {len(new_ids)} new games from enrichment...")
            # concat needs matching columns/structure largely, but pandas handles mismatch by filling NaN
            df_main = pd.concat([df_main, df_enrich.loc[new_ids]])
            
        df_main.reset_index(inplace=True)
        # df_enrich reset not needed if we are done with it

    # 3. Load OpenCritic Sync (Priority 1 for Scores, Priority 2 for missing data)
    print("📂 Loading OpenCritic Data...")
    df_oc = load_csv(os.path.join(base_dir, 'opencritic_sync-score.csv'))
    
    if df_oc is not None:
        print(f"   OpenCritic Rows: {len(df_oc)}")
        
        if 'id' in df_oc.columns:
             df_oc = df_oc.drop_duplicates(subset=['id'], keep='last')
             df_oc = df_oc[df_oc['id'].notna() & (df_oc['id'] != '')]
        
        df_main.set_index('id', inplace=True)
        df_oc.set_index('id', inplace=True)
        
        # A. Override Scores
        if 'opencriticScore' in df_oc.columns:
            # We explicitly want OC Score from here
            # update() will do it.
            print("   Updating Scores from OpenCritic...")
            # Only update intersecting rows
            common_ids = df_main.index.intersection(df_oc.index)
            if len(common_ids) > 0:
                 df_main.loc[common_ids, 'opencriticScore'] = df_oc.loc[common_ids, 'opencriticScore']
            
        # B. Update other fields only if missing in Main (fill gaps)
        # combine_first(df_oc): Keeps main, fills from OC.
        print("   Filling missing data from OpenCritic...")
        df_main = df_main.combine_first(df_oc)
        
        df_main.reset_index(inplace=True)

    # 4. Final Cleanup & Export
    print("💾 Saving merged file...")
    # Ensure ID is first
    cols = list(df_main.columns)
    if 'id' in cols:
        cols.insert(0, cols.pop(cols.index('id')))
        df_main = df_main[cols]
        
    df_main.to_csv(out_path, sep='|', index=False)
    print(f"✅ Success! Saved {len(df_main)} games to:")
    print(f"   {out_path}")

if __name__ == "__main__":
    run_merge()