
import { load } from 'cheerio';

export interface SteamStoreGame {
    id: number;
    name: string;
    header_image: string;
    library_cover: string;
    library_hero: string;
    screenshots: string[];
    releaseYear: number | null;
}

export async function searchSteamStore(query: string): Promise<SteamStoreGame[]> {
    try {
        const url = `https://store.steampowered.com/search/?term=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
             headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) return [];

        const html = await response.text();
        const $ = load(html);
        const results: SteamStoreGame[] = [];

        $('#search_resultsRows a.search_result_row').each((i, el) => {
            if (i >= 5) return false; // Limit to 5

            const link = $(el).attr('href') || '';
            const idMatch = link.match(/\/app\/(\d+)/);
            if (!idMatch) return;

            const id = parseInt(idMatch[1]);
            const name = $(el).find('.title').text().trim();
            const dateStr = $(el).find('.search_released').text().trim();

            let releaseYear: number | null = null;
            if (dateStr) {
                // Steam dates format varies (e.g. "20 Oct, 2023", "Oct 2023", "2023")
                // Extract 4 digit year
                const yearMatch = dateStr.match(/\b(19|20)\d{2}\b/);
                if (yearMatch) {
                    releaseYear = parseInt(yearMatch[0]);
                }
            }

            results.push({
                id,
                name,
                header_image: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/header.jpg`,
                library_cover: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/library_600x900.jpg`,
                library_hero: `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${id}/library_hero.jpg`,
                screenshots: [], // Search results don't give screenshots easily without extra requests
                releaseYear
            });
        });

        return results;
    } catch (e) {
        console.error("Steam Store Search Error:", e);
        return [];
    }
}
