import pandas as pd
import json
import re
import numpy as np
import os
import unicodedata

def normalize(s):
    if not isinstance(s, str):
        return ""
    # 0. Lowercase
    s = s.lower()
    # 1. Normalize unicode characters (deconstruct accents)
    s = unicodedata.normalize('NFD', s)
    # 2. Remove combining marks (accents)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    
    # 3. Base Normalize: alphanumeric only.
    # remove special chars and lowercase for fuzzy matching
    return re.sub(r'[^a-z0-9]', '', s)

# --- Global Normalization Maps ---
GENRE_MAP = {
    'Role-Playing': 'RPG',
    'Role Playing Game': 'RPG',
    'Role-Playing Game': 'RPG',
    'Action-Adventure': 'Action Adventure',
    'Sci-fi': 'Sci-Fi',
    'Shoot \'Em Up': 'Shoot \'Em Up',
    'Shoot \'em up': 'Shoot \'Em Up',
    'Beat \'Em Up': 'Beat \'Em Up',
    'Beat \'em up': 'Beat \'Em Up',
}

PLATFORM_MAP = {
    'PlayStation 4': 'PS4',
    'PlayStation 5': 'PS5',
    'PlayStation 3': 'PS3',
    'PlayStation 2': 'PS2',
    'PlayStation': 'PS1',
    'Sony PlayStation 4': 'PS4',
    'Sony PlayStation 5': 'PS5',
    'Nintendo Switch': 'Switch',
    'Xbox One': 'Xbox One',
    'Xbox Series X': 'Xbox Series X/S',
    'Xbox Series S': 'Xbox Series X/S',
    'Xbox Series X|S': 'Xbox Series X/S',
}

def normalize_string(s, mapping):
    if not isinstance(s, str): return s
    s = s.strip()
    return mapping.get(s, s)


def run_merge():
    # Base directory is where this script is located
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    print("Loading CSV files...")
    steam_df = pd.read_csv(os.path.join(base_dir, 'Steam_data.csv'))
    oc_df = pd.read_csv(os.path.join(base_dir, 'OpenCritic_data.csv'))
    hltb_df = pd.read_csv(os.path.join(base_dir, 'hltb_dataset.csv'))

    print("Merging Steam and OpenCritic data...")
    # Merge Steam and OpenCritic on 'ID' (which appears to be a shared key in your dataset)
    # Using 'outer' join to preserve games that might only exist in one source
    merged = pd.merge(steam_df, oc_df, on='ID', how='outer', suffixes=('_steam', '_oc'))

    print("Filtering HLTB data (removing games with no times)...")
    # Filter HLTB: Must have at least one time > 0
    # Columns: main_story, main_plus_sides, completionist
    # Ensure they are numeric first
    for col in ['main_story', 'main_plus_sides', 'completionist']:
        hltb_df[col] = pd.to_numeric(hltb_df[col], errors='coerce').fillna(0)
    
    hltb_df = hltb_df[
        (hltb_df['main_story'] > 0) | 
        (hltb_df['main_plus_sides'] > 0) | 
        (hltb_df['completionist'] > 0)
    ].copy()
    print(f"HLTB records with data: {len(hltb_df)}")

    print("Preparing HLTB lookup...")
    
    # Helper to clean name with/without year
    def clean_name_variants(name):
        if not isinstance(name, str): return []
        variants = set()
        
        # 1. Strict Alphanumeric (via robust normalize)
        v1 = normalize(name)
        if v1: variants.add(v1)
        
        # 2. Remove (YYYY) pattern
        # "God of War (2018)" -> "God of War"
        v2_raw = re.sub(r'\s*\(\d{4}\)', '', name)
        v2 = normalize(v2_raw)
        if v2 and v2 != v1: variants.add(v2)
        
        return list(variants)

    # GROUP HLTB candidates by name (Optimize: no groupby apply)
    hltb_lookup = {}
    # Assuming hltb_df has a unique index or reset index to reference
    for idx, row in hltb_df.iterrows():
        variants = clean_name_variants(row['name'])
        for n in variants:
            if n not in hltb_lookup: hltb_lookup[n] = []
            # Store index to track usage later
            dt = row.to_dict()
            dt['_original_idx'] = idx
            hltb_lookup[n].append(dt)

    # Helpers for Dates
    def parse_date(d_str):
        # Your CSV dates are likely D/M/Y (e.g. 9/1/2013 for Jan 9th)
        try:
            # Convert to ISO format for Postgres
            return pd.to_datetime(d_str, format='%d/%m/%Y').strftime('%Y-%m-%dT00:00:00.000Z')
        except:
            return None

    def extract_year(d_str):
        try:
            return pd.to_datetime(d_str, format='%d/%m/%Y').year
        except:
            return None

    # Track used HLTB indices
    used_hltb_indices = set()

    # Function to lookup HLTB times based on Steam or OpenCritic titles AND Years
    def get_hltb(row):
        # 1. Identify Normalized Titles
        t1 = normalize(row.get('SteamTitle')) if pd.notna(row.get('SteamTitle')) else ""
        t2 = normalize(row.get('OpenCriticTitle_steam')) if pd.notna(row.get('OpenCriticTitle_steam')) else ""
        t3 = normalize(row.get('OpenCriticTitle_oc')) if pd.notna(row.get('OpenCriticTitle_oc')) else ""
        
        # Debug trace
        debug_mode = False
        # Improved debug trigger: Check normalized string for key substrings
        debug_str = (str(row.get('SteamTitle')) + str(row.get('OpenCriticTitle_steam')) + str(row.get('OpenCriticTitle_oc'))).lower()
        if "god" in debug_str and "war" in debug_str and "valhalla" in debug_str:
            debug_mode = True
            print(f"DEBUG: Checking Row {row.get('ID', '?')}")
            print(f"   SteamTitle: {row.get('SteamTitle')}")
            print(f"   OC_Title_S: {row.get('OpenCriticTitle_steam')}")
            print(f"   OC_Title_O: {row.get('OpenCriticTitle_oc')}")
            print(f"   Norm T1: '{t1}'") 
            print(f"   Norm T2: '{t2}'")
            print(f"   Norm T3: '{t3}'")
            
        
        # 2. Identify Release Years Set
        years_raw = set()
        y1 = extract_year(row.get('SteamReleaseDate'))
        y2 = extract_year(row.get('Date')) # OpenCritic Date
        if y1: years_raw.add(y1)
        if y2: years_raw.add(y2)
        
        # Filter out NaN/None to avoid math issues
        years = {y for y in years_raw if pd.notna(y)}
        
        if debug_mode: print(f"   Years: {years}")

        candidates = []
        # Try finding candidates for any of the titles
        for t in [t1, t2, t3]:
            if t:
                if t in hltb_lookup:
                    if debug_mode: print(f"   Found {len(hltb_lookup[t])} candidates for '{t}'")
                    # Merge lists effectively
                    current_ids = {c['_original_idx'] for c in candidates}
                    for new_cand in hltb_lookup[t]:
                        if new_cand['_original_idx'] not in current_ids:
                            candidates.append(new_cand)
                            current_ids.add(new_cand['_original_idx'])
                else: 
                     if debug_mode: print(f"   No lookup for '{t}'")

        match = None
        
        if candidates:
            # Sort candidates by popularity first (break ties with popularity)
            candidates.sort(key=lambda x: x.get('main_story_polled', 0) or 0, reverse=True)

            if not years:
                # No reference year? Fallback to most polled 
                match = candidates[0]
                if debug_mode: print(f"   Selected (No Year Check): {match['name']}")
            else:
                # Year-Aware Match
                best_candidate = None
                min_diff = 999
                fallback_candidate = None # For candidates with NO year info
                
                for cand in candidates:
                    cand_year = cand.get('release_year')
                    if debug_mode: print(f"   Candidate: {cand['name']} (Year: {cand_year})")
                    
                    if cand_year and not pd.isna(cand_year):
                        local_min = min(abs(cand_year - y) for y in years)
                        if local_min < min_diff:
                            min_diff = local_min
                            best_candidate = cand
                    else:
                        # Candidate has NO year. Keep the first (most popular) one as fallback.
                        if fallback_candidate is None:
                            fallback_candidate = cand
                
                if best_candidate and min_diff <= 2:
                    match = best_candidate
                    if debug_mode: print(f"   Selected (Year Verified): {match['name']}")
                elif fallback_candidate:
                    # If we have no year-based match, but a candidate exists with NO year, accept it.
                    # This solves cases like DLCs "Valhalla" where HLTB might lack year data.
                    match = fallback_candidate 
                    if debug_mode: print(f"   Selected (Fallback): {match['name']}")
                else:
                    if debug_mode: print("   No valid match found.")

        # HLTB is in hours, schema expects minutes (Int)
        if match is not None:
            if debug_mode: print(f"   MATCHED OK with HLTB ID: {match['_original_idx']}")
            used_hltb_indices.add(match['_original_idx'])
            return pd.Series({
                'hltbMain': int(match['main_story'] * 60) if pd.notna(match.get('main_story')) else None,
                'hltbExtra': int(match['main_plus_sides'] * 60) if pd.notna(match.get('main_plus_sides')) else None,
                'hltbCompletionist': int(match['completionist'] * 60) if pd.notna(match.get('completionist')) else None
            })
        return pd.Series({'hltbMain': None, 'hltbExtra': None, 'hltbCompletionist': None})

    print("Merging HLTB data...")
    # Use standard python loop for side-effects (tracking indices) safety
    hltb_results = [get_hltb(row) for _, row in merged.iterrows()]
    hltb_data = pd.DataFrame(hltb_results)
    merged = pd.concat([merged, hltb_data.reset_index(drop=True)], axis=1)

    # --- Append Unmatched HLTB ---
    print("Appending Unmatched HLTB records...")
    # Identify unused indices
    # We rely on hltb_df index being 0..N
    all_indices = set(hltb_df.index)
    unused_indices = all_indices - used_hltb_indices
    
    if len(unused_indices) > 0:
        unmatched = hltb_df.loc[list(unused_indices)].copy()
        
        # Prepare columns for concatenation
        # We need to create a dataframe with same columns as 'merged' (before final mapping)
        # OR better: Map 'unmatched' to the FINAL structure and concat later?
        # The script later transforms 'merged' into 'merged_final'.
        # Easier to concat now if we map to 'merged' columns, but 'merged' has Steam/OC columns.
        
        # Let's add columns to 'unmatched' to match 'merged' structure for easier concatenation
        # Merged has: ID, SteamTitle, OpenCriticTitle..., hltbMain, ...
        
        # We need to populate the HLTB time columns on 'unmatched'
        unmatched['hltbMain'] = unmatched['main_story'].apply(lambda x: int(x*60) if pd.notna(x) else None)
        unmatched['hltbExtra'] = unmatched['main_plus_sides'].apply(lambda x: int(x*60) if pd.notna(x) else None)
        unmatched['hltbCompletionist'] = unmatched['completionist'].apply(lambda x: int(x*60) if pd.notna(x) else None)
        
        # We need a temporary 'ID' for them? 
        # The script later uses 'ID' column.
        # Let's generate one: hltb-{idx}
        unmatched['ID'] = unmatched.index.map(lambda i: f"hltb-{i}")
        
        # Titles
        unmatched['SteamTitle'] = unmatched['name'] # Use HLTB name as title
        
        # Release Date (Approximation from Year)
        # Format for SteamReleaseDate in script is %d/%m/%Y (e.g. 01/01/2013)
        def format_year_date(y):
            if pd.isna(y): return None
            try:
                return f"01/01/{int(y)}"
            except:
                return None
        
        
        # Release Date Mapping
        # Prioritize 'release_date' (YYYY-MM-DD), fallback to 'release_year' (01/01/YYYY)
        def format_htlb_release_date(row):
            # Try full date first
            d_str = row.get('release_date')
            if pd.notna(d_str):
                try:
                    # Input is YYYY-MM-DD, Output matching Steam format: DD/MM/YYYY
                    parts = str(d_str).split('-')
                    if len(parts) == 3:
                        return f"{parts[2]}/{parts[1]}/{parts[0]}"
                except:
                    pass
            
            # Fallback to year
            y = row.get('release_year')
            if pd.notna(y):
                try:
                    return f"01/01/{int(y)}"
                except:
                    pass
            return None
        
        unmatched['SteamReleaseDate'] = unmatched.apply(format_htlb_release_date, axis=1)

        # Map Developer
        unmatched['SteamDeveloper(s)'] = unmatched['developer']

        # Genres: "Action, Adventure" -> JSON ["Action", "Adventure"]
        def parse_hltb_genres(g_str):
            if pd.isna(g_str): return "[]"
            # Split and clean and Normalize
            g_list = [g.strip() for g in str(g_str).split(',')]
            normalized = set()
            for g in g_list:
                norm = normalize_string(g, GENRE_MAP)
                if norm: normalized.add(norm)
            return json.dumps(list(normalized))
        
        unmatched['genres'] = unmatched['genres'].apply(parse_hltb_genres)

        # Platforms: "PC, PS4" -> JSON [{"name": "PC", "releaseDate": "YYYY-01-01..."}, ...]
        def parse_hltb_platforms(row):
            p_str = row.get('platform')
            if pd.isna(p_str): return "[]"
            
            p_list = [p.strip() for p in str(p_str).split(',')]
            
            # Date: row['release_date'] (if fixed) or 'release_year'
            # We already fixed 'SteamReleaseDate' (DD/MM/YYYY) earlier? 
            # Or mapped it. 
            # We want ISO format for the platforms JSON: YYYY-MM-DD...
            
            # Helper to get ISO from the already formatted 'SteamReleaseDate' (DD/MM/YYYY)
            date_iso = None
            s_date = row.get('SteamReleaseDate') # We populated this just before!
            if pd.notna(s_date):
                try:
                    parts = s_date.split('/')
                    if len(parts) == 3:
                        # DD/MM/YYYY -> YYYY-MM-DD
                        date_iso = f"{parts[2]}-{parts[1]}-{parts[0]}T00:00:00.000Z"
                except:
                    pass
            
            plats = []
            for p in p_list:
                norm_p = normalize_string(p, PLATFORM_MAP)
                # Deduplicate
                if any(x['name'] == norm_p for x in plats): continue
                
                plats.append({"name": norm_p, "releaseDate": date_iso})
            
            return json.dumps(plats)
            
        unmatched['platforms'] = unmatched.apply(parse_hltb_platforms, axis=1)

        # Ensure other columns exist with NaN
        for col in merged.columns:
            if col not in unmatched.columns:
                unmatched[col] = None
        
        # Concatenate
        merged = pd.concat([merged, unmatched], ignore_index=True)
        print(f"Added {len(unmatched)} unmatched HLTB games.")


    # --- Transformation Functions ---

    def extract_steam_app_id(url):
        if pd.isna(url): return None
        m = re.search(r'app/(\d+)', str(url))
        return m.group(1) if m else None

    def merge_genres(row):
        # Preserve HLTB data if already present (for hltb- IDs)
        if str(row.get('ID', '')).startswith('hltb-'):
            return row.get('genres')

        # Combine SteamTags and OpenCritic Genres
        tags = str(row['SteamTags']).split(',') if pd.notna(row.get('SteamTags')) else []
        genres = str(row['Genres']).split(',') if pd.notna(row.get('Genres')) else []
        
        # Normalize and Deduplicate
        normalized = set()
        for t in tags + genres:
            norm = normalize_string(t, GENRE_MAP)
            if norm: normalized.add(norm)
            
        combined = list(normalized)
        return json.dumps(combined) if combined else None

    def build_detailed_platforms(row):
        # Preserve HLTB data if already present (for hltb- IDs)
        if str(row.get('ID', '')).startswith('hltb-'):
            return row.get('platforms')

        # Build JSON: [{ name: "PC", releaseDate: "..." }, { name: "PS4", releaseDate: "..." }]
        plats = []
        
        # 1. Steam -> PC
        if pd.notna(row.get('SteamURL')):
            d = parse_date(row.get('SteamReleaseDate'))
            plats.append({'name': 'PC', 'releaseDate': d}) # d can be None
            
        # 2. OpenCritic -> Consoles
        oc_plats_str = row.get('Platforms')
        if pd.notna(oc_plats_str):
            oc_date = parse_date(row.get('Date'))
            p_list = [p.strip() for p in str(oc_plats_str).split(',')]
            for p in p_list:
                norm_p = normalize_string(p, PLATFORM_MAP)
                
                # Deduplicate exact name matches
                if any(x['name'] == norm_p for x in plats):
                    continue
                plats.append({'name': norm_p, 'releaseDate': oc_date})
                
        return json.dumps(plats) if plats else None

    # Map CSV columns to Prisma Model fields
    merged['id'] = merged['ID'].astype(str)
    # Prefer Steam Title, fallback to OpenCritic
    # Check if columns exist before accessing
    
    # helper to safe get
    def safe_get(col):
        if col in merged.columns:
            return merged[col]
        return pd.Series([None]*len(merged))

    merged['title'] = safe_get('SteamTitle').fillna(safe_get('OpenCriticTitle_oc'))
    
    merged['steamAppId'] = safe_get('SteamURL').apply(extract_steam_app_id)
    merged['steamUrl'] = safe_get('SteamURL')
    
    merged['opencriticScore'] = safe_get('TopCriticAverage')
    merged['steamReviewScore'] = safe_get('SteamReviewsRating')
    merged['steamReviewCount'] = safe_get('SteamReviewsNum')
    merged['steamReviewPercent'] = safe_get('SteamReviewsPercent')
    merged['isDlc'] = safe_get('SteamDLC').fillna(False).infer_objects(copy=False).astype(bool)
    
    # Release Date: Prefer EARLIEST (Min) of Steam vs OC
    # We need to parse first
    merged['steam_date_dt'] = pd.to_datetime(safe_get('SteamReleaseDate'), format='%d/%m/%Y', errors='coerce')
    merged['oc_date_dt'] = pd.to_datetime(safe_get('Date'), format='%d/%m/%Y', errors='coerce')
    
    # Calculate min date using pandas magic
    merged['min_date'] = merged[['steam_date_dt', 'oc_date_dt']].min(axis=1)
    merged['releaseDate'] = merged['min_date'].dt.strftime('%Y-%m-%dT00:00:00.000Z')
    
    merged['genres'] = merged.apply(merge_genres, axis=1)
    
    # NEW: Detailed Platforms
    merged['platforms'] = merged.apply(build_detailed_platforms, axis=1)
    
    merged['studio'] = safe_get('SteamDeveloper(s)').fillna(safe_get('Developers/Publishers'))

    # Select final columns to match DB import needs (and fetch-year-games.ts)
    # Headers from fetch-year-games.ts:
    # "id", "title", "coverImage", "backgroundImage", "releaseDate", "description",
    # "screenshots", "videos", "steamUrl", "opencriticUrl", "igdbUrl", "hltbUrl",
    # "opencriticScore", "igdbScore", "steamAppId", "steamReviewScore", "steamReviewCount",
    # "steamReviewPercent", "isDlc", "igdbId", "studio", "genres", "platforms",
    # "igdbTime", "dataMissing", "dataFetched", "hltbMain", "hltbExtra", "hltbCompletionist",
    # "storyline", "status", "gameType", "parentId", "relatedGames"

    # We need to map our merged df to these exactly. Fill missing with None/''.
    
    # Mappings
    merged_final = pd.DataFrame()
    merged_final['id'] = merged['id']
    merged_final['title'] = merged['title']
    merged_final['coverImage'] = safe_get('SteamHeaderImage') # Approximate
    merged_final['backgroundImage'] = None # Missing in this source
    merged_final['releaseDate'] = merged['releaseDate']
    merged_final['description'] = safe_get('SteamDescription').fillna(safe_get('SteamShortDesc'))
    merged_final['screenshots'] = '[]'
    merged_final['videos'] = '[]'
    merged_final['steamUrl'] = merged['steamUrl']
    merged_final['opencriticUrl'] = safe_get('OpenCriticURL')
    merged_final['igdbUrl'] = None
    merged_final['hltbUrl'] = safe_get('hltb_url') if 'hltb_url' in merged.columns else None
    
    merged_final['opencriticScore'] = merged['opencriticScore']
    merged_final['igdbScore'] = None
    merged_final['steamAppId'] = merged['steamAppId']
    merged_final['steamReviewScore'] = merged['steamReviewScore']
    merged_final['steamReviewCount'] = merged['steamReviewCount']
    merged_final['steamReviewPercent'] = merged['steamReviewPercent']
    
    merged_final['isDlc'] = merged['isDlc']
    merged_final['igdbId'] = None # Unknown
    merged_final['studio'] = merged['studio']
    merged_final['genres'] = merged['genres']
    merged_final['platforms'] = merged['platforms']
    
    merged_final['igdbTime'] = None
    merged_final['dataMissing'] = False
    merged_final['dataFetched'] = True # It is fetched from Steam/OC
    
    merged_final['hltbMain'] = merged['hltbMain']
    merged_final['hltbExtra'] = merged['hltbExtra']
    merged_final['hltbCompletionist'] = merged['hltbCompletionist']
    
    merged_final['storyline'] = None
    merged_final['status'] = None
    merged_final['gameType'] = None
    merged_final['parentId'] = None
    merged_final['relatedGames'] = None

    # Helper to escape CSV for Pipe Delimiter
    def escape_csv_pipe(val):
        if pd.isna(val) or val == "":
            return ""
        s = str(val)
        # Remove newlines
        s = s.replace('\n', ' ').replace('\r', ' ')
        # Escape quotes
        s = s.replace('"', '""')
        # Quote if delimiter or quote exists
        if '|' in s or '"' in s:
            return f'"{s}"'
        return s

    # Write manually to ensure strict format matching
    # Ensure output directory exists (../scripts/csv)
    output_dir = os.path.join(base_dir, '..', 'scripts', 'csv')
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    out_path = os.path.join(output_dir, 'merged_games.csv')
    
    with open(out_path, 'w', encoding='utf-8') as f:
        # Write Header
        cols = [
            "id", "title", "coverImage", "backgroundImage", "releaseDate", "description",
            "screenshots", "videos", "steamUrl", "opencriticUrl", "igdbUrl", "hltbUrl",
            "opencriticScore", "igdbScore", "steamAppId", "steamReviewScore", "steamReviewCount",
            "steamReviewPercent", "isDlc", "igdbId", "studio", "genres", "platforms",
            "igdbTime", "dataMissing", "dataFetched", "hltbMain", "hltbExtra", "hltbCompletionist",
            "storyline", "status", "gameType", "parentId", "relatedGames"
        ]
        f.write('|'.join(cols) + '\n')
        
        # Write Rows
        count = 0
        for _, row in merged_final.iterrows():
            line = '|'.join([escape_csv_pipe(row[c]) for c in cols])
            f.write(line + '\n')
            count += 1
            
    print(f"Done! Saved {count} games to {out_path} (Pipe Delimited)")

if __name__ == '__main__':
    run_merge()