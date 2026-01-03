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

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function checkTitleMatch(query: string, candidate: string): boolean {
  const q = normalize(query);
  const c = normalize(candidate);

  // 1. Exact Match
  if (q === c) return true;

  // 2. Containment (Handle "Game: Edition" vs "Game")
  if (c.includes(q) || q.includes(c)) {
    // Safety Check: Ensure the "extra" part looks like an edition/version, not a distinct DLC title.
    // We calculate the difference in length.
    const diff = Math.abs(c.length - q.length);

    // If very short difference (e.g. "Game VR" vs "Game"), allow it.
    if (diff <= 3) return true;

    // Check for "Edition" keywords in the longer string
    const longer = c.length > q.length ? c : q;
    const keywords = [
      'edition', 'remaster', 'complete', 'definitive', 'goty',
      'version', 'cut', 'director', 'collection', 'bundle', 'final',
      'reloaded', 'royal', 'redux', 'enhanced', 'port', 'switch',
      'ps4', 'ps5', 'xbox', 'pc', 'steam'
    ];

    if (keywords.some(k => longer.includes(k))) return true;

    // If perfectly contained but NO edition keyword, it's risky (e.g. "Cyberpunk 2077: Phantom Liberty").
    // We reject unless the Levenshtein distance is still very close (typos).
  }

  // 3. Levenshtein (Typo tolerance)
  const dist = levenshtein(q, c);
  const threshold = Math.max(5, Math.ceil(Math.min(q.length, c.length) * 0.3));
  return dist <= threshold;
}

export async function searchHowLongToBeat(gameTitle: string): Promise<{ main: number; extra: number; completionist: number; url: string | null } | null> {
  const normalizedTitle = gameTitle.toLowerCase().trim();

  // 1. Try the Official Library
  // (We keep this as a "try" because if it ever gets fixed or works in some environments, it's the most direct method)
  try {
    const hltbService = new HowLongToBeatService();
    // Short timeout for library to not waste time if it's hanging
    // But the library doesn't support timeout easily. We assume it fails fast (403).
    const results = await hltbService.search(gameTitle);

    if (results && results.length > 0) {
      const sorted = results.map(r => ({
        item: r,
        dist: levenshtein(r.name.toLowerCase(), normalizedTitle)
      })).sort((a, b) => a.dist - b.dist);

      const best = sorted[0];

      // Use Robust Check on the best result
      if (checkTitleMatch(normalizedTitle, best.item.name)) {
        return {
          main: Math.round(best.item.gameplayMain * 60),
          extra: Math.round(best.item.gameplayMainExtra * 60),
          completionist: Math.round(best.item.gameplayCompletionist * 60),
          url: `https://howlongtobeat.com/game/${best.item.id}`
        };
      }
    }
  } catch (error) {
    // Expected to fail in many cloud environments due to 403
    // console.warn(`[HLTB] Library search failed for "${gameTitle}"`);
  }

  // 2. Fallback: Brave Search -> Page Scrape
  // Brave is currently more permissive than Google/DDG for scraping
  try {
    const USER_AGENTS = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    ];
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    const query = `site:howlongtobeat.com "${gameTitle}"`;
    const searchUrl = `https://search.brave.com/search?q=${encodeURIComponent(query)}`;

    const searchRes = await axios.get(searchUrl, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html'
      }
    });

    const $search = cheerio.load(searchRes.data);
    let gameId = '';

    // Look for links to howlongtobeat.com/game/NUMBER
    $search('a').each((i, el) => {
      if (gameId) return;
      const href = $search(el).attr('href');
      if (href) {
        // We prefer canonical links (ending in digit) over subpages
        const match = href.match(/howlongtobeat\.com\/game\/(\d+)$/);
        if (match) {
          gameId = match[1];
        } else {
          // Fallback to any game link if canonical not found first (e.g. /reviews)
          // But usually the main link appears first or second
          const matchLoose = href.match(/howlongtobeat\.com\/game\/(\d+)/);
          if (matchLoose && !gameId) {
            gameId = matchLoose[1];
          }
        }
      }
    });

    if (gameId) {
      // Fetch the Game Page
      const gameUrl = `https://howlongtobeat.com/game/${gameId}`;
      const gameRes = await axios.get(gameUrl, {
        headers: { 'User-Agent': ua }
      });

      const $game = cheerio.load(gameRes.data);
      const pageTitle = $game('div[class*="GameHeader_profile_header__"]').first().text().trim() ||
        $game('title').text().replace('How long is', '').replace('| HowLongToBeat', '').trim();

      // Verify Title Match using Robust Check
      if (checkTitleMatch(normalizedTitle, pageTitle)) {
        const pageText = $game('body').text().replace(/\s+/g, ' ');

        const extractTime = (labelRegex: RegExp) => {
          const match = pageText.match(labelRegex);
          return match ? parseTime(match[1]) : 0;
        };

        const main = extractTime(/Main Story\s*([\d½\.]+\s*(?:Hours?|Mins?))/i) ||
          extractTime(/Main Story\s*([\d½\.]+)/i);

        const extra = extractTime(/Main \+ (?:Sides|Extras?)\s*([\d½\.]+\s*(?:Hours?|Mins?))/i) ||
          extractTime(/Main \+ (?:Sides|Extras?)\s*([\d½\.]+)/i);

        const completionist = extractTime(/Completionist\s*([\d½\.]+\s*(?:Hours?|Mins?))/i) ||
          extractTime(/Completionist\s*([\d½\.]+)/i);

        return { main, extra, completionist, url: gameUrl };
      } else {
        const d = levenshtein(normalize(pageTitle), normalizedTitle);
        console.warn(`[HLTB] Fallback: Page title "${pageTitle}" too far from "${gameTitle}" (dist: ${d})`);
      }
    } else {
      console.warn(`[HLTB] Fallback: No ID found via Brave for "${gameTitle}"`);
    }

  } catch (err: any) {
    if (axios.isAxiosError(err) && err.response?.status === 429) {
      throw new Error('429 Rate Limit Exceeded');
    }
    console.error(`[HLTB] Fallback error for "${gameTitle}":`, err instanceof Error ? err.message : err);
  }

  return null;
}
