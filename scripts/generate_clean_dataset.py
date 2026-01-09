
import csv
import os

# Configuration
OC_CSV_PATH = 'scripts/csv/opencritic_sync-score.csv'
HLTB_CSV_PATH = 'Initialization/hltb_dataset.csv'
OUTPUT_CSV_PATH = 'scripts/csv/enriched_clean_dataset.csv'

def normalize(name):
    if not name: return ""
    # Remove punctuation for better matching
    import re
    name = name.lower()
    name = re.sub(r'[^a-z0-9\s]', '', name)
    return name.strip()

def load_hltb_data(path):
    print(f"Loading HLTB data from {path}...")
    hltb_data = {} # name -> list of dicts
    
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = normalize(row.get('name', ''))
            if not name: continue
            
            # Helper to parse hours
            def parse_time(val):
                try:
                    # Handle ranges like "10-12" or "10"
                    if '-' in val:
                         val = val.split('-')[0]
                    v = float(val)
                    return v if v > 0 else None
                except:
                    return None
            
            main = parse_time(row.get('main_story', '0'))
            extra = parse_time(row.get('main_plus_sides', '0'))
            comp = parse_time(row.get('completionist', '0'))
            
            if name not in hltb_data:
                hltb_data[name] = {'main': [], 'extra': [], 'comp': []}
            
            if main: hltb_data[name]['main'].append(main)
            if extra: hltb_data[name]['extra'].append(extra)
            if comp: hltb_data[name]['comp'].append(comp)
            
    # Average duplicates
    final_map = {}
    for name, times in hltb_data.items():
        avg_main = sum(times['main']) / len(times['main']) if times['main'] else 0
        avg_extra = sum(times['extra']) / len(times['extra']) if times['extra'] else 0
        avg_comp = sum(times['comp']) / len(times['comp']) if times['comp'] else 0
        
        # Store in HOURS (Raw). Do NOT multiply by 60.
        final_map[name] = {
            'main': round(avg_main, 2) if avg_main > 0 else None,
            'extra': round(avg_extra, 2) if avg_extra > 0 else None,
            'comp': round(avg_comp, 2) if avg_comp > 0 else None
        }
    
    print(f"Loaded {len(final_map)} HLTB entries.")
    return final_map

def process_csv(oc_path, hltb_map, output_path):
    print(f"Processing {oc_path}...")
    
    seen_ids = set()
    rows_to_write = []
    fieldnames = []
    
    with open(oc_path, 'r', encoding='utf-8', newline='') as f_in:
        # Read lines and sanitise X|S which breaks pipe delimiter
        content = f_in.read().replace('X|S', 'X/S')
        from io import StringIO
        f_string = StringIO(content)
        
        delimiter = '|'
        reader = csv.DictReader(f_string, delimiter=delimiter)
        fieldnames = reader.fieldnames
        
        # Ensure HLTB columns exist in fieldnames if not present
        if 'hltbMain' not in fieldnames: fieldnames.append('hltbMain')
        if 'hltbExtra' not in fieldnames: fieldnames.append('hltbExtra')
        if 'hltbCompletionist' not in fieldnames: fieldnames.append('hltbCompletionist')
        
        original_count = 0
        duplicates_count = 0
        match_count = 0
        
        for row in reader:
            original_count += 1
            game_id = row.get('id')
            
            # Deduplication
            if game_id in seen_ids:
                duplicates_count += 1
                continue
            
            if game_id:
                seen_ids.add(game_id)
            
            # Enrichment
            title = normalize(row.get('title', ''))
            if title in hltb_map:
                data = hltb_map[title]
                if data['main']: row['hltbMain'] = data['main']
                if data['extra']: row['hltbExtra'] = data['extra']
                if data['comp']: row['hltbCompletionist'] = data['comp']
                match_count += 1
            
            rows_to_write.append(row)

    print(f"Total rows read: {original_count}")
    print(f"Duplicates removed: {duplicates_count}")
    print(f"Enriched rows: {match_count}")
    print(f"Writing {len(rows_to_write)} unique rows to {output_path}...")
    
    with open(output_path, 'w', encoding='utf-8', newline='') as f_out:
        writer = csv.DictWriter(f_out, fieldnames=fieldnames, delimiter='|') # Keep same delimiter? Usually safer.
        writer.writeheader()
        writer.writerows(rows_to_write)
        
    print("Done.")

if __name__ == "__main__":
    if not os.path.exists(OC_CSV_PATH):
        print(f"Error: {OC_CSV_PATH} not found.")
    elif not os.path.exists(HLTB_CSV_PATH):
        print(f"Error: {HLTB_CSV_PATH} not found.")
    else:
        hltb_map = load_hltb_data(HLTB_CSV_PATH)
        process_csv(OC_CSV_PATH, hltb_map, OUTPUT_CSV_PATH)
