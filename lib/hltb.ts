import { HowLongToBeatService, HowLongToBeatEntry } from 'howlongtobeat';
import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Calculates the Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = new Array(bn + 1);
  for (let i = 0; i <= bn; i++) {
    matrix[i] = new Array(an + 1);
    matrix[i][0] = i;
  }
  for (let j = 0; j <= an; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[bn][an];
}

function parseTime(text: string): number {
  if (!text) return 0;
  const clean = text.toLowerCase().replace(/½/g, '.5').replace(/[^0-9.hm]/g, '');

  if (clean.includes('h') || clean.includes('m')) {
    let hours = 0;
    let minutes = 0;
    const hMatch = clean.match(/([\d.]+)h/);
    const mMatch = clean.match(/([\d.]+)m/);
    if (hMatch) hours = parseFloat(hMatch[1]);
    if (mMatch) minutes = parseFloat(mMatch[1]);
    return Math.round(hours * 60 + minutes);
  }

  // Assuming purely numeric is hours if not specified, but usually it says "Hours"
  const val = parseFloat(clean);
  return isNaN(val) ? 0 : Math.round(val * 60);
}

export async function searchHowLongToBeat(gameTitle: string): Promise<{ main: number; extra: number; completionist: number } | null> {
  const normalizedTitle = gameTitle.toLowerCase().trim();

  // 1. Try the Official Library
  try {
    const hltbService = new HowLongToBeatService();
    const results = await hltbService.search(gameTitle);

    if (results && results.length > 0) {
      // Find best match using Levenshtein
      const sorted = results.map(r => ({
        item: r,
        dist: levenshtein(r.name.toLowerCase(), normalizedTitle)
      })).sort((a, b) => a.dist - b.dist);

      const best = sorted[0];

      // Validation: Accept if exact match or close enough
      // Threshold: Distance <= 5 or <= 20% of title length
      const threshold = Math.max(5, Math.ceil(normalizedTitle.length * 0.2));

      if (best.dist <= threshold) {
        // Library returns Hours. Convert to Minutes.
        return {
          main: Math.round(best.item.gameplayMain * 60),
          extra: Math.round(best.item.gameplayMainExtra * 60),
          completionist: Math.round(best.item.gameplayCompletionist * 60)
        };
      }
    }
  } catch (error) {
    console.warn(`[HLTB] Library search failed for "${gameTitle}", attempting fallback.`, error instanceof Error ? error.message : error);
  }

  // 2. Fallback: DuckDuckGo Site Search -> Page Scrape
  try {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';
    const ddgUrl = `https://duckduckgo.com/html/?q=site:howlongtobeat.com/game+${encodeURIComponent(gameTitle)}`;

    const ddgRes = await axios.get(ddgUrl, {
      headers: { 'User-Agent': ua }
    });

    const $ddg = cheerio.load(ddgRes.data);
    let gameId = '';

    // Find the first link that matches howlongtobeat.com/game/NUMBER
    $ddg('a.result__a').each((i, el) => {
      if (gameId) return;
      const href = $ddg(el).attr('href');
      // DDG uses uuddg.com/url?q=REAL_URL
      // But scraping /html/ usually gives direct links or different format.
      // Let's check the href.
      if (href) {
        // Decode it if needed (DDG wraps it sometimes)
        // Usually plain HTML version has straightforward links?
        // Actually, let's look for the text or href content.
        const match = href.match(/howlongtobeat\.com\/game\/(\d+)/);
        if (match) {
            gameId = match[1];
        } else {
             // Try to extract from query param if wrapped
             const urlParams = new URLSearchParams(href.split('?')[1]);
             const q = urlParams.get('uddg');
             if (q) {
                 const qMatch = q.match(/howlongtobeat\.com\/game\/(\d+)/);
                 if (qMatch) gameId = qMatch[1];
             }
        }
      }
    });

    if (!gameId) {
        console.warn(`[HLTB] Fallback: No ID found via DDG for "${gameTitle}"`);
        return null;
    }

    // Fetch the Game Page
    const gameUrl = `https://howlongtobeat.com/game/${gameId}`;
    const gameRes = await axios.get(gameUrl, {
      headers: { 'User-Agent': ua }
    });

    const $game = cheerio.load(gameRes.data);
    const pageTitle = $game('div[class*="GameHeader_profile_header__"]').first().text().trim() ||
                      $game('title').text().replace('How long is', '').replace('| HowLongToBeat', '').trim();

    // Verify Title Match on the fallback result to avoid bad DDG hits
    const dist = levenshtein(pageTitle.toLowerCase(), normalizedTitle);
    const threshold = Math.max(5, Math.ceil(normalizedTitle.length * 0.3)); // Slightly looser for fallback
    if (dist > threshold) {
        console.warn(`[HLTB] Fallback: Page title "${pageTitle}" too far from "${gameTitle}" (dist: ${dist})`);
        return null;
    }

    // Scrape Times
    // We look for the "Main Story", "Main + Sides", "Completionist" labels in the text
    // The structure is usually: Label followed by Time.
    // Example: "Main Story 29½ Hours"
    // We can iterate over all elements or just grab body text and regex.
    // Regex is safer given class obfuscation.

    const pageText = $game('body').text().replace(/\s+/g, ' ');

    const extractTime = (labelRegex: RegExp) => {
        const match = pageText.match(labelRegex);
        return match ? parseTime(match[1]) : 0;
    };

    // Regex explanation: Look for Label, optional space, capture digits/dots/½, space, Hours/Mins
    const main = extractTime(/Main Story\s*([\d½\.]+\s*(?:Hours?|Mins?))/i) ||
                 extractTime(/Main Story\s*([\d½\.]+)/i); // aggressive fallback

    const extra = extractTime(/Main \+ (?:Sides|Extras?)\s*([\d½\.]+\s*(?:Hours?|Mins?))/i) ||
                  extractTime(/Main \+ (?:Sides|Extras?)\s*([\d½\.]+)/i);

    const completionist = extractTime(/Completionist\s*([\d½\.]+\s*(?:Hours?|Mins?))/i) ||
                          extractTime(/Completionist\s*([\d½\.]+)/i);

    return { main, extra, completionist };

  } catch (err) {
    console.error(`[HLTB] Fallback error for "${gameTitle}":`, err instanceof Error ? err.message : err);
    return null;
  }
}
