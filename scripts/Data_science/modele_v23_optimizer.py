
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, RandomizedSearchCV
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.preprocessing import OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, r2_score

# === CONFIGURATION ===
CSV_PATH = 'scripts/csv/enriched_clean_dataset.csv'
REPORT_PATH = 'scripts/Data_science/rapport_analyse_v23_optimization.txt'
ITERATIONS = 20

# === FEATURE ENGINEERING FUNCTIONS (V22) ===
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

def calculate_studio_feature(df):
    valid_source = df[df['hltbMain'] > 0.1]
    studio_groups = valid_source.groupby('studio')
    studio_avgs = {}
    for studio_name, group in studio_groups:
        if pd.isna(studio_name) or studio_name == '' or studio_name == 'unknown': continue
        records = group[['id', 'hltbMain']].to_dict('records')
        if len(records) < 2: continue
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

def run_optimization():
    print(f"Loading Data from {CSV_PATH}...")
    df = pd.read_csv(CSV_PATH, sep='|', on_bad_lines='skip', low_memory=False)
    
    # Cleaning
    df['hltbMain'] = pd.to_numeric(df['hltbMain'], errors='coerce').fillna(0)
    df['steamReviewCount'] = pd.to_numeric(df['steamReviewCount'], errors='coerce').fillna(0)
    df['log_review_count'] = np.log1p(df['steamReviewCount'])
    df['quality_index'] = df[['opencriticScore', 'igdbScore', 'steamReviewPercent']].mean(axis=1).fillna(70)
    df['log_hypes'] = np.log1p(pd.to_numeric(df['hypes'], errors='coerce').fillna(0))
    
    # Advanced Features
    df = calculate_franchise_feature(df)
    df = calculate_studio_feature(df)
    
    df['title_lower'] = df['title'].str.lower()
    df['all_meta'] = df['genres'].astype(str) + " " + df['keywords'].astype(str) + " " + df['themes'].astype(str)
    df['all_meta'] = df['all_meta'].str.lower()
    
    keywords_dlc = ['dlc', 'expansion', 'pack', 'pass', 'season'] 
    keywords_demo = ['demo', 'prologue', 'teaser']
    df['is_dlc_explicit'] = df['isDlc'].map({'True': 1, 'False': 0, True: 1, False: 0}).fillna(0)
    df['is_dlc_keyword'] = df['title_lower'].apply(lambda x: 1 if any(k in str(x) for k in keywords_dlc) else 0)
    df['is_demo'] = df['title_lower'].apply(lambda x: 1 if any(k in str(x) for k in keywords_demo) else 0)
    df['is_content_expansion'] = df[['is_dlc_explicit', 'is_dlc_keyword', 'is_demo']].max(axis=1)
    
    # Filtering
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
    
    # Sub-Genre Features
    def has(row, kws): return 1 if any(k in row for k in kws) else 0
    df_model['KW_JRPG'] = df_model['all_meta'].apply(lambda x: has(x, ['jrpg', 'japanese rpg', 'anime']))
    df_model['KW_PartyBased'] = df_model['all_meta'].apply(lambda x: has(x, ['party-based', 'party based', 'crpg']))
    df_model['KW_DungeonCrawler'] = df_model['all_meta'].apply(lambda x: has(x, ['dungeon crawler', 'blobber']))
    df_model['KW_Platformer'] = df_model['all_meta'].apply(lambda x: has(x, ['platformer', 'platforming']))
    df_model['KW_3D'] = df_model['all_meta'].apply(lambda x: has(x, ['3d platformer', '3d']))
    df_model['KW_2D'] = df_model['all_meta'].apply(lambda x: has(x, ['2d platformer', '2d', 'side scroller']))
    df_model['KW_Strategy'] = df_model['all_meta'].apply(lambda x: has(x, ['strategy', 'tactical', 'rts']))
    df_model['KW_4X'] = df_model['all_meta'].apply(lambda x: has(x, ['4x', 'grand strategy']))
    df_model['KW_TurnBased'] = df_model['all_meta'].apply(lambda x: has(x, ['turn-based', 'tbs']))
    df_model['KW_Management'] = df_model['all_meta'].apply(lambda x: has(x, ['management', 'base building', 'farming', 'crafting']))
    df_model['KW_SideContent'] = df_model['all_meta'].apply(lambda x: has(x, ['side quests', 'exploration', 'open world', 'collectibles']))
    df_model['is_rpg'] = df_model['all_meta'].apply(lambda x: 1 if 'rpg' in x else 0)
    
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
    features_cat = ['studio']

    X = df_model[features_num + features_cat]
    y = df_model['hltbMain']
    
    df_model['sample_weight'] = 1.0
    df_model.loc[df_model['KW_JRPG'] == 1, 'sample_weight'] *= 2.0
    df_model.loc[df_model['INT_3D_Platformer'] == 1, 'sample_weight'] *= 2.0
    df_model.loc[df_model['KW_SideContent'] == 1, 'sample_weight'] *= 1.5
    w = df_model['sample_weight']
    
    X_train, X_test, y_train, y_test, w_train, w_test = train_test_split(X, y, w, test_size=0.1, random_state=42)
    
    # === OPTIMIZATION ===
    preprocessor = ColumnTransformer([
        ('num', 'passthrough', features_num),
        ('cat', OneHotEncoder(handle_unknown='ignore', max_categories=100, sparse_output=False), features_cat)
    ])
    
    pipeline = Pipeline([
        ('preprocessor', preprocessor),
        ('regressor', HistGradientBoostingRegressor(loss='absolute_error', random_state=42))
    ])
    
    param_dist = {
        'regressor__learning_rate': [0.01, 0.02, 0.05, 0.1],
        'regressor__max_iter': [200, 300, 500, 800],
        'regressor__max_leaf_nodes': [31, 50, 80, 100],
        'regressor__min_samples_leaf': [10, 20, 30],
        'regressor__l2_regularization': [0.0, 0.1, 0.5, 1.0]
    }
    
    print(f"Starting Randomized Search ({ITERATIONS} iterations)...")
    search = RandomizedSearchCV(
        pipeline, 
        param_distributions=param_dist,
        n_iter=ITERATIONS,
        scoring='neg_mean_absolute_error', 
        cv=3, 
        verbose=1,
        random_state=42,
        n_jobs=-1
    )
    
    search.fit(X_train, y_train, regressor__sample_weight=w_train)
    
    best_model = search.best_estimator_
    best_params = search.best_params_
    
    print("\nBest Parameters found:")
    print(best_params)
    
    # Evaluate
    preds_test = best_model.predict(X_test)
    mae = mean_absolute_error(y_test, preds_test)
    
    # Custom Precision
    df_eval = df_model.loc[y_test.index].copy()
    df_eval['Predicted'] = preds_test
    def calc_precision(d):
        d_valid = d[d['hltbMain'] > 1.0]
        if d_valid.empty: return 0.0
        mape = np.mean(np.abs((d_valid['hltbMain'] - d_valid['Predicted']) / d_valid['hltbMain']))
        return max(0, 100 * (1 - mape))
    
    prec = calc_precision(df_eval)
    
    with open(REPORT_PATH, 'w', encoding='utf-8') as f:
        f.write(f"=== V23 OPTIMIZATION REPORT ({ITERATIONS} Iterations) ===\n")
        f.write(f"Best Params: {best_params}\n\n")
        f.write(f"Test MAE: {mae:.2f}h\n")
        f.write(f"Test Precision: {prec:.2f}%\n")
        
    print(f"Done. Report: {REPORT_PATH}")

if __name__ == "__main__":
    run_optimization()
