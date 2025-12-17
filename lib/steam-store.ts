
import * as cheerio from 'cheerio';

export interface SteamStoreGame {
    id: number;
    name: string;
    imageUrl: string;
    price?: string;
}

export async function searchSteamStore(query: string): Promise<SteamStoreGame[]> {
    try {
        const url = `https://store.steampowered.com/search/?term=${encodeURIComponent(query)}`;
        const response = await fetch(url);
        if (!response.ok) return [];

        const html = await response.text();
        const $ = cheerio.load(html);
        const results: SteamStoreGame[] = [];

        $('#search_resultsRows a').each((_, element) => {
            const $el = $(element);
            const id = $el.attr('data-ds-appid');
            const name = $el.find('.title').text();
            const imageUrl = $el.find('.search_capsule img').attr('src');

            if (id && name && imageUrl) {
                results.push({
                    id: parseInt(id),
                    name: name,
                    imageUrl: imageUrl
                });
            }
        });

        return results.slice(0, 5); // Limit to top 5
    } catch (e) {
        console.error("Steam Store Search Error:", e);
        return [];
    }
}
