export interface IncomingSteamData {
  appid: number;
  playtime_forever: number;
}

export interface TimeToBeat {
  main: number | null;
  extra: number | null;
  completionist: number | null;
}

export interface GameMetadata {
  openCriticScore?: number;
}

export interface SynthesizedGameObject {
  id: string; // Internal ID
  title: string;
  coverImage?: string; // Sourced from IGDB or other provider
  timeToBeat: TimeToBeat;
  metadata: GameMetadata;
  steamData?: IncomingSteamData; // Optional, if linked
}
