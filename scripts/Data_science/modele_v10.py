
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.experimental import enable_hist_gradient_boosting
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, r2_score
import joblib
import json
import re

# === CONFIGURATION ===
CSV_PATH = 'scripts/csv/enriched_clean_dataset.csv'
MODEL_PATH = 'scripts/Data_science/models/model_v10.pkl'
PRED_OUTPUT = 'scripts/Data_science/predictions_v10.csv'
REPORT_PATH = 'scripts/Data_science/rapport_analyse_v10.txt'

# Genres to boost weight
PRIORITY_GENRES = ['Open world', 'Metroidvania', 'Souls-like', 'JRPG', 'Role-playing (RPG)']
PRIORITY_WEIGHT = 3.0 

def normalize_franchise(txt):
    if pd.isna(txt) or txt == '': return 'unknown'
    return str(txt).lower().strip()

def calculate_franchise_feature(df):
    """
    Calculates a 'franchise_weighted_avg' column.
    For each game, it looks at other games in the same franchise.
    Calculates weighted avg of hltbMain based on time proximity.
    Weight = 1 / (1 + abs(GameYear - OtherYear))
    """
    print("Calculating Franchise History features...")
    
    # helper: extract year
    def get_year(d):
        try:
            return pd.to_datetime(d).year
        except:
            return 2010 # Fallback
            
    df['year_rel'] = df['releaseDate'].apply(get_year)
    
    # fallback franchise cleaning if 'franchise' column is empty
    # But enriched_clean_dataset has 'franchise' column populated by enrichment?
    # Let's use 'franchise' column if existing, else fallback to title heuristics
    
    # Pre-compute a map: Franchise -> List of (id, year, main_time)
    # Filter only valid main_times for the history source
    valid_source = df[df['hltbMain'] > 0.1]
    
    franchise_groups = valid_source.groupby('franchise')
    
    # We will build a dict: game_id -> weighted_avg
    franchise_avgs = {}
    
    # Iterate all games in df
    total = len(df)
    processed = 0
    
    # To optimize: iterate groups instead of rows?
    # Yes. For each franchise group, calculate cross-weighted avgs.
    
    for franch_name, group in franchise_groups:
        if pd.isna(franch_name) or franch_name == '' or franch_name == 'unknown':
            continue
            
        # Group is a DataFrame of games in this franchise
        # Convert to records for speed
        records = group[['id', 'year_rel', 'hltbMain']].to_dict('records')
        
        if len(records) < 2:
            continue # No other games to compare
            
        for target in records:
            tid = target['id']
            tyear = target['year_rel']
            
            numerator = 0
            denominator = 0
            
            for other in records:
                if other['id'] == tid: continue
                
                oyear = other['year_rel']
                omain = other['hltbMain']
                
                # Weight: Closer in time = Higher weight
                # Recency Logic: User said "more weight on more recent games"
                # This could mean "Newer games (absolute)" or "Newer games relative to Franchise"
                # or "Games closer to this game".
                # Standard 'Franchise History' logic implies Proximity.
                # If I am predicting a 2024 game, I strictly care about 2023, 2022 games.
                # If I predict a 1990 game, I care about 1989, 1991.
                # Using 2024 data to predict 1990 is technically 'cheating' but for 'Library Filling' it is valid context.
                # Let's use Proximity.
                
                diff = abs(tyear - oyear)
                weight = 1.0 / (1.0 + 0.5 * diff) 
                
                # Bonus weight for 'Later' games? (Evolution of franchise usually gets longer)
                # If OtherYear > TargetYear, maybe slight penalty? Or bonus?
                # Let's stick to Proximity.
                
                numerator += omain * weight
                denominator += weight
                
            if denominator > 0:
                franchise_avgs[tid] = numerator / denominator
                
    # Apply to dataframe
    # Default value: global mean or genre mean? 
    # Let's use '0' to indicate "No Franchise History" and let trees handle it
    # Or median.
    median_val = df['hltbMain'].median()
    df['franchise_momentum'] = df['id'].map(franchise_avgs).fillna(-1) 
    
    # If -1, the model should split on it.
    print(f"Computed franchise momentum for {len(franchise_avgs)} games.")
    return df

def run_training():
    print(f"Loading Data from {CSV_PATH}...")
    df = pd.read_csv(CSV_PATH, sep='|', on_bad_lines='skip', low_memory=False)
    
    # 1. Clean / Convert Units
    # Dataset is HOURS.
    df['hltbMain'] = pd.to_numeric(df['hltbMain'], errors='coerce')
    df['hltbMain'] = df['hltbMain'].fillna(0)
    
    # 2. Features
    # Log Steam Reviews
    df['steamReviewCount'] = pd.to_numeric(df['steamReviewCount'], errors='coerce').fillna(0)
    df['log_review_count'] = np.log1p(df['steamReviewCount'])
    
    # Franchise Feature
    df = calculate_franchise_feature(df)
    
    # Genres BOOl
    common_keywords = ['Open world', 'Metroidvania', 'Souls-like', 'Roguelike', 'JRPG', 'RPG', 'Action', 'Adventure', 'Strategy']
    for kw in common_keywords:
        df[f'KW_{kw.lower().replace(" ","_")}'] = df['genres'].apply(lambda x: 1 if kw.lower() in str(x).lower() else 0)
        
    df['is_dlc'] = df['isDlc'].astype(int)
    
    # 3. Filter Training Data
    # Must have HLTB data > 0.1
    mask_train = (df['hltbMain'] > 0.1) & (df['hltbMain'] < 2000)
    
    train_df = df[mask_train].copy()
    
    # 4. Weights
    train_df['sample_weight'] = 1.0
    for g in PRIORITY_GENRES:
        mask = train_df['genres'].apply(lambda x: g.lower() in str(x).lower())
        train_df.loc[mask, 'sample_weight'] = PRIORITY_WEIGHT
        
    # High bias for Mega Games (High Reviews + Open World/RPG) to cure underestimation
    # If Reviews > 100k (approx log 11.5)
    mask_mega = (train_df['log_review_count'] > 11) & (train_df['hltbMain'] > 30)
    train_df.loc[mask_mega, 'sample_weight'] = 5.0 # FORCE it to respect these giants
    
    # 5. Pipeline
    features_num = ['log_review_count', 'franchise_momentum', 'is_dlc']
    features_cat = ['studio'] # Maybe add more?
    # KW features
    features_kw = [c for c in train_df.columns if c.startswith('KW_')]
    features_num += features_kw
    
    X = train_df[features_num + features_cat]
    y = train_df['hltbMain']
    weights = train_df['sample_weight']
    
    # Preprocessor
    preprocessor = ColumnTransformer(
        transformers=[
            ('num', 'passthrough', features_num),
            ('cat', OneHotEncoder(handle_unknown='ignore', max_categories=100, sparse_output=False), features_cat)
        ]
    )
    
    model = Pipeline([
        ('preprocessor', preprocessor),
        ('regressor', HistGradientBoostingRegressor(
            loss='absolute_error',
            random_state=42,
            max_iter=300, # More trees
            learning_rate=0.05
        ))
    ])
    
    print("Training Model V10...")
    X_train, X_test, y_train, y_test, w_train, w_test = train_test_split(X, y, weights, test_size=0.1, random_state=42)
    
    model.fit(X_train, y_train, regressor__sample_weight=w_train)
    
    # Evaluate
    score = model.score(X_test, y_test)
    preds_test = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds_test)
    
    # Check Mega Games in Test
    test_analysis = X_test.copy()
    test_analysis['Actual'] = y_test
    test_analysis['Pred'] = preds_test
    
    # Report
    with open(REPORT_PATH, 'w') as f:
        f.write("=== RAPPORT MODELE V10 (Franchise + MegaGame) ===\n\n")
        f.write(f"Global MAE: {mae:.2f}h\n")
        f.write(f"R2 Score: {score:.3f}\n\n")
        
        # Priority Metrics
        f.write("--- GENRE PERFORMANCE ---\n")
        # Need to reconstruct full dataframe for this, simplified here
        
        f.write("\n--- MEGA GAME SAMPLE (Reviews > 100k) ---\n")
        mega_mask = test_analysis['log_review_count'] > 11
        mega_games = test_analysis[mega_mask]
        if not mega_games.empty:
            mega_mae = mean_absolute_error(mega_games['Actual'], mega_games['Pred'])
            f.write(f"Mega Game MAE: {mega_mae:.2f}h (Sample n={len(mega_games)})\n")
            f.write(mega_games[['Actual', 'Pred']].head(5).to_string())
        else:
            f.write("No Mega Games in Test Set.\n")
            
    print(f"Report: {REPORT_PATH}")
    
    # Generate Full Predictions
    print("Generating Predictions for All...")
    df_all_X = df[features_num + features_cat]
    all_preds = model.predict(df_all_X)
    
    df['predicted_main'] = all_preds
    df[['id', 'title', 'gameType', 'hltbMain', 'predicted_main', 'franchise_momentum', 'log_review_count']].to_csv(PRED_OUTPUT, index=False)
    print(f"Predictions: {PRED_OUTPUT}")

if __name__ == "__main__":
    run_training()
