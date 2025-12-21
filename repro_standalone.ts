
import getColors from 'get-image-colors';
import axios from 'axios';

async function extractDominantColors(imageUrl: string | null) {
    if (!imageUrl) {
        return { primary: null, secondary: null };
    }

    try {
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const buffer = Buffer.from(response.data);
        const contentType = response.headers['content-type'] || 'image/jpeg';

        const colors = await getColors(buffer, contentType);

        if (colors && colors.length > 0) {
            return {
                primary: colors[0].hex(),
                secondary: colors.length > 1 ? colors[1].hex() : null
            };
        }

        return { primary: null, secondary: null };
    } catch (e) {
        console.error("Error extraction:", e);
        return { primary: null, secondary: null };
    }
}

async function test() {
    console.log("Testing color extraction...");
    const url = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7x.jpg";
    console.log(`URL: ${url}`);
    const colors = await extractDominantColors(url);
    console.log("Colors:", colors);
}

test();
