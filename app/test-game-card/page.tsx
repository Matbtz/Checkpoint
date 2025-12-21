
'use client';

import { GameCard } from '@/components/dashboard/GameCard';
import { UserLibrary, Game } from '@prisma/client';

export default function TestGameCardPage() {
  const mockGame: Game = {
    id: 'game-1',
    title: 'Test Game Primary',
    coverImage: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co2lbd.jpg',
    backgroundImage: null,
    primaryColor: '#ef4444', // Red-500
    secondaryColor: '#3b82f6', // Blue-500
    releaseDate: new Date(),
    genres: '["Action", "Adventure"]',
    scores: null,
    metacritic: 90,
    hltbTimes: null,
    hltbMain: 10,
    hltbExtra: 20,
    hltbCompletionist: 30,
    createdAt: new Date(),
    updatedAt: new Date(),
    igdbId: 123,
    description: null,
    studio: null,
    screenshots: [],
    videos: [],
    platforms: null,
    igdbTime: null,
    customPlaytime: null,
    steamUrl: null,
    opencriticUrl: null,
    igdbUrl: null,
    hltbUrl: null,
    metacriticScore: null,
    opencriticScore: null,
    igdbScore: null,
    steamAppId: null,
    steamReviewScore: null,
    steamReviewCount: null,
    steamReviewPercent: null,
    isDlc: false,
  };

  const mockItem: UserLibrary & { game: Game } = {
    id: 'lib-1',
    userId: 'user-1',
    gameId: 'game-1',
    status: 'Playing',
    playtimeManual: 120,
    playtimeSteam: 0,
    progressManual: 50,
    targetedCompletionType: 'Main',
    customCoverImage: null,
    primaryColor: null, // Should fallback to game.primaryColor (Red)
    secondaryColor: null, // Should fallback to game.secondaryColor (Blue)
    createdAt: new Date(),
    updatedAt: new Date(),
    game: mockGame,
  };

  const mockGame2: Game = { ...mockGame, id: 'game-2', title: 'Test Game Override', primaryColor: '#22c55e' }; // Green
  const mockItem2: UserLibrary & { game: Game } = {
    ...mockItem,
    id: 'lib-2',
    gameId: 'game-2',
    game: mockGame2,
    primaryColor: '#eab308', // Yellow-500 (Override Green)
    secondaryColor: '#a855f7', // Purple-500
  };

  const mockGame3: Game = { ...mockGame, id: 'game-3', title: 'Test Game Defaults', primaryColor: null, secondaryColor: null };
  const mockItem3: UserLibrary & { game: Game } = {
    ...mockItem,
    id: 'lib-3',
    gameId: 'game-3',
    game: mockGame3,
    primaryColor: null,
    secondaryColor: null,
    // Should use defaults (Zinc-800)
  };

  return (
    <div className="p-10 grid grid-cols-3 gap-4 bg-zinc-950 min-h-screen">
      <div>
        <h2 className="text-white mb-2">Game Colors (Red/Blue)</h2>
        <GameCard item={mockItem} />
      </div>
      <div>
        <h2 className="text-white mb-2">User Override (Yellow/Purple)</h2>
        <GameCard item={mockItem2} />
      </div>
      <div>
        <h2 className="text-white mb-2">Defaults (Zinc-800)</h2>
        <GameCard item={mockItem3} />
      </div>
    </div>
  );
}
