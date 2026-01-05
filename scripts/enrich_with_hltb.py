
import csv
import os

# Configuration
OC_CSV_PATH = 'scripts/csv/opencritic_sync-score.csv'
HLTB_CSV_PATH = 'Initialization/hltb_dataset.csv'
OUTPUT_CSV_PATH = 'scripts/csv/enriched_with_hltb.csv'

def normalize(name):
    if not name: return ""
    return name.lower().strip() # .replace(':', '').replace('-', '') # simplified normalization

def load_hltb_data(path):
    print(f"Loading HLTB data from {path}...")
    hltb_data = {} # name -> { main: [], extra: [], comp: [] }
    
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = normalize(row.get('name', ''))
            if not name: continue
            
            # Helper to parse hours
            def parse_time(val):
                try:
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
        
        # Store in minutes (rounded integer)
        final_map[name] = {
            'main': int(round(avg_main * 60)) if avg_main > 0 else None,
            'extra': int(round(avg_extra * 60)) if avg_extra > 0 else None,
            'comp': int(round(avg_comp * 60)) if avg_comp > 0 else None
        }
    
    print(f"Loaded {len(final_map)} HLTB entries.")
    return final_map

def enrich_csv(oc_path, hltb_map, output_path):
    print(f"Enriching {oc_path}...")
    
    with open(oc_path, 'r', encoding='utf-8', newline='') as f_in:
        # Detect delimiter (assuming pipe based on previous check)
        delimiter = '|'
        
        reader = csv.DictReader(f_in, delimiter=delimiter)
        fieldnames = reader.fieldnames
        
        with open(output_path, 'w', encoding='utf-8', newline='') as f_out:
            writer = csv.DictWriter(f_out, fieldnames=fieldnames, delimiter=delimiter)
            writer.writeheader()
            
            match_count = 0
            total_count = 0
            
            for row in reader:
                total_count += 1
                title = normalize(row.get('title', ''))
                
                if title in hltb_map:
                    data = hltb_map[title]
                    
                    # Update row if data exists
                    if data['main']: row['hltbMain'] = data['main']
                    if data['extra']: row['hltbExtra'] = data['extra']
                    if data['comp']: row['hltbCompletionist'] = data['comp']
                    
                    match_count += 1
                
                writer.writerow(row)
                
    print(f"Finished. Processed {total_count} games.")
    print(f"Matched and enriched {match_count} games ({match_count/total_count*100:.2f}%).")
    print(f"Output saved to {output_path}")

if __name__ == "__main__":
    if not os.path.exists(OC_CSV_PATH):
        print(f"Error: {OC_CSV_PATH} not found.")
    elif not os.path.exists(HLTB_CSV_PATH):
        print(f"Error: {HLTB_CSV_PATH} not found.")
    else:
        hltb_map = load_hltb_data(HLTB_CSV_PATH)
        enrich_csv(OC_CSV_PATH, hltb_map, OUTPUT_CSV_PATH)
