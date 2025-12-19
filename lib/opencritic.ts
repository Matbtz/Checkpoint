
interface OpenCriticResult {
    id: number;
    name: string;
    url: string;
    firstReleaseDate: string;
    topCriticScore: number;
    tier: string;
    percentRecommended: number;
}

export async function getOpenCriticScore(gameTitle: string): Promise<number | null> {
  const rapidApiKey = process.env.RAPIDAPI_KEY;

  if (!rapidApiKey) {
    console.error('RAPIDAPI_KEY is missing');
    return null;
  }

  // Timeout logic to prevent blocking
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

  try {
    const url = `https://opencritic-api.p.rapidapi.com/game/search?criteria=${encodeURIComponent(gameTitle)}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': 'opencritic-api.p.rapidapi.com'
      },
      cache: 'no-store',
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Strict error handling for 429 or other errors
    if (response.status === 429) {
        console.warn('OpenCritic API Rate Limit Exceeded (429). returning null.');
        return null;
    }

    if (!response.ok) {
      console.error(`OpenCritic API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json() as OpenCriticResult[];

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const firstResult = data[0];

    // Similarity check: ensure the game title is at least vaguely contained or related
    const normalizedQuery = gameTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedResult = firstResult.name.toLowerCase().replace(/[^a-z0-9]/g, '');

    // Allow if one is contained in the other
    if (!normalizedResult.includes(normalizedQuery) && !normalizedQuery.includes(normalizedResult)) {
        // Fallback: Check for Levenshtein distance or simple word overlap could be better,
        // but for now we'll log and allow if it's very close? No, stick to containment but maybe log more details.
        // Actually, sometimes title has ": The Game" vs just "The Game".
        // Let's relax it slightly: if the first 4 chars match (ignoring "the"), it's likely the same franchise.
        // But for safety, we'll keep the rejection but log it clearly.
        console.warn(`OpenCritic Mismatch: Searched "${gameTitle}" (norm: ${normalizedQuery}), found "${firstResult.name}" (norm: ${normalizedResult}). Rejecting.`);
        return null;
    } else {
        console.log(`OpenCritic Match: Searched "${gameTitle}" -> Found "${firstResult.name}" (Score: ${firstResult.topCriticScore})`);
    }

    if (typeof firstResult.topCriticScore === 'number') {
        return Math.round(firstResult.topCriticScore);
    }

    return null;

  } catch (error: unknown) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
         console.warn(`OpenCritic API timed out for game: ${gameTitle}`);
         return null;
    }
    console.error('Error fetching OpenCritic score:', error);
    return null;
  }
}
