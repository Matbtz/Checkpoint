import getColors from 'get-image-colors';
import axios from 'axios';

interface ExtractedColors {
  primary: string | null;
  secondary: string | null;
}

function isSafeUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);

    // Only allow HTTP and HTTPS
    if (!['http:', 'https:'].includes(url.protocol)) {
      return false;
    }

    const hostname = url.hostname;

    // Block localhost and common local domains
    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      return false;
    }

    // Remove brackets from IPv6 for checking
    const cleanHostname = hostname.replace(/^\[|\]$/g, '');

    // Block IPv6 Loopback
    if (cleanHostname === '::1') return false;

    // IPv4 Checks
    // Check if it looks like an IP address
    const isIpV4 = /^(\d{1,3}\.){3}\d{1,3}$/.test(cleanHostname);

    if (isIpV4) {
      const parts = cleanHostname.split('.').map(Number);

      // 0.0.0.0/8 (Current network)
      if (parts[0] === 0) return false;

      // 127.0.0.0/8 (Loopback)
      if (parts[0] === 127) return false;

      // 10.0.0.0/8 (Private)
      if (parts[0] === 10) return false;

      // 192.168.0.0/16 (Private)
      if (parts[0] === 192 && parts[1] === 168) return false;

      // 172.16.0.0/12 (Private)
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;

      // 169.254.0.0/16 (Link-local)
      if (parts[0] === 169 && parts[1] === 254) return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function extractDominantColors(imageUrl: string | null): Promise<ExtractedColors> {
  if (!imageUrl) {
    return { primary: null, secondary: null };
  }

  // Security: Validate URL to prevent SSRF
  if (!isSafeUrl(imageUrl)) {
    console.warn(`[Security] Blocked unsafe URL in extractDominantColors: ${imageUrl}`);
    return { primary: null, secondary: null };
  }

  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        // Some servers like Wikimedia require a User-Agent
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      // Prevent redirects to unsafe URLs (axios follows redirects by default)
      // Note: A full SSRF protection would inspect the redirect URL too.
      // For now, we rely on the initial check and maxRedirects.
      maxRedirects: 3
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
  } catch {
    // Silent error handling
    return { primary: null, secondary: null };
  }
}
