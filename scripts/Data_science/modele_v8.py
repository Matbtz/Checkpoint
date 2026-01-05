
import pandas as pd
import numpy as np
import ast
import os
import re
from sklearn.preprocessing import MultiLabelBinarizer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

# --- CONFIG ---
CSV_PATH = 'scripts/Data_science/merged_all_games.csv'
REPORT_PATH = 'scripts/Data_science/rapport_analyse_v8.txt'
PRED_PATH = 'scripts/Data_science/predictions_full.csv'

# --- UTILS ---
def parse_list_safe(x):
    try:
        if pd.isna(x): return []
        cleaned = str(x).replace('""', '"')
        parsed = ast.literal_eval(cleaned)
        if isinstance(parsed, list): return parsed
        # Fallback for comma sep
        if isinstance(x, str): return [s.strip() for s in x.split(',')]
        return []
    except: 
        if isinstance(x, str): return [s.strip() for s in x.split(',')]
        return []

def simplify_genre(g):
    g = g.lower()
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

def extract_franchise(title):
    if not isinstance(title, str): return "Unknown"
    title_lower = title.lower()
    # Basic split
    base = re.split(r'[:\-]', title)[0].strip()
    # Remove roman numerals
    base = re.sub(r'\s+(VII|VIII|IX|IV|V|VI|III|II|I|\d+)$', '', base, flags=re.IGNORECASE).strip()
    
    # Overrides
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
    if 'assassin' in title_lower and 'creed' in title_lower: return 'Assassins Creed'
    
    return base

def run_v8_model():
    print("Loading Data (Model V8 - Audit Recommendations)...")
    if not os.path.exists(CSV_PATH):
        print("CSV not found.")
        return

    df = pd.read_csv(CSV_PATH, sep='|', on_bad_lines='skip', low_memory=False)
    
    # 0. Clean & Prepare Columns
    df['hltbMain'] = pd.to_numeric(df['hltbMain'], errors='coerce') / 60.0 # Hours
    df['hltbExtra'] = pd.to_numeric(df['hltbExtra'], errors='coerce') / 60.0
    df['hltbCompletionist'] = pd.to_numeric(df['hltbCompletionist'], errors='coerce') / 60.0
    
    # Ratios
    df['ratio_extra'] = df['hltbExtra'] / df['hltbMain']
    df['ratio_comp'] = df['hltbCompletionist'] / df['hltbMain']
    
    # IsDlc Retrieval (Fixing the blindspot)
    if 'isDlc' in df.columns:
        df['is_dlc_raw'] = df['isDlc'].fillna(False).astype(int)
    else:
        df['is_dlc_raw'] = 0
        
    # 1. Feature Engineering: Explicit DLC Logic (Section 6.1)
    df['title_lower'] = df['title'].fillna('').astype(str).str.lower()
    keywords_dlc = ['dlc', 'expansion', 'pack', 'soundtrack', 'skin', 'pass', 'episode', 'add-on']
    keywords_demo = ['demo', 'prologue', 'teaser']
    
    df['is_dlc_keyword'] = df['title_lower'].apply(lambda x: 1 if any(k in x for k in keywords_dlc) else 0)
    df['is_demo'] = df['title_lower'].apply(lambda x: 1 if any(k in x for k in keywords_demo) else 0)
    
    # Master Expansion Flag
    df['is_content_expansion'] = df[['is_dlc_raw', 'is_dlc_keyword', 'is_demo']].max(axis=1)
    
    # 2. Franchise Stats (V7 Logic)
    mask_train_main = (df['hltbMain'] >= 0.5) & (df['hltbMain'] <= 500)
    
    # Filter stats to only calculate based on MAIN GAMES (exclude expansions from franchise average to keep it pure!)
    # Crucial improvement: DLCs shouldn't drag down the "Franchise Mean".
    mask_franchise_calc = mask_train_main & (df['is_content_expansion'] == 0)
    
    df['franchise_base'] = df['title'].apply(extract_franchise)
    
    franchise_stats = df.loc[mask_franchise_calc].groupby('franchise_base')['hltbMain'].agg(
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

    df['fran_mean'] = df['franchise_base'].apply(lambda x: get_fran_stat(x, 'mean_log', global_mean_log))
    df['fran_max'] = df['franchise_base'].apply(lambda x: get_fran_stat(x, 'max_log', global_mean_log))
    
    # 3. Interaction: Franchise Mean * DLC Discount (Section 4.1)
    # The model learns that DLC length is a function of Franchise length
    df['INT_FranMean_DLC'] = df['fran_mean'] * df['is_content_expansion']
    
    # 4. Feature Engineering: Mega-Indie Regime (Section 5.1)
    df['steamReviewCount'] = pd.to_numeric(df['steamReviewCount'], errors='coerce').fillna(0)
    df['log_reviews'] = np.log1p(df['steamReviewCount'])
    
    # Parse Genres first to get G_Indie
    df['genres_list'] = df['genres'].apply(parse_list_safe)
    df['genres_simple'] = df['genres_list'].apply(lambda gl: [simplify_genre(g) for g in gl])
    mlb = MultiLabelBinarizer()
    genre_matrix = mlb.fit_transform(df['genres_simple'])
    genre_df = pd.DataFrame(genre_matrix, columns=[f"G_{g}" for g in mlb.classes_], index=df.index)
    
    if 'G_Indie' not in genre_df.columns:
        genre_df['G_Indie'] = 0 # Fallback
        
    df['is_Mega_Indie'] = ((genre_df['G_Indie'] == 1) & (df['steamReviewCount'] > 10000)).astype(int)
    
    # 5. Metroidvania NLP & Interaction (Section 5.2)
    df['description'] = df['description'].fillna('').astype(str).str.lower()
    df['is_Metroidvania'] = df['description'].str.contains('metroidvania', case=False).astype(int)
    
    df['INT_Indie_Metroidvania'] = genre_df['G_Indie'] * df['is_Metroidvania']
    
    # 6. Interaction: Mega-Indie * Franchise Max (Section 5.3)
    # "Trust Franchise History for Big Indies"
    df['INT_MegaIndie_FranMax'] = df['is_Mega_Indie'] * df['fran_max']

    # 7. Year Trend
    df['releaseDate'] = pd.to_datetime(df['releaseDate'], errors='coerce')
    df['releaseYear'] = df['releaseDate'].dt.year.fillna(2025)
    df['year_norm'] = (df['releaseYear'] - 2000) / 10.0
    
    # 8. Negative Keywords (Section 4.3)
    # Hard overrides for non-games
    keywords_remove = ['soundtrack', ' ost', 'artbook', 'wallpaper', 'cosmetic']
    df['is_non_game'] = df['title_lower'].apply(lambda x: 1 if any(k in x for k in keywords_remove) else 0)

    # FEATURES ASSEMBLY
    features = pd.concat([
        df[['log_reviews', 'fran_mean', 'fran_max', 'year_norm', 
            'is_content_expansion', 'is_demo', 'is_Mega_Indie', 'is_Metroidvania',
            'INT_FranMean_DLC', 'INT_Indie_Metroidvania', 'INT_MegaIndie_FranMax']], 
        genre_df
    ], axis=1).fillna(0)
    
    # 9. Weighting Strategy (Section 6.2)
    # Boost DLC importance
    avg_base = df.loc[df['is_content_expansion'] == 0, 'steamReviewCount'].mean()
    avg_dlc = df.loc[df['is_content_expansion'] == 1, 'steamReviewCount'].mean()
    # Avoid zero div
    if avg_dlc < 1: avg_dlc = 1
    K_boost = (avg_base / avg_dlc) if avg_dlc > 0 else 1.0
    # Cap K at 10 to avoid exploding weights
    if K_boost > 10: K_boost = 10.0
    
    print(f"DLC Weight Boost Factor: {K_boost:.2f}")
    
    weights = np.log1p(df['steamReviewCount'] + 1)
    # Apply boost to DLC rows
    weights[df['is_content_expansion'] == 1] *= K_boost

    # 10. Training & Analysis
    print("Training Model V8 (Audit Compliant)...")
    
    # Filter training set: Include Valid Main, Exclude Non-Games
    mask_train = mask_train_main & (df['is_non_game'] == 0)
    
    X_train, X_test, y_train, y_test, w_train, w_test = train_test_split(
        features[mask_train], 
        np.log1p(df.loc[mask_train, 'hltbMain']), 
        weights[mask_train],
        test_size=0.2, 
        random_state=42
    )
    
    est_main = HistGradientBoostingRegressor(
        loss='quantile', quantile=0.5, # Median Regression
        max_iter=600, max_depth=20, learning_rate=0.03, 
        random_state=42
    )
    # Use sample weights!
    est_main.fit(X_train, y_train, sample_weight=w_train)
    
    # Evaluation
    y_pred_log = est_main.predict(X_test)
    y_pred = np.expm1(y_pred_log)
    y_true = np.expm1(y_test)
    y_true_clean = np.where(y_true < 0.1, 0.1, y_true) # Avoid div/0
    
    mae = mean_absolute_error(y_true, y_pred)
    median_error = np.median(np.abs(y_true - y_pred))
    mape = np.mean(np.abs((y_true - y_pred) / y_true_clean)) * 100
    r2 = r2_score(y_true, y_pred)
    
    # Full Prediction for Analysis
    full_pred_log = est_main.predict(features)
    df['predicted_main'] = np.expm1(full_pred_log)
    
    # Override Non-Games
    df.loc[df['is_non_game'] == 1, 'predicted_main'] = 0.0
    df.loc[df['is_demo'] == 1, 'predicted_main'] = df.loc[df['is_demo'] == 1, 'predicted_main'].clip(upper=2.0) # Cap Demos
    
    # Error Stats
    df['error_abs'] = np.abs(df['hltbMain'] - df['predicted_main'])
    df['error_pct'] = (df['error_abs'] / df['hltbMain'].replace(0, 0.1)) * 100
    
    # Generate Report
    print("Generating Report...")
    with open(REPORT_PATH, 'w', encoding='utf-8') as f:
        f.write("=== RAPPORT ANALYSE MODELE V8 (Audit Compliant) ===\n\n")
        f.write(f"Global MAE: {mae:.2f}h\n")
        f.write(f"Median Error: {median_error:.2f}h\n")
        f.write(f"MAPE: {mape:.1f}%\n")
        f.write(f"R2 Score: {r2:.3f}\n\n")
        
        f.write("--- REGIME ANALYSIS ---\n")
        # DLC Error
        dlc_mask = (df['is_content_expansion'] == 1) & mask_train
        if dlc_mask.sum() > 0:
            mae_dlc = mean_absolute_error(df.loc[dlc_mask, 'hltbMain'], df.loc[dlc_mask, 'predicted_main'])
            f.write(f"DLC/Expansion MAE: {mae_dlc:.2f}h (Target: Low)\n")
        
        # Main Game Error
        main_mask = (df['is_content_expansion'] == 0) & mask_train
        if main_mask.sum() > 0:
            mae_main = mean_absolute_error(df.loc[main_mask, 'hltbMain'], df.loc[main_mask, 'predicted_main'])
            f.write(f"Main Game MAE: {mae_main:.2f}h\n")
            
        f.write("\n--- CASE STUDIES (V7 Failures) ---\n")
        targets = [
            'Hollow Knight: Silksong', 
            'The Legend of Zelda: Tears of the Kingdom', 
            'Final Fantasy VII Rebirth', 
            'Final Fantasy XI: Scars of Abyssea',
            'Blue Prince'
        ]
        
        for t in targets:
            match = df[df['title'].str.contains(t, case=False, na=False)]
            if len(match) > 0:
                row = match.iloc[0]
                pred = row['predicted_main']
                actual = row.get('hltbMain', 0)
                f.write(f"Title: {row['title']}\n")
                f.write(f"   Prediction V8: {pred:.1f}h\n")
                f.write(f"   Actual HLTB: {actual:.1f}h\n")
                f.write(f"   Is Expansion: {row['is_content_expansion']}\n")
                f.write(f"   Is Mega Indie: {row['is_Mega_Indie']}\n")
                f.write(f"   Fran Max: {np.expm1(row['fran_max']):.1f}h\n")
                f.write("\n")
                
        f.write("--- TOP 20 REMAINING ERRORS ---\n")
        bad = df[mask_train].nlargest(20, 'error_pct')
        for idx, row in bad.iterrows():
            f.write(f"{row['title']}: Pred {row['predicted_main']:.1f}h vs Real {row['hltbMain']:.1f}h (Error: {row['error_pct']:.0f}%)\n")
            
    print(f"Report done: {REPORT_PATH}")
    
    # NO CSV EXPORT TO DB (As requested)

if __name__ == "__main__":
    run_v8_model()
