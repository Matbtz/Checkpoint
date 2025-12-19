
interface OpenCriticSearchResult {
    id: number;
    name: string;
    dist: number;
}

interface OpenCriticGameDetails {
    id: number;
    name: string;
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
  const timeoutId = setTimeout(() => controller.abort(), 6000); // Increased timeout for 2 calls

  try {
    // 1. Search for the game ID
    const searchUrl = `https://opencritic-api.p.rapidapi.com/game/search?criteria=${encodeURIComponent(gameTitle)}`;

    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': 'opencritic-api.p.rapidapi.com'
      },
      cache: 'no-store',
      signal: controller.signal
    });

    if (searchResponse.status === 429) {
        console.warn('OpenCritic API Rate Limit Exceeded (429) during search.');
        clearTimeout(timeoutId);
        return null;
    }

    if (!searchResponse.ok) {
      console.error(`OpenCritic Search API error: ${searchResponse.status} ${searchResponse.statusText}`);
      clearTimeout(timeoutId);
      return null;
    }

    const searchData = await searchResponse.json() as OpenCriticSearchResult[];

    if (!Array.isArray(searchData) || searchData.length === 0) {
      clearTimeout(timeoutId);
      return null;
    }

    const firstResult = searchData[0];

    // Similarity check
    const normalizedQuery = gameTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedResult = firstResult.name.toLowerCase().replace(/[^a-z0-9]/g, '');

    if (!normalizedResult.includes(normalizedQuery) && !normalizedQuery.includes(normalizedResult)) {
        console.warn(`OpenCritic Mismatch: Searched "${gameTitle}" (norm: ${normalizedQuery}), found "${firstResult.name}" (norm: ${normalizedResult}). Rejecting.`);
        clearTimeout(timeoutId);
        return null;
    }

    // 2. Fetch game details using the ID
    const detailsUrl = `https://opencritic-api.p.rapidapi.com/game/${firstResult.id}`;

    const detailsResponse = await fetch(detailsUrl, {
        method: 'GET',
        headers: {
            'X-RapidAPI-Key': rapidApiKey,
            'X-RapidAPI-Host': 'opencritic-api.p.rapidapi.com'
        },
        cache: 'no-store',
        signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (detailsResponse.status === 429) {
         console.warn('OpenCritic API Rate Limit Exceeded (429) during details fetch.');
         return null;
    }

    if (!detailsResponse.ok) {
        console.error(`OpenCritic Details API error: ${detailsResponse.status} ${detailsResponse.statusText}`);
        return null;
    }

    const detailsData = await detailsResponse.json() as OpenCriticGameDetails;

    console.log(`OpenCritic Match: Searched "${gameTitle}" -> Found "${detailsData.name}" (Score: ${detailsData.topCriticScore})`);

    if (typeof detailsData.topCriticScore === 'number') {
        return Math.round(detailsData.topCriticScore);
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
