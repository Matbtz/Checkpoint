
import pandas as pd
import numpy as np
import json
import os

PRED_PATH = 'scripts/Data_science/predictions_v9.csv'
DATA_PATH = 'scripts/csv/enriched_clean_dataset.csv'
REPORT_PATH = 'scripts/Data_science/detailed_analysis_v9.md'

def parse_list_safe(x):
    try:
        if pd.isna(x): return []
        cleaned = str(x).replace('""', '"')
        if cleaned.startswith('['):
            try:
                return json.loads(cleaned)
            except:
                pass
        return [s.strip() for s in str(x).split(',') if s.strip()]
    except: 
        return []

def run_analysis():
    print("Loading Data for Analysis...")
    df_pred = pd.read_csv(PRED_PATH)
    df_data = pd.read_csv(DATA_PATH, sep='|', on_bad_lines='skip', low_memory=False)
    
    # Merge genres from data to pred
    # Make sure IDs match type
    df_pred['id'] = df_pred['id'].astype(str)
    df_data['id'] = df_data['id'].astype(str)
    
    df = pd.merge(df_pred, df_data[['id', 'genres', 'isDlc']], on='id', how='left')
    
    df = df.dropna(subset=['hltbMain'])
    df = df[df['hltbMain'] > 0.1].copy() # Filter < 6 minutes (likely noise or missing)
    
    # Already in HOURS
    df['Actual_H'] = df['hltbMain']
    df['Pred_H'] = df['predicted_main']
    
    df['Error'] = df['Pred_H'] - df['Actual_H']
    df['Abs_Error'] = df['Error'].abs()
    df['APE'] = (df['Abs_Error'] / df['Actual_H']) * 100.0 # Percentage Error
    
    # Global Metrics
    mae = df['Abs_Error'].mean()
    median_ae = df['Abs_Error'].median()
    rmse = np.sqrt((df['Error'] ** 2).mean())
    mape = df['APE'].median() # Median APE is often more robust than Mean APE which explodes on small denominators
    
    with open(REPORT_PATH, 'w', encoding='utf-8') as f:
        f.write("# Detailed Predictive Model Analysis (V9)\n\n")
        
        f.write("## 1. Global Performance metrics\n")
        f.write("| Metric | Value |\n|---|---|\n")
        f.write(f"| **MAE** (Mean Absolute Error) | **{mae:.2f} hours** |\n")
        f.write(f"| **Median AE** | **{median_ae:.2f} hours** |\n")
        f.write(f"| **RMSE** (Root Mean Sq Error) | {rmse:.2f} hours |\n")
        f.write(f"| **MAPE** (Median % Error) | {mape:.1f}% |\n")
        f.write(f"| **Sample Size** | {len(df)} games |\n\n")
        
        # 2. Genre Breakdown
        f.write("## 2. Performance by Genre\n")
        f.write("*Note: Games can belong to multiple genres.*\n\n")
        f.write("| Genre | Count | MAE (Hours) | Median % Error | Bias (Mean Error) |\n")
        f.write("|---|---|---|---|---|\n")
        
        # Explode Genress
        df['genres_list'] = df['genres'].apply(parse_list_safe)
        
        # Collect all unique genres
        all_genres = set()
        for gl in df['genres_list']:
            for g in gl:
                all_genres.add(g)
        
        genre_stats = []
        
        for g in sorted(all_genres):
            # Mask for this genre
            mask = df['genres_list'].apply(lambda x: g in x)
            subset = df[mask]
            
            if len(subset) < 10: continue # Skip tiny samples
            
            g_mae = subset['Abs_Error'].mean()
            g_mape = subset['APE'].median()
            g_bias = subset['Error'].mean() # Positive = Overestimation, Negative = Underestimation
            
            genre_stats.append({
                'Genre': g,
                'Count': len(subset),
                'MAE': g_mae,
                'MAPE': g_mape,
                'Bias': g_bias
            })
            
        # Sort by MAE (Best to Worst accuracy)
        genre_stats.sort(key=lambda x: x['MAE'])
        
        for s in genre_stats:
            f.write(f"| {s['Genre']} | {s['Count']} | {s['MAE']:.2f}h | {s['MAPE']:.1f}% | {s['Bias']:.2f}h |\n")
            
        f.write("\n")
        
        # 3. Accuracy Tiers
        f.write("## 3. Accuracy Distribution\n")
        f.write("How many games fall within specific error ranges?\n\n")
        
        within_30m = (df['Abs_Error'] <= 0.5).sum()
        within_1h = (df['Abs_Error'] <= 1.0).sum()
        within_20p = (df['APE'] <= 20).sum()
        
        f.write(f"- **Perfect (<30 min error)**: {within_30m} games ({within_30m/len(df)*100:.1f}%)\n")
        f.write(f"- **Great (<1 hour error)**: {within_1h} games ({within_1h/len(df)*100:.1f}%)\n")
        f.write(f"- **Solid (<20% error)**: {within_20p} games ({within_20p/len(df)*100:.1f}%)\n\n")
        
        # 4. Outlier Analysis
        f.write("## 4. Problematic Outliers\n")
        
        f.write("### Top 10 Worst Overestimates (Model says Long, Reality is Short)\n")
        f.write("| Title | Predicted | Actual | Error |\n|---|---|---|---|\n")
        over = df.sort_values(by='Error', ascending=False).head(10)
        for _, r in over.iterrows():
            f.write(f"| {r['title']} | {r['Pred_H']:.1f}h | {r['Actual_H']:.1f}h | +{r['Error']:.1f}h |\n")
            
        f.write("\n### Top 10 Worst Underestimates (Model says Short, Reality is Long)\n")
        f.write("| Title | Predicted | Actual | Error |\n|---|---|---|---|\n")
        under = df.sort_values(by='Error', ascending=True).head(10)
        for _, r in under.iterrows():
            f.write(f"| {r['title']} | {r['Pred_H']:.1f}h | {r['Actual_H']:.1f}h | {r['Error']:.1f}h |\n")
            
        # 5. Recommendation
        f.write("\n## 5. Insight & Recommendations\n")
        f.write("Based on the data above:\n")
        f.write("- **Best Genres**: Look for low MAE. These are where the model is highly confident.\n")
        f.write("- **Worst Genres**: Look for high MAE/Bias. These usually need specific interaction features (like Simulators or MMOs).\n")
        f.write("- **Bias**: If Bias is negative, we consistently underestimate this genre (needs 'Mega-Game' flag). If positive, we overestimate (maybe confusing DLCs for Main games).\n")

    print(f"Detailed report generated: {REPORT_PATH}")

if __name__ == "__main__":
    run_analysis()
