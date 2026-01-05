
import pandas as pd
import numpy as np
import ast
from sklearn.preprocessing import MultiLabelBinarizer

def inspect_features():
    csv_path = 'scripts/Data_science/merged_all_games.csv'
    df = pd.read_csv(csv_path, sep='|', on_bad_lines='skip', low_memory=False)
    
    # Simulating the pipeline features
    df['description'] = df['description'].fillna('').astype(str).str.lower()
    
    keywords = [
        'open world', 'roguelike', 'metroidvania', 'survival', 'visual novel', 'jrpg', 'mmo', 'multiplayer',
        'souls-like', 'soulslike', 'deck builder', 'rpg'
    ]
    
    targets = ['Tears of the Kingdom', 'Silksong', 'Rebirth']
    
    for t in targets:
        print(f"\n--- {t.upper()} ---")
        matches = df[df['title'].str.contains(t, case=False, na=False)]
        for idx, row in matches.iterrows():
            print(f"Title: {row['title']}")
            print(f"Developer: {row.get('developer', 'N/A')}")
            print(f"Genres (Raw): {row['genres']}")
            
            # Check NLP
            desc = row['description']
            found_keys = [k for k in keywords if k in desc]
            print(f"NLP Keywords Found: {found_keys}")
            
            # Check Genre Keywords
            genres = str(row['genres']).lower()
            if 'rpg' in genres: print("Genre: RPG Detected")
            if 'adventure' in genres: print("Genre: Adventure Detected")
            if 'indie' in genres: print("Genre: Indie Detected")
            
            print(f"HLTB Data (Main/Extra/Comp): {row.get('hltbMain')} / {row.get('hltbExtra')} / {row.get('hltbCompletionist')}")
            print("-" * 30)

if __name__ == "__main__":
    inspect_features()
