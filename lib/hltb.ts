export async function searchHowLongToBeat(gameTitle: string) {
  try {
    const response = await fetch('https://howlongtobeat.com/api/search', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
        'Referer': 'https://howlongtobeat.com/',
        'Origin': 'https://howlongtobeat.com',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        searchType: "games",
        searchTerms: [gameTitle],
        searchPage: 1,
        size: 5,
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
          }
        }
      })
    });

    if (!response.ok) throw new Error(`HLTB blocked: ${response.status}`);

    const data = await response.json();
    if (!data.data || data.data.length === 0) return null;

    const bestMatch = data.data[0];

    // Conversion secondes -> minutes (HLTB renvoie parfois des secondes)
    const convert = (val: number) => Math.round(val / 60);

    return {
      main: convert(bestMatch.comp_main),       // Main Story
      extra: convert(bestMatch.comp_plus),      // Main + Extra
      completionist: convert(bestMatch.comp_100) // Completionist
    };
  } catch (error) {
    console.error("HLTB Fetch Error:", error);
    return null; // Retourne null pour ne pas faire planter RAWG
  }
}
