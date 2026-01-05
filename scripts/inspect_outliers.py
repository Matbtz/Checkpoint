
import pandas as pd

def inspect():
    csv_path = r'c:\Users\mathi\OneDrive\Documents\Code\Checkpoint\scripts\Data_science\merged_all_games.csv'
    df = pd.read_csv(csv_path, sep='|', on_bad_lines='skip', low_memory=False)
    
    targets = ['Zelda', 'Silksong', 'Death Howl', 'Expedition 33', 'Blue Prince']
    
    print(f"Total rows: {len(df)}")
    
    for t in targets:
        print(f"\n--- Searching for: {t} ---")
        # Case insensitive search
        matches = df[df['title'].str.contains(t, case=False, na=False)]
        
        if len(matches) == 0:
            print("NO MATCH FOUND.")
        else:
            for idx, row in matches.iterrows():
                print(f"ID: {row['id']}")
                print(f"Title: {row['title']}")
                print(f"Genres: {row['genres']}")
                print(f"HLTB Main: {row['hltbMain']}")
                print(f"Description (First 100): {str(row['description'])[:100]}...")
                # Try to find developer or studio
                if 'developer' in row:
                    print(f"Developer: {row['developer']}")
                if 'studio' in row:
                    print(f"Studio: {row['studio']}")
                print("-" * 20)

if __name__ == "__main__":
    inspect()
