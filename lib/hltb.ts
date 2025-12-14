// Placeholder for HowLongToBeat interactions.
// Note: HLTB has strict bot protection. This service attempts to use the 'howlongtobeat' library,
// but handles failures gracefully as requested (setting 'dataMissing' flag).

export interface HltbTime {
  main: number;
  extra: number;
  completionist: number;
}

export interface HltbResult {
  game_id: number;
  game_name: string;
  game_image?: string;
  comp_main: number; // Seconds? No, usually hours or formatted string in library. Let's check library output.
  comp_plus: number;
  comp_100: number;
}

// Based on library output inspection (from docs or source):
// The library returns objects with fields like 'gameplayMain', 'gameplayMainExtra', 'gameplayCompletionist' in hours.
// Wait, looking at library source, it maps fields.
// Let's define what we expect from our service wrapper.

export async function searchHltb(gameName: string): Promise<HltbTime | null> {
  // We dynamically import to avoid issues if the module is missing or causes build errors in some envs
  // clean name for better search results
  const cleanName = gameName.replace(/[^a-zA-Z0-9 ]/g, ' ');

  try {
     // Since the 'howlongtobeat' library uses axios and might be blocked,
     // we wrap this in a try/catch.
     // In a real production environment with bot protection, we might need a proxy or a real browser (Puppeteer).
     // For this task, we implement the interface and return null on 403/error.

     // Note: The library export is `HowLongToBeatService` class.
     // const hltb = require('howlongtobeat');
     // const hltbService = new hltb.HowLongToBeatService();
     // return await hltbService.search(cleanName).then(...)

     // However, since we know it fails in this sandbox, we will simulate or return null.
     // If the user runs this locally, it might work.

     const { HowLongToBeatService } = await import('howlongtobeat');
     const service = new HowLongToBeatService();
     const results = await service.search(cleanName);

     if (!results || results.length === 0) {
       return null;
     }

     // Simple matching: find exact match.
     // We can improve matching logic (e.g. using Levenshtein distance)
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     const match = results.find((r: any) => r.name.toLowerCase() === gameName.toLowerCase());

     // Strict matching as requested: if no exact match, return null to flag data missing.
     if (!match) return null;

     return {
       main: match.gameplayMain,
       extra: match.gameplayMainExtra,
       completionist: match.gameplayCompletionist
     };

  } catch (error) {
    console.warn(`HLTB Search failed for ${gameName}:`, error);
    return null;
  }
}
