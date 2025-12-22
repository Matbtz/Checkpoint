'use client';

import Image from 'next/image';
import { Game } from '@prisma/client';
import { motion } from 'framer-motion';

interface HomeGameCardProps {
  game: Game;
  rank?: number;
}

export function HomeGameCard({ game, rank }: HomeGameCardProps) {
  const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;

  return (
    <motion.div
        whileHover={{ scale: 1.05 }}
        className="group relative flex-shrink-0 w-[160px] cursor-pointer flex flex-col gap-2"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg shadow-lg">
        {game.coverImage ? (
             <Image
                src={game.coverImage}
                alt={game.title}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-110"
                sizes="160px"
            />
        ) : (
             <div className="flex h-full w-full items-center justify-center bg-zinc-800 text-zinc-500">
                 No Image
             </div>
        )}

        {/* Score Badge */}
        {game.opencriticScore && (
             <div className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/80 backdrop-blur-md border border-white/10 font-bold text-white text-xs shadow-lg">
                 {game.opencriticScore}
             </div>
        )}

         {/* Rank Badge (Optional) */}
         {rank && (
            <div className="absolute top-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white text-xs font-bold shadow-lg">
                #{rank}
            </div>
         )}
      </div>

      <div className="flex flex-col px-1">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              {game.title}
          </h3>
           <div className="flex items-center gap-2 text-xs text-zinc-500">
              {releaseYear && <span>{releaseYear}</span>}
              {game.studio && (
                  <>
                      <span>•</span>
                      <span className="truncate max-w-[100px]">{game.studio}</span>
                  </>
              )}
          </div>
      </div>
    </motion.div>
  );
}
