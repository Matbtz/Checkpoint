// Placeholder for steam API interactions

export interface SteamGame {
  appid: number;
  name: string;
  playtime_forever: number; // in minutes
  img_icon_url: string;
  has_community_visible_stats: boolean;
  playtime_windows_forever: number;
  playtime_mac_forever: number;
  playtime_linux_forever: number;
  rtime_last_played: number;
}

export interface GetOwnedGamesResponse {
  response: {
    game_count: number;
    games: SteamGame[];
  };
}

export async function getOwnedGames(steamId: string): Promise<SteamGame[]> {
  const apiKey = process.env.STEAM_SECRET;
  if (!apiKey) {
    throw new Error('STEAM_SECRET api key not configured');
  }

  const url = `http://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${apiKey}&steamid=${steamId}&format=json&include_appinfo=true&include_played_free_games=true`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Steam API error: ${response.statusText}`);
  }

  const data: GetOwnedGamesResponse = await response.json();
  return data.response.games || [];
}
