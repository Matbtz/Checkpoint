import { HowLongToBeatService, HowLongToBeatEntry } from 'howlongtobeat';

/**
 * Calculates the Levenshtein distance between two strings.
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export function selectBestMatch(results: HowLongToBeatEntry[], gameTitle: string): HowLongToBeatEntry | null {
    if (!results || results.length === 0) return null;

    const normalizedTarget = gameTitle.toLowerCase().trim();

    const bestMatch = results
      .map((result) => {
        const dist = levenshteinDistance(result.name.toLowerCase().trim(), normalizedTarget);
        return { result, dist };
      })
      .sort((a, b) => a.dist - b.dist)[0];

    if (!bestMatch) return null;

    // Reject if distance is too high.
    // We allow small errors (<=2) regardless of length to handle minor typos or formatting differences.
    // For larger discrepancies, we enforce the 20% length threshold.
    // Hard limit at distance > 5 (completely different).
    if (bestMatch.dist > 5 || (bestMatch.dist > 2 && bestMatch.dist > normalizedTarget.length * 0.2)) {
         console.warn(`[HLTB] Rejected match: "${bestMatch.result.name}" for query "${gameTitle}" (Dist: ${bestMatch.dist})`);
         return null;
    }

    return bestMatch.result;
}

export async function searchHowLongToBeat(gameTitle: string): Promise<{ main: number; extra: number; completionist: number } | null> {
  try {
    const hltbService = new HowLongToBeatService();
    const results = await hltbService.search(gameTitle);

    const bestMatch = selectBestMatch(results, gameTitle);
    if (!bestMatch) return null;

    return {
      main: Math.round(bestMatch.gameplayMain * 60),
      extra: Math.round(bestMatch.gameplayMainExtra * 60),
      completionist: Math.round(bestMatch.gameplayCompletionist * 60)
    };
  } catch (error) {
    console.error("HLTB Search Error:", error);
    return null;
  }
}
