
import pandas as pd
import numpy as np
import ast
import os
import re
import json
from sklearn.preprocessing import MultiLabelBinarizer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

# --- CONFIG ---
CSV_PATH = 'scripts/csv/opencritic_sync-score.csv'
REPORT_PATH = 'scripts/Data_science/rapport_analyse_v8.txt'
PRED_PATH = 'scripts/Data_science/predictions_full.csv'

# --- UTILS ---
def parse_list_safe(x):
    try:
        if pd.isna(x): return []
        if isinstance(x, list): return x
        # Handle parsed JSON via pandas converter or manual check
        cleaned = str(x).replace('""', '"')
        if cleaned.startswith('['):
            try:
                return json.loads(cleaned)
            except:
                pass
        return [s.strip() for s in str(x).split(',')]
    except: 
        return []

def simplify_genre(g):
    g = str(g).lower()
    if 'rpg' in g or 'role-playing' in g: return 'RPG'
    if 'strategy' in g: return 'Strategy'
    if 'adventure' in g: return 'Adventure'
    if 'action' in g: return 'Action'
    if 'puzzle' in g: return 'Puzzle'
    if 'shooter' in g: return 'Shooter'
    if 'platform' in g: return 'Platform'
    if 'racing' in g: return 'Racing'
    if 'simulation' in g: return 'Simulation'
    return g.capitalize()

def extract_franchise_fallback(title):
    if not isinstance(title, str): return "Unknown"
    title_lower = title.lower()
    base = re.split(r'[:\-]', title)[0].strip()
    base = re.sub(r'\s+(VII|VIII|IX|IV|V|VI|III|II|I|\d+)$', '', base, flags=re.IGNORECASE).strip()
    
    if 'zelda' in title_lower: return 'The Legend of Zelda'
    if 'mario' in title_lower and 'kart' not in title_lower: return 'Mario Mainline'
    if 'pokemon' in title_lower: return 'Pokemon'
    if 'final fantasy' in title_lower: return 'Final Fantasy'
    if 'persona' in title_lower: return 'Persona'
    if 'dragon quest' in title_lower: return 'Dragon Quest'
    if 'hollow knight' in title_lower: return 'Hollow Knight'
    if 'dark souls' in title_lower: return 'Dark Souls'
    if 'elder scrolls' in title_lower: return 'The Elder Scrolls'
    if 'fallout' in title_lower: return 'Fallout'
    if 'witcher' in title_lower: return 'The Witcher'
    if 'god of war' in title_lower: return 'God of War'
    
    return base

def run_v8_model():
    print("Loading Data (Model V8 - Enriched Data)...")
    if not os.path.exists(CSV_PATH):
        print(f"CSV not found at {CSV_PATH}")
        return

    # Load with explicit delimiter
    df = pd.read_csv(CSV_PATH, sep='|', on_bad_lines='skip', low_memory=False, encoding='utf-8')
    
    # 0. Clean & Prepare Columns
    df['hltbMain'] = pd.to_numeric(df['hltbMain'], errors='coerce')
    df['hltbExtra'] = pd.to_numeric(df['hltbExtra'], errors='coerce')
    df['hltbCompletionist'] = pd.to_numeric(df['hltbCompletionist'], errors='coerce')
    
    # Ratios
    df['ratio_extra'] = df['hltbExtra'] / df['hltbMain']
    df['ratio_comp'] = df['hltbCompletionist'] / df['hltbMain']
    
    # IsDlc Logic: Use gameType (IGDB) + isDlc (Manual)
    # gameType: 1=DLC, 2=Expansion, 4=Standalone Expansion
    df['gameType'] = pd.to_numeric(df['gameType'], errors='coerce').fillna(0)
    
    if 'isDlc' in df.columns:
        df['is_dlc_flag'] = df['isDlc'].apply(lambda x: 1 if str(x).lower() == 'true' else 0)
    else:
        df['is_dlc_flag'] = 0

    df['is_expansion_igdb'] = df['gameType'].apply(lambda x: 1 if x in [1, 2, 4] else 0)
    
    # 1. Feature Engineering: Content Type
    df['title_lower'] = df['title'].fillna('').astype(str).str.lower()
    keywords_dlc = ['dlc', 'expansion', 'pack', 'soundtrack', 'skin', 'pass', 'episode', 'add-on']
    keywords_demo = ['demo', 'prologue', 'teaser']
    
    df['is_dlc_keyword'] = df['title_lower'].apply(lambda x: 1 if any(k in x for k in keywords_dlc) else 0)
    df['is_demo'] = df['title_lower'].apply(lambda x: 1 if any(k in x for k in keywords_demo) else 0)
    
    # Master Expansion Flag: IGDB Type > DLC Flag > Keywords
    df['is_content_expansion'] = df[['is_expansion_igdb', 'is_dlc_flag', 'is_dlc_keyword', 'is_demo']].max(axis=1)
    
    # 2. Franchise Stats
    # Use explicit franchise column if available
    if 'franchise' in df.columns:
        df['franchise_clean'] = df['franchise'].fillna(df['title'].apply(extract_franchise_fallback))
    else:
        df['franchise_clean'] = df['title'].apply(extract_franchise_fallback)
        
    mask_train_main = (df['hltbMain'] >= 0.2) & (df['hltbMain'] <= 500)
    # Exclude expansions from franchise average
    mask_franchise_calc = mask_train_main & (df['is_content_expansion'] == 0)
    
    franchise_stats = df.loc[mask_franchise_calc].groupby('franchise_clean')['hltbMain'].agg(
        mean_log=lambda x: np.log1p(x).mean(),
        max_log=lambda x: np.log1p(x).max(),
        count='count'
    )
    
    global_mean_log = np.log1p(df.loc[mask_franchise_calc, 'hltbMain']).mean()
    
    def get_fran_stat(base, stat_col, fallback):
        try:
            row = franchise_stats.loc[base]
            if row['count'] >= 1: return row[stat_col]
        except KeyError: pass
        return fallback

    df['fran_mean'] = df['franchise_clean'].apply(lambda x: get_fran_stat(x, 'mean_log', global_mean_log))
    df['fran_max'] = df['franchise_clean'].apply(lambda x: get_fran_stat(x, 'max_log', global_mean_log))
    
    # 3. Interaction
    df['INT_FranMean_DLC'] = df['fran_mean'] * df['is_content_expansion']
    
    # 4. Mega-Indie & Keywords
    df['steamReviewCount'] = pd.to_numeric(df['steamReviewCount'], errors='coerce').fillna(0)
    df['log_reviews'] = np.log1p(df['steamReviewCount'])
    
    # Genres
    df['genres_list'] = df['genres'].apply(parse_list_safe)
    df['genres_simple'] = df['genres_list'].apply(lambda gl: [simplify_genre(g) for g in gl])
    mlb = MultiLabelBinarizer()
    genre_matrix = mlb.fit_transform(df['genres_simple'])
    genre_df = pd.DataFrame(genre_matrix, columns=[f"G_{g}" for g in mlb.classes_], index=df.index)
    
    if 'G_Indie' not in genre_df.columns: genre_df['G_Indie'] = 0
    df['is_Mega_Indie'] = ((genre_df['G_Indie'] == 1) & (df['steamReviewCount'] > 10000)).astype(int)
    
    
    # Explicit Keywords & Genres (Merged)
    if 'keywords' in df.columns:
        df['keywords_list'] = df['keywords'].apply(parse_list_safe)
    else:
        df['keywords_list'] = [[] for _ in range(len(df))]
        
    # Combine normalized genres + keywords for better coverage
    def combine_tags(row):
        g = [str(x).lower().strip() for x in row['genres_list']]
        k = [str(x).lower().strip() for x in row['keywords_list']]
        return set(g + k)

    df['tags_combined'] = df.apply(combine_tags, axis=1)
    
    common_keywords = ['open world', 'linear', 'story rich', 'visual novel', 'multiplayer', 'co-op', 'roguelike', 'metroidvania', 'souls-like', 'soulslike']
    
    for k in common_keywords:
        # Normalize target
        target = k.replace('-', '')
        col_name = f"KW_{target.replace(' ', '_')}"
        
        # Check title too for "Remake" etc
        df[col_name] = df.apply(lambda row: 1 if k in row['tags_combined'] or target in [t.replace('-','') for t in row['tags_combined']] or k in row['title_lower'] else 0, axis=1)

    # Consolidate Souls-like
    # The loop above creates 'KW_soulslike' (from 'souls-like' -> 'soulslike')
    # If we want a standard name, let's rename it or just use it.
    if 'KW_soulslike' in df.columns:
         df['KW_souls_like'] = df['KW_soulslike'] # Alias for consistency if needed or just use KW_soulslike
    else:
         df['KW_souls_like'] = 0

    # 5. Metroidvania Interaction (Enhanced with Keywords)
    # KW_metroidvania is now robust
    df['is_Metroidvania_Combined'] = df[['KW_metroidvania', 'G_Metroidvania'] if 'G_Metroidvania' in genre_df else ['KW_metroidvania']].max(axis=1)
    df['INT_Indie_Metroidvania'] = genre_df['G_Indie'] * df['is_Metroidvania_Combined']
    
    # 6. Interaction: Mega-Indie * Franchise Max
    df['INT_MegaIndie_FranMax'] = df['is_Mega_Indie'] * df['fran_max']

    # 7. Year Trend
    df['releaseDate'] = pd.to_datetime(df['releaseDate'], errors='coerce')
    df['releaseYear'] = df['releaseDate'].dt.year.fillna(2025)
    df['year_norm'] = (df['releaseYear'] - 2000) / 10.0
    
    # 8. Negative Keywords
    keywords_remove = ['soundtrack', ' ost', 'artbook', 'wallpaper', 'cosmetic', 'server']
    df['is_non_game'] = df['title_lower'].apply(lambda x: 1 if any(k in x for k in keywords_remove) else 0)

    # FEATURES ASSEMBLY
    base_features = [
        'log_reviews', 'fran_mean', 'fran_max', 'year_norm', 
        'is_content_expansion', 'is_demo', 'is_Mega_Indie', 
        'INT_FranMean_DLC', 'INT_Indie_Metroidvania', 'INT_MegaIndie_FranMax',
        'KW_open_world', 'KW_linear', 'KW_story_rich', 'KW_visual_novel', 'KW_roguelike', 'KW_souls_like'
    ]
    
    # Add genre columns
    features = pd.concat([df[base_features], genre_df], axis=1).fillna(0)
    
    # 9. Weighting Strategy
    avg_base = df.loc[df['is_content_expansion'] == 0, 'steamReviewCount'].mean()
    avg_dlc = df.loc[df['is_content_expansion'] == 1, 'steamReviewCount'].mean()
    if pd.isna(avg_dlc) or avg_dlc < 1: avg_dlc = 1
    if pd.isna(avg_base): avg_base = 1
    
    K_boost = (avg_base / avg_dlc) if avg_dlc > 0 else 1.0
    if K_boost > 10: K_boost = 10.0
    
    weights = np.log1p(df['steamReviewCount'] + 1)
    weights[df['is_content_expansion'] == 1] *= K_boost

    # 10. Training
    print("Training Model V8 (Enriched)...")
    mask_train = mask_train_main & (df['is_non_game'] == 0)
    
    # If dataset is small, be careful with split
    if mask_train.sum() < 50:
        print("Not enough training data (<50 samples).")
        return

    X_train, X_test, y_train, y_test, w_train, w_test = train_test_split(
        features[mask_train], 
        np.log1p(df.loc[mask_train, 'hltbMain']), 
        weights[mask_train],
        test_size=0.2, 
        random_state=42
    )
    
    # Handle possible duplicate columns in features
    features = features.loc[:, ~features.columns.duplicated()]
    
    est_main = HistGradientBoostingRegressor(
        loss='quantile', quantile=0.5,
        max_iter=1000, max_depth=20, learning_rate=0.03, 
        categorical_features=[i for i, c in enumerate(features.columns) if c.startswith('G_')],
        random_state=42
    )
    est_main.fit(X_train, y_train, sample_weight=w_train)
    
    # Evaluation
    y_pred_log = est_main.predict(X_test)
    y_pred = np.expm1(y_pred_log)
    y_true = np.expm1(y_test)
    
    mae = mean_absolute_error(y_true, y_pred)
    median_error = np.median(np.abs(y_true - y_pred))
    r2 = r2_score(y_true, y_pred)
    
    # Full Prediction
    full_pred_log = est_main.predict(features)
    df['predicted_main'] = np.expm1(full_pred_log)
    
    # Cleanup Demos & Non-Games
    df.loc[df['is_non_game'] == 1, 'predicted_main'] = 0.0
    df.loc[df['is_demo'] == 1, 'predicted_main'] = df.loc[df['is_demo'] == 1, 'predicted_main'].clip(upper=2.0)
    
    # Report
    print("Generating Report...")
    with open(REPORT_PATH, 'w', encoding='utf-8') as f:
        f.write("=== RAPPORT ANALYSE MODELE V8 (Enriched & Verified) ===\n\n")
        f.write(f"Global MAE: {mae:.2f}h\n")
        f.write(f"Median Error: {median_error:.2f}h\n")
        f.write(f"R2 Score: {r2:.3f}\n\n")
        
        # Feature Importance (Proxy)
        f.write("--- KEYWORDS & FRANCHISE ---\n")
        f.write(f"Games with Open World: {df['KW_open_world'].sum()}\n")
        f.write(f"Games with Franchise: {df['franchise_clean'].nunique()}\n")
        f.write(f"Games with GameType=DLC: {df['is_expansion_igdb'].sum()}\n")
        
        f.write("\n--- CASE STUDIES ---\n")
        targets = [
            'Hollow Knight: Silksong', 
            'The Legend of Zelda: Tears of the Kingdom', 
            'Final Fantasy VII Rebirth', 
            'Blue Prince'
        ]
        
        for t in targets:
            match = df[df['title'].str.contains(t, case=False, na=False)]
            if len(match) > 0:
                row = match.iloc[0]
                f.write(f"Title: {row['title']}\n")
                f.write(f"   Prediction V8: {row['predicted_main']:.1f}h\n")
                if 'hltbMain' in row and row['hltbMain'] > 0:
                    f.write(f"   Actual HLTB: {row['hltbMain']:.1f}h\n")
                f.write(f"   Is Expansion: {row['is_content_expansion']}\n")
                f.write(f"   Is Mega Indie: {row['is_Mega_Indie']}\n")
                f.write(f"   Keywords: OpenWorld={row['KW_open_world']}, Linear={row['KW_linear']}\n")
                f.write("\n")
            
    print(f"Report done: {REPORT_PATH}")

if __name__ == "__main__":
    run_v8_model()
