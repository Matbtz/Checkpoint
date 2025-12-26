'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchResult } from '@/actions/search';
import { addGameExtended } from '@/actions/add-game';
import { toast } from 'sonner';

interface SearchResultCardProps {
    game: SearchResult;
}

export function SearchResultCard({ game }: SearchResultCardProps) {
    const [isAdding, setIsAdding] = React.useState(false);
    const [isAdded, setIsAdded] = React.useState(game.isAdded);

    const handleQuickAdd = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (isAdded || isAdding) return;

        setIsAdding(true);
        try {
            // Use the game data to add.
            // Note: addGameExtended expects a payload. We map SearchResult to what it expects.
            // Ideally we should reuse the "Add Wizard" logic but for "Quick Add" we just want Backlog/Main.
            const payload = {
                id: game.id,
                title: game.game?.title || game.title, // Handle both structures if needed
                coverImage: game.availableCovers?.[0] || null,
                backgroundImage: game.availableBackgrounds?.[0] || null,
                releaseDate: game.releaseDate,
                studio: game.studio,
                opencriticScore: game.opencriticScore,
                genres: JSON.stringify(game.genres),
                platforms: game.platforms || [], // Might need better handling if its objects
                description: game.description,
                status: 'BACKLOG',
                targetedCompletionType: 'MAIN'
            };

            // Fix platform format if they are objects {id, name} from IGDB
            if (game.source === 'igdb' && game.originalData?.platforms) {
                 payload.platforms = game.originalData.platforms.map(p => p.name);
            }

            await addGameExtended(payload);
            setIsAdded(true);
            toast.success(`${game.title} added to backlog`);
        } catch (err) {
            console.error(err);
            toast.error("Failed to add game");
        } finally {
            setIsAdding(false);
        }
    };

    // OpenCritic Badge Color Logic
    const getScoreColor = (score: number | null) => {
        if (!score) return "bg-zinc-500";
        if (score >= 84) return "bg-green-600";
        if (score >= 74) return "bg-yellow-600";
        return "bg-zinc-600";
    };

    return (
        <div className="group relative flex flex-col bg-card rounded-lg border overflow-hidden hover:shadow-lg transition-all">
            <Link href={`/game/${game.id}`} className="flex-1">
                {/* Image */}
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
                    {game.availableCovers?.[0] ? (
                        <Image
                            src={game.availableCovers[0]}
                            alt={game.title}
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground text-xs p-4 text-center">
                            No Image
                        </div>
                    )}

                    {/* Score Badge */}
                    {game.opencriticScore !== null && (
                         <div className={cn(
                             "absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-sm z-10",
                             getScoreColor(game.opencriticScore)
                         )}>
                             {game.opencriticScore}
                         </div>
                    )}

                    {/* Quick Add Overlay Button (Desktop) */}
                    <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        <Button
                            size="icon"
                            variant={isAdded ? "secondary" : "default"}
                            className="h-8 w-8 shadow-md"
                            onClick={handleQuickAdd}
                            disabled={isAdded || isAdding}
                        >
                            {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                                isAdded ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>

                {/* Details */}
                <div className="p-3 flex flex-col gap-1">
                    <h3 className="font-semibold text-sm line-clamp-1" title={game.title}>
                        {game.title}
                    </h3>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{game.releaseDate ? new Date(game.releaseDate).getFullYear() : 'TBA'}</span>
                        <span className="line-clamp-1 max-w-[50%] text-right">{game.studio}</span>
                    </div>
                </div>
            </Link>

            {/* Mobile/Touch accessible button area if needed, but the overlay works well for desktop.
                For mobile, hover might not work, so we might want to ensure it's accessible.
                We can keep the button visible on mobile if we detect touch or just rely on the Game Page 'Add' button.
                For now, we rely on hover which often maps to 'first tap' on mobile or we can make it always visible on small screens?
                Let's make it always visible on small screens via CSS if desired, or keep it clean.
            */}
        </div>
    );
}
