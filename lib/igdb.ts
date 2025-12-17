
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_ACCESS_TOKEN = process.env.IGDB_ACCESS_TOKEN;

export interface IgdbGame {
  id: number;
  name: string;
  cover?: {
    image_id: string;
  };
  screenshots?: {
    image_id: string;
  }[];
  artworks?: {
    image_id: string;
  }[];
  first_release_date?: number;
}

export async function searchIgdbGames(query: string): Promise<IgdbGame[]> {
  if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN) {
    console.warn('IGDB credentials missing');
    return [];
  }

  try {
    const response = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: {
        'Client-ID': IGDB_CLIENT_ID,
        'Authorization': `Bearer ${IGDB_ACCESS_TOKEN}`,
        'Content-Type': 'text/plain', // IGDB expects raw body
      },
      body: `search "${query}"; fields name, cover.image_id, screenshots.image_id, artworks.image_id, first_release_date; limit 10;`,
    });

    if (!response.ok) {
        // Handle token expiration if needed, but for now just log
        console.error("IGDB Error", response.status, response.statusText);
        return [];
    }

    return await response.json();
  } catch (error) {
    console.error('Error searching IGDB:', error);
    return [];
  }
}

export function getIgdbImageUrl(imageId: string, size: 'cover_big' | 'screenshot_huge' | '1080p' = 'cover_big'): string {
    return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
}
