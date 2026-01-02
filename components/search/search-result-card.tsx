'use client';

import * as React from 'react';
import { SafeImage } from '@/components/ui/safe-image';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchResult } from '@/actions/search';
import { addGameExtended } from '@/actions/add-game';
import { toast } from 'sonner';

import { useSession } from "next-auth/react";

interface SearchResultCardProps {
    game: SearchResult;
}

export function SearchResultCard({ game }: SearchResultCardProps) {
    const { data: session } = useSession();
    const [isAdding, setIsAdding] = React.useState(false);
    const [isAdded, setIsAdded] = React.useState(game.isAdded);

    const handleQuickAdd = async (e: React.MouseEvent) => {
        // ... (rest of the function remains the same, I will leave it unchanged but I'm replacing the top part so I need to be careful with range)
        e.preventDefault();
        e.stopPropagation();

        if (isAdded || isAdding) return;

        setIsAdding(true);
        try {
            // ... logic ...
            let status = 'BACKLOG';
            if (game.releaseDate) {
                const releaseDate = new Date(game.releaseDate);
                const today = new Date();
                if (releaseDate > today) {
                    status = 'WISHLIST';
                }
            }

            const payload = {
                id: game.id,
                title: game.title,
                coverImage: game.availableCovers?.[0] || null,
                backgroundImage: game.availableBackgrounds?.[0] || null,
                releaseDate: game.releaseDate,
                studio: game.studio,
                opencriticScore: game.opencriticScore,
                genres: JSON.stringify(game.genres),
                platforms: game.platforms || [],
                description: game.description,
                status: status,
                targetedCompletionType: 'MAIN'
            };

            if (game.source === 'igdb' && game.originalData && 'platforms' in game.originalData) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const platforms = (game.originalData as any).platforms;
                if (Array.isArray(platforms)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    payload.platforms = platforms.map((p: any) => p.name);
                }
            }

            await addGameExtended(payload);
            setIsAdded(true);
            toast.success(`${game.title} added to ${status.toLowerCase()}`);
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
                {/* Image Wrapper */}
                <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted">
                    <SafeImage
                        src={game.availableCovers?.[0] || ''}
                        alt={game.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
                        gameId={game.id}
                        imageType="COVER"
                        fallback={
                            <div className="flex h-full items-center justify-center text-muted-foreground text-xs p-4 text-center">
                                No Image
                            </div>
                        }
                    />

                    {/* Score Badge */}
                    {game.opencriticScore !== null && (
                        <div className={cn(
                            "absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow-sm z-10",
                            getScoreColor(game.opencriticScore ?? null)
                        )}>
                            {game.opencriticScore}
                        </div>
                    )}

                    {/* Quick Add Button - Absolute positioned overlay inside the image container 
                        This ensures it stays with the image, but higher z-index catches clicks.
                        Since it's inside the Link, handled by stopPropagation.
                        Only visible if user is logged in.
                    */}
                    {session && (
                        <div className="absolute bottom-2 right-2 z-20">
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
                    )}
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
        </div>
    );
}
