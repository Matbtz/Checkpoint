export type Game = {
  id: string;
  title: string;
  coverUrl: string; // Vertical format artwork
  slug: string;
};

export type User = {
  id: string;
  username: string;
  avatarUrl: string;
  profileBackgroundUrl: string; // Large landscape artwork
  profileBackgroundMode?: string;
  profileBackgroundGameId?: string | null;
};

export interface PlaySession {
  game: Game;
  progressPercent: number; // 0-100
  lastPlayedAt: string; // ISO Date
  sessionDuration: string; // e.g., "45min", "2h"
}

export interface UpcomingGame {
  game: Game;
  releaseDate: string; // ISO Date
}

export interface FriendActivity {
  friend: User;
  game: Game;
}
