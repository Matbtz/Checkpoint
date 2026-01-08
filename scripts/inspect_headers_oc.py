import csv

def print_headers(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            headers = next(reader)
            print(f"Headers for {file_path}:")
            for h in headers:
                print(f"  - {h}")
            print("-" * 20)
    except Exception as e:
        print(f"Error reading {file_path}: {e}")

print_headers('scripts/csv/opencritic_sync-score.csv')
