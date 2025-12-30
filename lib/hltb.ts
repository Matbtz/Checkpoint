import { HowLongToBeatEntry } from 'howlongtobeat';

// Helper: Levenshtein Distance
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

    if (bestMatch.dist > 5 || (bestMatch.dist > 2 && bestMatch.dist > normalizedTarget.length * 0.2)) {
         console.warn(`[HLTB] Rejected match: "${bestMatch.result.name}" for query "${gameTitle}" (Dist: ${bestMatch.dist})`);
         return null;
    }

    return bestMatch.result;
}

export async function searchHowLongToBeat(gameTitle: string): Promise<{ main: number; extra: number; completionist: number } | null> {
  try {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
    const referer = 'https://howlongtobeat.com/';
    const origin = 'https://howlongtobeat.com';

    // 1. Get Token and Cookies
    const initUrl = `https://howlongtobeat.com/api/search/init?t=${Date.now()}`;
    const initResponse = await fetch(initUrl, {
      method: 'GET',
      headers: {
        'User-Agent': ua,
        'Referer': referer,
        'Origin': origin
      }
    });

    if (!initResponse.ok) {
      // Gracefully handle init failure (e.g. 404/403)
      console.warn(`HLTB Init failed with status: ${initResponse.status}`);
      return null;
    }

    const initData = await initResponse.json();
    const token = initData.token;

    // Extract and parse cookies properly
    const cookieHeader = initResponse.headers.get('set-cookie');
    let cookies = '';
    if (cookieHeader) {
       // set-cookie can be a comma-separated string of multiple cookies
       // We need to parse each cookie string (e.g. "name=val; Path=/; HttpOnly") and keep only "name=val"
       // Node's fetch usually returns a combined string if multiple headers exist.
       // We split by comma (carefully, as comma is also in Date format, but usually safe for simple split here if careful)
       // Actually, naive splitting by comma might break Expires dates.
       // But for HLTB session cookies, they usually don't have complicated dates.
       // Better approach: Extract parts before the first semicolon of each segment.
       // However, `headers.get` might join with `, `.
       // Let's rely on a simpler regex to extract `name=value`.
       // We match anything that looks like `key=value` at the start of a cookie string.
       // Or simply: pass the whole thing if the server is lenient.
       // But to be "Clean", let's try to pass `key=value`.
       // Since implementing a full cookie jar is overkill, we'll try to just forward the raw header if it's simpler,
       // but `Cookie` header expects semicolon separation, while `Set-Cookie` (multiple) comes as array or comma-joined.
       // Let's assume standard formatting.
       cookies = cookieHeader.split(/,(?=\s*[a-zA-Z0-9_-]+=)/).map(c => c.split(';')[0].trim()).join('; ');
    }

    if (!token) {
      console.warn("HLTB Token not found in init response");
      return null;
    }

    // 2. Search
    const searchUrl = 'https://howlongtobeat.com/api/search';
    const searchPayload = {
      searchType: "games",
      searchTerms: gameTitle.split(' '), // Split terms as per JS logic
      searchPage: 1,
      size: 20,
      searchOptions: {
        games: {
          userId: 0,
          platform: "",
          sortCategory: "popular",
          rangeCategory: "main",
          rangeTime: { min: null, max: null },
          gameplay: { perspective: "", flow: "", genre: "" },
          rangeYear: { min: "", max: "" },
          modifier: ""
        },
        users: { sortCategory: "postcount" },
        lists: { sortCategory: "follows" },
        filter: "",
        sort: 0,
        randomizer: 0
      },
      useCache: true
    };

    const headers: any = {
        'User-Agent': ua,
        'Referer': referer,
        'Origin': origin,
        'Content-Type': 'application/json',
        'x-auth-token': token
    };

    if (cookies) {
        headers['Cookie'] = cookies;
    }

    const searchResponse = await fetch(searchUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(searchPayload)
    });

    if (!searchResponse.ok) {
      // 404 is common if the endpoint is strictly blocked or rotated.
      console.warn(`HLTB Search failed: ${searchResponse.status}`);
      return null;
    }

    const data = await searchResponse.json();
    const entries: HowLongToBeatEntry[] = (data.data || []).map((item: any) => ({
        id: item.game_id,
        name: item.game_name,
        description: "",
        platforms: item.profile_platform ? item.profile_platform.split(", ") : [],
        imageUrl: `https://howlongtobeat.com/games/${item.game_image}`,
        timeLabels: [],
        gameplayMain: item.comp_main,  // Seconds
        gameplayMainExtra: item.comp_plus,
        gameplayCompletionist: item.comp_100,
        similarity: 0,
        searchTerm: gameTitle
    }));

    const bestMatch = selectBestMatch(entries, gameTitle);
    if (!bestMatch) return null;

    // Return Minutes
    return {
      main: Math.round(bestMatch.gameplayMain / 60),
      extra: Math.round(bestMatch.gameplayMainExtra / 60),
      completionist: Math.round(bestMatch.gameplayCompletionist / 60)
    };
  } catch (error) {
    console.error("HLTB Search Error:", error);
    return null;
  }
}
