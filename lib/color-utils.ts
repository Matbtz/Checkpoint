import getColors from 'get-image-colors';
import axios from 'axios';

interface ExtractedColors {
  primary: string | null;
  secondary: string | null;
}

export async function extractDominantColors(imageUrl: string | null): Promise<ExtractedColors> {
  if (!imageUrl) {
    return { primary: null, secondary: null };
  }

  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        // Some servers like Wikimedia require a User-Agent
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const buffer = Buffer.from(response.data);
    let contentType = response.headers['content-type'] || 'image/jpeg';

    // Fallback: Infer from URL if content-type is generic
    if (!contentType || contentType === 'application/octet-stream') {
      const ext = imageUrl.split('.').pop()?.toLowerCase();
      if (ext === 'png') contentType = 'image/png';
      else if (ext === 'gif') contentType = 'image/gif';
      else contentType = 'image/jpeg';
    }

    const colors = await getColors(buffer, contentType);

    if (colors && colors.length > 0) {
      return {
        primary: colors[0].hex(),
        secondary: colors.length > 1 ? colors[1].hex() : null
      };
    }

    return { primary: null, secondary: null };
  } catch {
    // Silent error handling
    return { primary: null, secondary: null };
  }
}
