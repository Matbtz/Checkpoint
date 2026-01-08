import csv
import re
from pathlib import Path

# File definitions
HLTB_FILE = Path("Initialization/hltb_dataset.csv")
OPENCRITIC_FILE = Path("scripts/csv/opencritic_sync-score.csv")
OUTPUT_FILE = Path("scripts/csv/opencritic_sync-score.csv") # Overwrite in place, or change to a new file for safety

def normalize_title(title):
    if not title:
        return ""
    # Lowercase, remove special chars, extra spaces
    t = title.lower()
    t = re.sub(r'[^a-z0-9\s]', '', t)
    t = re.sub(r'\s+', ' ', t).strip()
    return t

def load_hltb_data(filepath):
    """
    Loads HLTB data into a dictionary keyed by normalized title.
    Returns: { normalized_title: { 'main': ..., 'extra': ..., 'completionist': ..., 'url': ... } }
    """
    print(f"Loading HLTB data from {filepath}...")
    hltb_lookup = {}
    count = 0
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                title = row.get('name')
                if not title:
                    continue
                
                norm_title = normalize_title(title)
                
                # Convert times to minutes or keep as hours? 
                # The user request implies just populating the data. 
                # HLTB dataset usually has hours. 
                # Let's keep them as strings or numbers as they appear, 
                # but careful about units if the destination expects something specific.
                # Assuming destination just wants the values.
                
                # HLTB dataset columns based on inspection:
                # main_story, main_plus_sides, completionist, source_url
                
                hltb_lookup[norm_title] = {
                    'hltbMain': row.get('main_story', ''),
                    'hltbExtra': row.get('main_plus_sides', ''),
                    'hltbCompletionist': row.get('completionist', ''),
                    'hltbUrl': row.get('source_url', '')
                }
                count += 1
        print(f"Loaded {count} HLTB records.")
    except Exception as e:
        print(f"Error loading HLTB data: {e}")
    return hltb_lookup

def enrich_opencritic(hltb_lookup, input_path, output_path):
    print(f"Enriching OpenCritic data at {input_path}...")
    
    # Read all data first
    rows = []
    fieldnames = []
    
    try:
        with open(input_path, 'r', encoding='utf-8') as f:
            # OpenCritic file is Pipe delimited
            reader = csv.DictReader(f, delimiter='|')
            fieldnames = reader.fieldnames
            rows = list(reader)
            
        # Add new columns if they don't exist
        new_columns = ['hltbMain', 'hltbExtra', 'hltbCompletionist', 'hltbUrl']
        for col in new_columns:
            if col not in fieldnames:
                fieldnames.append(col)
        
        matches = 0
        for row in rows:
            title = row.get('name') or row.get('title') # Check header, previous inspection said 'name' is in HLTB, OC has 'id|title|coverImage...'
            if not title:
                continue
            
            norm_title = normalize_title(title)
            
            if norm_title in hltb_lookup:
                hltb_data = hltb_lookup[norm_title]
                row['hltbMain'] = hltb_data['hltbMain']
                row['hltbExtra'] = hltb_data['hltbExtra']
                row['hltbCompletionist'] = hltb_data['hltbCompletionist']
                row['hltbUrl'] = hltb_data['hltbUrl']
                matches += 1
            else:
                # Initialize empty if not matched (optional, but good for consistency)
                for col in new_columns:
                    if col not in row:
                        row[col] = ''
                        
        print(f"Enriched {matches} records out of {len(rows)} total.")
        
        # Write back
        with open(output_path, 'w', encoding='utf-8', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter='|')
            writer.writeheader()
            writer.writerows(rows)
            
        print(f"Successfully wrote updated CSV to {output_path}")
        
    except Exception as e:
        print(f"Error processing OpenCritic CSV: {e}")

if __name__ == "__main__":
    hltb_data = load_hltb_data(HLTB_FILE)
    if hltb_data:
        enrich_opencritic(hltb_data, OPENCRITIC_FILE, OUTPUT_FILE)
