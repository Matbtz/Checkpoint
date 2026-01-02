'use client';


import Link from 'next/link';
import { Game } from '@prisma/client';
import { motion } from 'framer-motion';
import { SafeImage } from '@/components/ui/safe-image';

interface HomeGameCardProps {
  game: Game;
  rank?: number;
}

export function HomeGameCard({ game, rank }: HomeGameCardProps) {
  const releaseDate = game.releaseDate ? new Date(game.releaseDate) : null;

  const displayDate = releaseDate
    ? releaseDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div
      className="relative flex-shrink-0 group"
      style={{ width: '160px', minWidth: '160px' }}
    >
      <Link href={`/game/${game.id}`}>
        <motion.div
          whileHover={{ y: -5 }}
          className="w-full cursor-pointer flex flex-col gap-2"
        >
          <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg shadow-lg bg-zinc-800">
            <SafeImage
              src={game.coverImage || ''}
              alt={game.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-110"
              sizes="160px"
              gameId={game.id}
              imageType="COVER"
              fallback={
                <div className="flex h-full w-full items-center justify-center text-zinc-500 text-xs text-center p-2">
                  {game.title}
                </div>
              }
            />

            {/* Score Badge */}
            {game.opencriticScore && (
              <div className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/80 backdrop-blur-md border border-white/10 font-bold text-white text-[10px] shadow-lg">
                {game.opencriticScore}
              </div>
            )}

            {/* Rank Badge (Optional) */}
            {rank && (
              <div className="absolute top-2 left-2 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-white text-[10px] font-bold shadow-lg">
                #{rank}
              </div>
            )}

            <div className="flex flex-col px-1">
              <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" title={game.title}>
                {game.title}
              </h3>
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                {displayDate && <span>{displayDate}</span>}
                {game.studio && (
                  <>
                    <span>•</span>
                    <span className="truncate max-w-[80px]">{game.studio}</span>
                  </>
                )}
              </div>
            </div>
        </motion.div>
      </Link>
    </div>
  );
}
