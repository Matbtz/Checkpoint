import pandas as pd
import json
import re
import numpy as np
import os

def normalize(s):
    if not isinstance(s, str):
        return ""
    # Remove special chars and lowercase for fuzzy matching
    return re.sub(r'[^a-z0-9]', '', s.lower())

def run_merge():
    print("Loading CSV files...")
    base_dir = os.path.dirname(os.path.abspath(__file__))
    steam_df = pd.read_csv(os.path.join(base_dir, 'Steam_data.csv'))
    oc_df = pd.read_csv(os.path.join(base_dir, 'OpenCritic_data.csv'))
    hltb_df = pd.read_csv(os.path.join(base_dir, 'hltb_dataset.csv'))

    print("Merging Steam and OpenCritic data...")
    # Merge Steam and OpenCritic on 'ID' (which appears to be a shared key in your dataset)
    # Using 'outer' join to preserve games that might only exist in one source
    merged = pd.merge(steam_df, oc_df, on='ID', how='outer', suffixes=('_steam', '_oc'))

    print("Preparing HLTB lookup...")
    # Normalize HLTB names for matching
    hltb_df['norm_name'] = hltb_df['name'].apply(normalize)
    # Remove duplicates in HLTB (keeping the one with the most polls) to ensure unique matches
    hltb_df = hltb_df.sort_values('main_story_polled', ascending=False).drop_duplicates('norm_name')
    hltb_lookup = hltb_df.set_index('norm_name')

    # Function to lookup HLTB times based on Steam or OpenCritic titles
    def get_hltb(row):
        # Try matching with Steam Title first, then OpenCritic Title
        t1 = normalize(row['SteamTitle']) if pd.notna(row['SteamTitle']) else ""
        t2 = normalize(row['OpenCriticTitle_steam']) if pd.notna(row.get('OpenCriticTitle_steam')) else ""
        t3 = normalize(row['OpenCriticTitle_oc']) if pd.notna(row.get('OpenCriticTitle_oc')) else ""
        
        match = None
        if t1 and t1 in hltb_lookup.index:
            match = hltb_lookup.loc[t1]
        elif t2 and t2 in hltb_lookup.index:
            match = hltb_lookup.loc[t2]
        elif t3 and t3 in hltb_lookup.index:
            match = hltb_lookup.loc[t3]
        
        # HLTB is in hours, schema expects minutes (Int)
        if match is not None:
            return pd.Series({
                'hltbMain': int(match['main_story'] * 60) if pd.notna(match['main_story']) else None,
                'hltbExtra': int(match['main_plus_sides'] * 60) if pd.notna(match['main_plus_sides']) else None,
                'hltbCompletionist': int(match['completionist'] * 60) if pd.notna(match['completionist']) else None
            })
        return pd.Series({'hltbMain': None, 'hltbExtra': None, 'hltbCompletionist': None})

    print("Merging HLTB data...")
    hltb_data = merged.apply(get_hltb, axis=1)
    merged = pd.concat([merged, hltb_data], axis=1)

    # --- Transformation Functions ---

    def extract_steam_app_id(url):
        if pd.isna(url): return None
        m = re.search(r'app/(\d+)', str(url))
        return m.group(1) if m else None

    def parse_date(d_str):
        # Your CSV dates are likely D/M/Y (e.g. 9/1/2013 for Jan 9th)
        try:
            # Convert to ISO format for Postgres
            return pd.to_datetime(d_str, format='%d/%m/%Y').strftime('%Y-%m-%dT00:00:00.000Z')
        except:
            return None

    def merge_genres(row):
        # Combine SteamTags and OpenCritic Genres
        tags = str(row['SteamTags']).split(',') if pd.notna(row['SteamTags']) else []
        genres = str(row['Genres']).split(',') if pd.notna(row['Genres']) else []
        combined = list(set([t.strip() for t in tags + genres if t.strip()]))
        # Schema expects JSON string for genres
        return json.dumps(combined) if combined else None

    def format_platforms(p_str):
        if pd.isna(p_str): return None
        # Split string like "PC , Xbox" -> JSON object
        plats = [p.strip() for p in str(p_str).split(',')]
        # Schema expects JSON structure
        return json.dumps([{"name": p} for p in plats])

    print("Formatting columns...")
    # Map CSV columns to Prisma Model fields
    merged['id'] = merged['ID'].astype(str)
    # Prefer Steam Title, fallback to OpenCritic
    merged['title'] = merged['SteamTitle'].fillna(merged['OpenCriticTitle_oc'])
    
    merged['steamAppId'] = merged['SteamURL'].apply(extract_steam_app_id)
    merged['steamUrl'] = merged['SteamURL']
    
    merged['opencriticScore'] = merged['TopCriticAverage']
    merged['steamReviewScore'] = merged['SteamReviewsRating']
    merged['steamReviewCount'] = merged['SteamReviewsNum']
    merged['steamReviewPercent'] = merged['SteamReviewsPercent']
    merged['isDlc'] = merged['SteamDLC'].fillna(False).astype(bool)
    
    # Release Date: Prefer Steam, then OpenCritic
    merged['releaseDate'] = merged['SteamReleaseDate'].fillna(merged['Date']).apply(parse_date)
    
    merged['genres'] = merged.apply(merge_genres, axis=1)
    merged['platforms'] = merged['Platforms'].apply(format_platforms)
    merged['studio'] = merged['SteamDeveloper(s)'].fillna(merged['Developers/Publishers'])

    # Select final columns to match DB import needs
    final_cols = [
        'id', 'title', 'steamAppId', 'steamUrl', 'opencriticScore', 
        'hltbMain', 'hltbExtra', 'hltbCompletionist',
        'releaseDate', 'genres', 'platforms', 'studio',
        'steamReviewScore', 'steamReviewCount', 'steamReviewPercent', 'isDlc'
    ]
    
    final_df = merged[final_cols]
    
    # Save
    final_df.to_csv(os.path.join(base_dir, 'merged_games.csv'), index=False)
    print(f"Done! Saved {len(final_df)} games to merged_games.csv")

if __name__ == '__main__':
    run_merge()