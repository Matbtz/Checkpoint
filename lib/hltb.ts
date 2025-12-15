interface HltbResult {
  id: string;
  name: string;
  gameplayMain: number;
  gameplayMainExtra: number;
  gameplayCompletionist: number;
}

interface HltbRawItem {
  game_id: number;
  game_name: string;
  comp_main: number;
  comp_plus: number;
  comp_100: number;
  [key: string]: unknown;
}

export async function searchHowLongToBeat(gameTitle: string): Promise<HltbResult[]> {
  try {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://howlongtobeat.com/',
        'Origin': 'https://howlongtobeat.com',
        'Content-Type': 'application/json'
    };

    const searchUrl = 'https://howlongtobeat.com/api/search';

    const payload = {
        "searchType": "games",
        "searchTerms": [gameTitle],
        "searchPage": 1,
        "size": 20,
        "searchOptions": {
            "games": {
                "userId": 0,
                "platform": "",
                "sortCategory": "popular",
                "rangeCategory": "main",
                "rangeTime": { "min": null, "max": null },
                "gameplay": { "perspective": "", "flow": "", "genre": "" },
                "rangeYear": { "min": "", "max": "" },
                "modifier": ""
            }
        }
    };

    const response = await fetch(searchUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
         console.error(`HLTB API Error: ${response.status} ${response.statusText}`);
         return [];
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
        return [];
    }

    // Map the results
    return data.data.map((game: HltbRawItem) => ({
        id: game.game_id.toString(),
        name: game.game_name,
        // Converting seconds to hours to match application expectation (format-utils expects hours)
        gameplayMain: Math.round((game.comp_main / 3600) * 10) / 10,
        gameplayMainExtra: Math.round((game.comp_plus / 3600) * 10) / 10,
        gameplayCompletionist: Math.round((game.comp_100 / 3600) * 10) / 10
    }));

  } catch (error) {
    console.error("Error scraping HLTB:", error);
    return [];
  }
}
