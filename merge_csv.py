import pandas as pd
import json
import re
from datetime import datetime

# --- CONFIGURATION ---
INPUT_STEAM = 'Steam_data.csv'
INPUT_OPENCRITIC = 'Opencritic_data.csv'
INPUT_HLTB = 'hltb_dataset.csv'
OUTPUT_FILE = 'games_seed_supabase.csv'

# --- UTILS ---

def parse_date(date_str):
    """Convertit DD/MM/YYYY ou YYYY-MM-DD en ISO 8601 DateTime"""
    if pd.isna(date_str) or date_str == '':
        return None
    
    # Formats possibles vus dans tes données
    formats = ['%d/%m/%Y', '%Y-%m-%d']
    
    for fmt in formats:
        try:
            dt = datetime.strptime(str(date_str), fmt)
            return dt.isoformat() + "Z" # Format attendu par Prisma/Postgres souvent
        except ValueError:
            continue
    return None

def hours_to_minutes(hours_str):
    """Convertit '10.5' (heures) en minutes (entier)"""
    try:
        return int(float(hours_str) * 60)
    except (ValueError, TypeError):
        return None

def clean_name(name):
    """Normalise le nom pour le matching (minuscule, sans caractères spéciaux)"""
    if pd.isna(name): return ""
    return re.sub(r'[^a-z0-9]', '', str(name).lower())

def extract_steam_id(url):
    """Extrait l'ID de l'URL Steam"""
    if pd.isna(url): return None
    match = re.search(r'/app/(\d+)/', str(url))
    return match.group(1) if match else None

def list_to_json(item_str):
    """Convertit 'Action, RPG' en chaîne JSON '["Action", "RPG"]'"""
    if pd.isna(item_str) or item_str == '':
        return json.dumps([])
    # Sépare par virgule, strip les espaces
    items = [x.strip() for x in str(item_str).split(',')]
    return json.dumps(items)

def platform_to_json(platform_str):
    """
    Transforme la liste plate de plateformes en format JSON attendu par ton schema
    Structure Prisma: [{ name: "Switch", date: null }] (date inconnue ici)
    """
    if pd.isna(platform_str) or platform_str == '':
        return json.dumps([])
    
    platforms = [x.strip() for x in str(platform_str).split(',')]
    # On formatte comme ton schema le suggère (objet simple ou string selon besoin)
    # Ici on fait simple: liste de strings convertie en JSON, ou structure complexe si besoin.
    # Ton schema dit: `platforms Json? // Structure: [{ name: "Switch", date: "..." }]`
    
    json_obj = [{"name": p, "date": None} for p in platforms]
    return json.dumps(json_obj)

# --- EXECUTION ---

print("Chargement des données...")
df_steam = pd.read_csv(INPUT_STEAM)
df_oc = pd.read_csv(INPUT_OPENCRITIC)
df_hltb = pd.read_csv(INPUT_HLTB)

# 1. Fusion Steam + OpenCritic sur 'ID'
print("Fusion Steam + OpenCritic...")
# On utilise un outer join pour garder les jeux qui ne seraient que sur l'un ou l'autre (si ça arrive)
# Mais selon tes données, ID semble être la clé commune.
df_main = pd.merge(df_steam, df_oc, on='ID', how='outer', suffixes=('_steam', '_oc'))

# Priorité sur le titre: OpenCriticTitle semble plus propre, sinon SteamTitle
df_main['FinalTitle'] = df_main['OpenCriticTitle_oc'].combine_first(df_main['SteamTitle'])
df_main['CleanName'] = df_main['FinalTitle'].apply(clean_name)

# 2. Préparation HLTB pour la fusion
print("Préparation HLTB...")
df_hltb['CleanName'] = df_hltb['name'].apply(clean_name)
# On garde les colonnes pertinentes de HLTB
cols_hltb = ['CleanName', 'main_story', 'main_plus_sides', 'completionist', 'release_year']
df_hltb_clean = df_hltb[cols_hltb].drop_duplicates(subset=['CleanName'])

# 3. Fusion avec HLTB sur le Nom (Matching Fuzzy/Exact)
print("Fusion HLTB (Matching par nom)...")
df_final = pd.merge(df_main, df_hltb_clean, on='CleanName', how='left')

# --- MAPPING VERS PRISMA ---
print("Transformation des données vers le format Prisma...")

output = pd.DataFrame()

# ID & Info de base
output['id'] = df_final['ID'].astype(str) # On garde l'ID commun comme ID Prisma
output['title'] = df_final['FinalTitle']
output['steamUrl'] = df_final['SteamURL']
output['steamAppId'] = df_final['SteamURL'].apply(extract_steam_id)

# Descriptions & Media
output['description'] = None # Pas de desc dans tes CSV, faudra peut-être fetcher plus tard
output['coverImage'] = None # Pas d'image directe, on pourra construire via SteamAppId plus tard
output['backgroundImage'] = None

# Dates
# On prend la date Steam en priorité ou celle d'OpenCritic
output['releaseDate'] = df_final['SteamReleaseDate'].combine_first(df_final['Date'])
output['releaseDate'] = output['releaseDate'].apply(parse_date)

# Scores (Nouveaux champs & existants)
output['steamReviewScore'] = df_final['SteamReviewsRating']
output['steamReviewCount'] = pd.to_numeric(df_final['SteamReviewsNum'], errors='coerce').fillna(0).astype(int)
output['steamReviewPercent'] = pd.to_numeric(df_final['SteamReviewsPercent'], errors='coerce').fillna(0).astype(int)
output['opencriticScore'] = pd.to_numeric(df_final['CriticScore'], errors='coerce').astype('Int64') # Int nullable

# Is DLC
output['isDlc'] = df_final['SteamDLC'].fillna(False).astype(bool)

# Metadata (Genres, Studios, Platforms)
# On combine les dev/pub
output['studio'] = df_final['SteamDeveloper(s)'].combine_first(df_final['Developers/Publishers'])
output['genres'] = df_final['SteamTags'].combine_first(df_final['Genres']).apply(list_to_json)
output['platforms'] = df_final['Platforms'].apply(platform_to_json)

# Playtime (HLTB) -> Conversion en minutes
output['hltbMain'] = df_final['main_story'].apply(hours_to_minutes).astype('Int64')
output['hltbExtra'] = df_final['main_plus_sides'].apply(hours_to_minutes).astype('Int64')
output['hltbCompletionist'] = df_final['completionist'].apply(hours_to_minutes).astype('Int64')

# Flags techniques
output['dataFetched'] = True
output['dataMissing'] = False
output['updatedAt'] = datetime.utcnow().isoformat() + "Z"

# --- EXPORT ---
print(f"Exportation de {len(output)} jeux vers {OUTPUT_FILE}...")

# Remplacement des NaN par des vides pour le CSV (ou NULL pour SQL)
# Supabase préfère souvent NULL pour les champs vides, pandas met NaN. 
# On va laisser Pandas gérer, mais attention aux string "NaN".
output.to_csv(OUTPUT_FILE, index=False, encoding='utf-8')

print("Terminé ! Le fichier est prêt pour l'import Supabase.")
print("Note : Vérifie que les noms de colonnes du CSV correspondent EXACTEMENT aux noms de champs Prisma.")