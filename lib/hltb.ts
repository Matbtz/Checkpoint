import * as cheerio from 'cheerio';

interface HltbResult {
  id: string;
  name: string;
  gameplayMain: number;
  gameplayMainExtra: number;
  gameplayCompletionist: number;
}

export async function searchHowLongToBeat(gameTitle: string): Promise<HltbResult[]> {
  try {
    // Standard User-Agent to bypass simple anti-bot checks
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Referer': 'https://howlongtobeat.com/',
        'Origin': 'https://howlongtobeat.com'
    };

    const searchUrl = 'https://howlongtobeat.com/api/search';

    // Payload structure typically observed for HLTB
    const payload = {
        "searchType": "games",
        "searchTerms": gameTitle.split(" "),
        "searchPage": 1,
        "size": 20,
        "searchOptions": {
            "games": {
                "userId": 0,
                "platform": "",
                "sortCategory": "popular",
                "rangeCategory": "main",
                "rangeTime": { "min": 0, "max": null },
                "gameplay": { "perspective": "", "flow": "", "genre": "" },
                "modifier": ""
            },
            "users": { "sortCategory": "postcount" },
            "filter": "",
            "sort": 0,
            "randomizer": 0
        }
    };

    const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': 'application/json',
        },
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
    return data.data.map((game: any) => ({
        id: game.game_id.toString(),
        name: game.game_name,
        // HLTB API returns SECONDS (e.g. 37800 for 10.5h).
        // Our App expects HOURS (e.g. 10.5).
        // 37800 / 3600 = 10.5

        gameplayMain: Math.round((game.comp_main / 3600) * 10) / 10,
        gameplayMainExtra: Math.round((game.comp_plus / 3600) * 10) / 10,
        gameplayCompletionist: Math.round((game.comp_100 / 3600) * 10) / 10
    }));

  } catch (error) {
    console.error("Error scraping HLTB:", error);
    return [];
  }
}
