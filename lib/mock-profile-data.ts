import { Game, User, PlaySession, UpcomingGame, FriendActivity } from '@/types/profile';

export const mockUser: User = {
  id: 'u1',
  username: 'JulesGamer',
  avatarUrl: 'https://images.unsplash.com/photo-1568602471122-7832951cc4c5?w=400&h=400&fit=crop',
  profileBackgroundUrl: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=1200&h=400&fit=crop',
};

const games: Game[] = [
  { id: 'g1', title: 'Cyberpunk 2077', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2mjs.jpg', slug: 'cyberpunk-2077' },
  { id: 'g2', title: 'Elden Ring', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg', slug: 'elden-ring' },
  { id: 'g3', title: 'Baldur\'s Gate 3', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co670h.jpg', slug: 'baldurs-gate-3' },
  { id: 'g4', title: 'Starfield', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co64gc.jpg', slug: 'starfield' },
  { id: 'g5', title: 'Hades II', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co83i2.jpg', slug: 'hades-ii' },
  { id: 'g6', title: 'Silksong', coverUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1r76.jpg', slug: 'hollow-knight-silksong' },
];

export const mockRecentPlays: PlaySession[] = [
  { game: games[0], progressPercent: 75, lastPlayedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), sessionDuration: '2h' }, // 2 hours ago
  { game: games[1], progressPercent: 40, lastPlayedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), sessionDuration: '1h 30min' },
  { game: games[2], progressPercent: 90, lastPlayedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), sessionDuration: '4h' },
  { game: games[0], progressPercent: 78, lastPlayedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), sessionDuration: '50min' },
];

export const mockUpcoming: UpcomingGame[] = [
  { game: games[4], releaseDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString() }, // In 3 days
  { game: games[5], releaseDate: '2025-05-15T00:00:00Z' },
  { game: games[3], releaseDate: '2023-09-06T00:00:00Z' }, // Already released, but maybe in wishlist
];

export const mockFriendsActivity: FriendActivity[] = [
  {
    friend: { id: 'f1', username: 'Alex', avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop', profileBackgroundUrl: '' },
    game: games[1],
  },
  {
    friend: { id: 'f2', username: 'Sarah', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop', profileBackgroundUrl: '' },
    game: games[2],
  },
  {
    friend: { id: 'f3', username: 'Mike', avatarUrl: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?w=100&h=100&fit=crop', profileBackgroundUrl: '' },
    game: games[0],
  },
];
