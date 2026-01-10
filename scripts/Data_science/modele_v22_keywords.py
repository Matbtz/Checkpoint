
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.inspection import permutation_importance

# === CONFIGURATION ===
CSV_PATH = 'scripts/csv/enriched_clean_dataset.csv'
REPORT_PATH = 'scripts/Data_science/rapport_analyse_v22_keywords.txt'

def calculate_franchise_feature(df):
    def get_year(d):
        try: return pd.to_datetime(d).year
        except: return 2010
    df['year_rel'] = df['releaseDate'].apply(get_year)
    valid_source = df[df['hltbMain'] > 0.1]
    franchise_groups = valid_source.groupby('franchise')
    franchise_avgs = {}
    for franch_name, group in franchise_groups:
        if pd.isna(franch_name) or franch_name == '' or franch_name == 'unknown': continue
        records = group[['id', 'year_rel', 'hltbMain']].to_dict('records')
        if len(records) < 2: continue
        for target in records:
            tid = target['id']
            tyear = target['year_rel']
            numerator = 0
            denominator = 0
            for other in records:
                if other['id'] == tid: continue
                diff = abs(tyear - other['year_rel'])
                weight = 1.0 / (1.0 + 0.5 * diff)
                numerator += other['hltbMain'] * weight
                denominator += weight
            if denominator > 0:
                franchise_avgs[tid] = numerator / denominator
    df['franchise_momentum'] = df['id'].map(franchise_avgs).fillna(-1)
    return df

# === NEW: Studio Target Encoding ===
def calculate_studio_feature(df):
    # Similar to franchise, but for Studio.
    # Group by 'studio'.
    # We must be careful about data leakage if we were doing strict CV, 
    # but for this logic we'll use a leave-one-out style or just global avg (excluding self).
    
    valid_source = df[df['hltbMain'] > 0.1]
    studio_groups = valid_source.groupby('studio')
    studio_avgs = {}
    
    for studio_name, group in studio_groups:
        if pd.isna(studio_name) or studio_name == '' or studio_name == 'unknown': continue
        records = group[['id', 'hltbMain']].to_dict('records')
        if len(records) < 2: continue # Need at least 2 games to predict one from others
        
        for target in records:
            tid = target['id']
            numerator = 0
            denominator = 0
            for other in records:
                if other['id'] == tid: continue
                numerator += other['hltbMain']
                denominator += 1
            if denominator > 0:
                studio_avgs[tid] = numerator / denominator
                
    df['studio_avg_time'] = df['id'].map(studio_avgs).fillna(-1)
    return df

def run_analysis():
    print(f"Loading Data from {CSV_PATH}...")
    df = pd.read_csv(CSV_PATH, sep='|', on_bad_lines='skip', low_memory=False)
    
    # Cleaning
    df['hltbMain'] = pd.to_numeric(df['hltbMain'], errors='coerce').fillna(0)
    df['steamReviewCount'] = pd.to_numeric(df['steamReviewCount'], errors='coerce').fillna(0)
    df['log_review_count'] = np.log1p(df['steamReviewCount'])
    
    # Scores
    df['quality_index'] = df[['opencriticScore', 'igdbScore', 'steamReviewPercent']].mean(axis=1).fillna(70)
    df['log_hypes'] = np.log1p(pd.to_numeric(df['hypes'], errors='coerce').fillna(0))
    
    # Features
    df = calculate_franchise_feature(df)
    df = calculate_studio_feature(df) # NEW
    
    df['title_lower'] = df['title'].str.lower()
    df['all_meta'] = df['genres'].astype(str) + " " + df['keywords'].astype(str) + " " + df['themes'].astype(str)
    df['all_meta'] = df['all_meta'].str.lower()
    
    keywords_dlc = ['dlc', 'expansion', 'pack', 'pass', 'season'] 
    keywords_demo = ['demo', 'prologue', 'teaser']
    df['is_dlc_explicit'] = df['isDlc'].map({'True': 1, 'False': 0, True: 1, False: 0}).fillna(0)
    df['is_dlc_keyword'] = df['title_lower'].apply(lambda x: 1 if any(k in str(x) for k in keywords_dlc) else 0)
    df['is_demo'] = df['title_lower'].apply(lambda x: 1 if any(k in str(x) for k in keywords_demo) else 0)
    df['is_content_expansion'] = df[['is_dlc_explicit', 'is_dlc_keyword', 'is_demo']].max(axis=1)
    
    # Filter
    keywords_mmo_service = ['mmo ', 'mmorpg', 'online only', 'multiplayer only', 'esports']
    kw_strict_endless = ['farming', 'agricultural', 'flight', 'train', 'truck', 'space sim', 'sandbox', 'mmo']
    keywords_pure_endless = ['grand strategy', '4x', 'sports', 'racing', 'manager']
    
    def has_kw(row, kws): return 1 if any(k in row for k in kws) else 0
    
    df['is_mmo_service'] = df['all_meta'].apply(lambda x: has_kw(x, keywords_mmo_service))
    df['is_strict_endless'] = df['all_meta'].apply(lambda x: has_kw(x, kw_strict_endless))
    df['is_pure_endless'] = df['all_meta'].apply(lambda x: has_kw(x, keywords_pure_endless))
    
    mask_exclude = (df['is_mmo_service'] == 1) | (df['is_strict_endless'] == 1) | (df['is_pure_endless'] == 1)
    df_finite = df[~mask_exclude].copy()
    mask_valid = (df_finite['hltbMain'] > 0.5) & (df_finite['hltbMain'] < 200)
    df_model = df_finite[mask_valid].copy()
    
    # === NEW: Sub-Genre Keywords ===
    def has(row, kws): return 1 if any(k in row for k in kws) else 0
    
    # RPG Sub-genres
    df_model['KW_JRPG'] = df_model['all_meta'].apply(lambda x: has(x, ['jrpg', 'japanese rpg', 'anime']))
    df_model['KW_PartyBased'] = df_model['all_meta'].apply(lambda x: has(x, ['party-based', 'party based', 'crpg']))
    df_model['KW_DungeonCrawler'] = df_model['all_meta'].apply(lambda x: has(x, ['dungeon crawler', 'blobber']))
    df_model['is_rpg'] = df_model['all_meta'].apply(lambda x: 1 if 'rpg' in x else 0)
    
    # Platformer Sub-genres
    df_model['KW_Platformer'] = df_model['all_meta'].apply(lambda x: has(x, ['platformer', 'platforming']))
    df_model['KW_3D'] = df_model['all_meta'].apply(lambda x: has(x, ['3d platformer', '3d']))
    df_model['KW_2D'] = df_model['all_meta'].apply(lambda x: has(x, ['2d platformer', '2d', 'side scroller']))
    
    # Strategy Sub-genres
    df_model['KW_Strategy'] = df_model['all_meta'].apply(lambda x: has(x, ['strategy', 'tactical', 'rts']))
    df_model['KW_4X'] = df_model['all_meta'].apply(lambda x: has(x, ['4x', 'grand strategy']))
    
    # Other mechanics (V20)
    df_model['KW_TurnBased'] = df_model['all_meta'].apply(lambda x: has(x, ['turn-based', 'tbs']))
    df_model['KW_Management'] = df_model['all_meta'].apply(lambda x: has(x, ['management', 'base building', 'farming', 'crafting']))
    df_model['KW_SideContent'] = df_model['all_meta'].apply(lambda x: has(x, ['side quests', 'exploration', 'open world', 'collectibles']))
    
    # AAA Proxy
    df_model['is_indie'] = df_model['all_meta'].apply(lambda x: 1 if 'indie' in x else 0)
    df_model['is_high_pop'] = df_model['log_review_count'].apply(lambda x: 1 if x > 9.9 else 0)
    df_model['is_AAA_proxy'] = ((df_model['is_high_pop'] == 1) & (df_model['is_indie'] == 0)).astype(int)
    
    # Interactions
    df_model['INT_JRPG_AAA'] = df_model['KW_JRPG'] * df_model['is_AAA_proxy']
    df_model['INT_3D_Platformer'] = df_model['KW_3D'] * df_model['KW_Platformer']
    df_model['INT_Quality_RPG'] = df_model['quality_index'] * df_model['is_rpg']
    df_model['INT_Quality_Strategy'] = df_model['quality_index'] * df_model['KW_Strategy']

    features_num = [
        'log_review_count', 'franchise_momentum', 'studio_avg_time', 'is_content_expansion',
        'is_rpg', 'KW_JRPG', 'KW_PartyBased', 'KW_DungeonCrawler',
        'KW_Platformer', 'KW_3D', 'KW_2D',
        'KW_Strategy', 'KW_4X',
        'KW_TurnBased', 'KW_Management', 'KW_SideContent',
        'quality_index', 'log_hypes',
        'is_AAA_proxy', 'INT_JRPG_AAA', 'INT_3D_Platformer', 'INT_Quality_RPG', 'INT_Quality_Strategy'
    ]
    features_cat = ['studio'] # We keep studio cat even with avg time, to capture residual effects? Or remove to prevent overfit? Let's keep for now.

    X = df_model[features_num + features_cat]
    y = df_model['hltbMain']
    
    # Sample Weights
    df_model['sample_weight'] = 1.0
    # Boost our target sub-genres to ensure they are learnt
    df_model.loc[df_model['KW_JRPG'] == 1, 'sample_weight'] *= 2.0
    df_model.loc[df_model['INT_3D_Platformer'] == 1, 'sample_weight'] *= 2.0
    df_model.loc[df_model['KW_SideContent'] == 1, 'sample_weight'] *= 1.5
    
    w = df_model['sample_weight']
    
    # Split
    X_train, X_test, y_train, y_test, w_train, w_test = train_test_split(X, y, w, test_size=0.1, random_state=42)
    
    # Train
    preprocessor = ColumnTransformer([
        ('num', 'passthrough', features_num),
        ('cat', OneHotEncoder(handle_unknown='ignore', max_categories=100, sparse_output=False), features_cat)
    ])
    
    model = Pipeline([
        ('preprocessor', preprocessor),
        ('regressor', HistGradientBoostingRegressor(
            loss='absolute_error', 
            random_state=42,
            learning_rate=0.01,
            max_iter=400, 
            max_leaf_nodes=40,
            min_samples_leaf=15, # Lower min samples because specialized sub-genres are small
            l2_regularization=0.1
        ))
    ])
    
    print("Training Model V22 (Keywords & Studio)...")
    model.fit(X_train, y_train, regressor__sample_weight=w_train)
    
    # === REPORT ===
    preds_test = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds_test)
    
    # Precision
    df_eval = df_model.loc[y_test.index].copy()
    df_eval['Predicted'] = preds_test
    
    def calc_precision(d):
        if d.empty: return 0.0
        d_valid = d[d['hltbMain'] > 1.0]
        if d_valid.empty: return 0.0
        mape = np.mean(np.abs((d_valid['hltbMain'] - d_valid['Predicted']) / d_valid['hltbMain']))
        return max(0, 100 * (1 - mape))
        
    global_precision = calc_precision(df_eval)
    
    # Genre Analysis
    genre_metrics = []
    # Check explicitly defined columns
    check_cols = {
        'RPG': 'is_rpg', 'JRPG': 'KW_JRPG', 'Strategy': 'KW_Strategy',
        'Platformer': 'KW_Platformer', '3D Plat': 'INT_3D_Platformer',
        'Shooter': 'KW_Shooter', 'Puzzle': 'KW_Puzzle' # Need to add back if missing
    }
    
    # Add back simple keywords for reporting if not in features
    df_eval['KW_Shooter'] = df_eval['all_meta'].apply(lambda x: 1 if 'shooter' in x else 0)
    df_eval['KW_Puzzle'] = df_eval['all_meta'].apply(lambda x: 1 if 'puzzle' in x else 0)
    
    for g, k in check_cols.items():
        if k in df_eval.columns:
            subset = df_eval[df_eval[k] == 1]
            if len(subset) > 0:
                g_mae = mean_absolute_error(subset['hltbMain'], subset['Predicted'])
                g_prec = calc_precision(subset)
                genre_metrics.append({'Genre': g, 'MAE': g_mae, 'Precision': g_prec, 'Count': len(subset)})
                
    genre_df = pd.DataFrame(genre_metrics).sort_values('Precision', ascending=False)
    
    # Top 200
    full_preds = model.predict(X)
    df_model['Predicted'] = full_preds
    top_200 = df_model.sort_values('steamReviewCount', ascending=False).head(200).copy()
    top_200['Diff'] = top_200['Predicted'] - top_200['hltbMain']
    top_200['AbsPerc'] = np.abs(top_200['Diff'] / top_200['hltbMain'])
    top_200['Status'] = top_200['AbsPerc'].apply(lambda x: "✅" if x < 0.1 else ("⚠️" if x < 0.25 else "❌"))
    
    # Feature Importance
    print("Calculating Feature Importance...")
    result = permutation_importance(model, X_test, y_test, n_repeats=5, random_state=42, n_jobs=-1)
    importances = pd.DataFrame({
        'Feature': features_num + features_cat,
        'Importance': result.importances_mean,
        'Std': result.importances_std
    }).sort_values('Importance', ascending=False)
    
    with open(REPORT_PATH, 'w', encoding='utf-8') as f:
        f.write("=== RAPPORT ANALYSE V22 (Keywords & Studio Optimized) ===\n\n")
        f.write(f"Global MAE: {mae:.2f}h\n")
        f.write(f"Global Precision: {global_precision:.2f}%\n\n")
        
        f.write("--- GENRE PRECISION ---\n")
        f.write(genre_df.to_string(index=False))
        f.write("\n\n")
        
        f.write("--- TOP 200 PREDICTIONS ---\n")
        f.write(f"{'Title':<30} | {'Act':<6} | {'Pred':<6} | {'Diff':<6} | {'St'} | {'JRPG'} | {'3D'}\n")
        f.write("-" * 80 + "\n")
        for _, row in top_200.iterrows():
            t = row['title'][:30]
            jrpg = "YES" if row['KW_JRPG']==1 else ""
            d3 = "YES" if row['KW_3D']==1 else ""
            f.write(f"{t:<30} | {row['hltbMain']:<6.1f} | {row['Predicted']:<6.1f} | {row['Diff']:<+6.1f} | {row['Status']} | {jrpg:<6} | {d3}\n")
            
        f.write("\n--- FEATURE IMPORTANCE ---\n")
        f.write(importances.to_string(index=False))
        
    print(f"Report: {REPORT_PATH}")

if __name__ == "__main__":
    run_analysis()
