import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import Image from "next/image";
import { SafeImage } from "@/components/ui/safe-image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HLTBCard } from "@/components/game/HLTBCard";
import { ActionBar } from "@/components/game/ActionBar";
import { MediaCarousel } from "@/components/game/MediaCarousel";
import { RatingsSection } from "@/components/game/RatingsSection";
import { RefreshButton } from "@/components/game/RefreshButton";
import { Badge } from "@/components/ui/badge";
import { Calendar, Building2, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";
// ... (existing imports)

import { format } from "date-fns";

// Helpers for IGDB mappings
const GAME_STATUS_MAP: Record<number, string> = {
    0: "Released",
    1: "Released", // Sometimes 1 is used? IGDB docs say 0. Let's cover bases.
    2: "Alpha",
    3: "Beta",
    4: "Early Access",
    5: "Offline",
    6: "Cancelled",
    7: "Rumored"
};

const GAME_TYPE_MAP: Record<number, string> = {
    0: "Main Game",
    1: "DLC",
    2: "Expansion",
    3: "Bundle",
    4: "Standalone Expansion",
    5: "Mod",
    6: "Episode",
    7: "Season",
    8: "Remake",
    9: "Remaster",
    10: "Expanded Game",
    11: "Port",
    12: "Fork"
};

export default async function GameDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const session = await auth();
    const userId = session?.user?.id;

    const game = await prisma.game.findUnique({
        where: { id },
        include: {

            // We might want to fetch parent if it exists to show link?
            // parent: { select: { id: true, title: true } } 
        },
    });

    if (!game) {
        notFound();
    }

    // Fetch User Library Entry explicitly to ensure fresh data and correct user association
    // (Instead of relying on nested include which can be tricky with auth states)
    let userLibrary = null;
    if (userId) {
        userLibrary = await prisma.userLibrary.findUnique({
            where: {
                userId_gameId: {
                    userId: userId,
                    gameId: id
                }
            }
        });
    }

    // Parse platforms if they are stored as JSON
    let platforms: { name: string }[] = [];
    if (game.platforms && Array.isArray(game.platforms)) {
        platforms = (game.platforms as any[]).map(p => {
            if (typeof p === 'string') return { name: p };
            if (typeof p === 'object' && p !== null && p.name) return p;
            return null;
        }).filter((p): p is { name: string } => p !== null && p.name && p.name.trim().length > 0);
    }

    // Parse genres if they are stored as JSON string
    let genres: string[] = [];
    if (game.genres) {
        try {
            const parsed = JSON.parse(game.genres);
            if (Array.isArray(parsed)) genres = parsed;
        } catch (e) {
            // If not JSON, maybe just a string?
            genres = [game.genres];
        }
    }

    // Parse Related Games
    let relatedGames: Record<string, { id: string | number, name: string }[]> = {};
    if (game.relatedGames) {
        // It might be a JSON object from Prisma
        relatedGames = game.relatedGames as Record<string, { id: number, name: string }[]>;
    }

    // Fetch Franchise Games (if applicable)
    if (game.franchise) {
        const franchiseGames = await prisma.game.findMany({
            where: {
                franchise: game.franchise,
                id: { not: game.id }
            },
            select: { id: true, title: true, opencriticScore: true, releaseDate: true, gameType: true },
            orderBy: { releaseDate: 'desc' },
            take: 100
        });

        if (franchiseGames.length > 0) {
            const existingIds = new Set<string>();
            Object.values(relatedGames).forEach(list => {
                list.forEach(item => existingIds.add(String(item.id)));
            });

            const newFranchiseGames = franchiseGames.filter(g => !existingIds.has(g.id));

            newFranchiseGames.forEach(g => {
                let category = 'main_games';

                // Map gameType to category buckets
                switch (g.gameType) {
                    case 0: // Main
                        category = 'main_games';
                        break;
                    case 1: // DLC
                    case 2: // Expansion
                    case 4: // Standalone Expansion
                    case 10: // Expanded Game
                        category = 'dlcs_and_expansions';
                        break;
                    case 8: // Remake
                        category = 'remakes';
                        break;
                    case 9: // Remaster
                        category = 'remasters';
                        break;
                    case 3: // Bundle
                        category = 'bundles';
                        break;
                    default:
                        category = 'others_in_franchise';
                        break;
                }

                if (!relatedGames[category]) {
                    relatedGames[category] = [];
                }
                relatedGames[category].push({
                    id: g.id,
                    name: g.title
                });
            });
        }
    }

    // Collect all related IDs to check for existence in DB
    const relatedIds = new Set<string>();
    Object.values(relatedGames).forEach(list => {
        list.forEach(item => relatedIds.add(String(item.id)));
    });

    const knownRelatedGames = await prisma.game.findMany({
        where: { id: { in: Array.from(relatedIds) } },
        select: { id: true, title: true, opencriticScore: true, releaseDate: true }
    });

    const knownGamesMap = new Map(knownRelatedGames.map(g => [g.id, g]));

    // Prepare fallback for cover image
    const coverImage = game.coverImage || "/placeholder-game.png"; // You might want a real placeholder
    const backgroundImage = game.backgroundImage || coverImage;

    // Resolve Game Type & Status Strings
    const gameTypeStr = (game.gameType !== null && game.gameType !== 0 && game.gameType !== undefined)
        ? GAME_TYPE_MAP[game.gameType]
        : null;

    const statusStr = (game.status !== null && game.status !== undefined && game.status !== 0)
        ? GAME_STATUS_MAP[game.status]
        : (game.status === 0 ? "Released" : null);

    // Fallback HLTB URL if specific one is missing
    const hltbUrl = game.hltbUrl || `https://howlongtobeat.com/?q=${encodeURIComponent(game.title)}`;

    return (
        <div className="min-h-screen pb-20 bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100">
            {/* Hero Section */}
            <div className="relative w-full h-[50vh] min-h-[400px] md:h-[60vh] lg:h-[70vh]">
                {/* Background Image with Gradient */}
                <div className="absolute inset-0 z-0">
                    <Image
                        src={backgroundImage}
                        alt={game.title}
                        fill
                        className="object-cover"
                        priority
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-zinc-50 via-zinc-50/80 to-transparent dark:from-black dark:via-black/80 dark:to-black/30" />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/60" />
                </div>

                {/* Hero Content */}
                <div className="relative z-10 container mx-auto px-4 h-full flex flex-col md:flex-row items-center md:items-end justify-center md:justify-start pb-12 md:pb-16 gap-8">
                    {/* Poster */}
                    <div className="shrink-0 w-48 md:w-64 lg:w-72 aspect-[3/4] rounded-lg shadow-2xl overflow-hidden border-4 border-white/10 relative transform translate-y-8 md:translate-y-0 bg-zinc-900">
                        <SafeImage
                            src={coverImage}
                            alt={game.title}
                            fill
                            className="object-cover"
                            sizes="(max-width: 768px) 200px, 300px"
                            priority
                            gameId={game.id}
                            imageType="COVER"
                        />
                    </div>

                    {/* Header Info */}
                    <div className="flex flex-col items-center md:items-start text-center md:text-left space-y-4 max-w-2xl w-full">
                        <div className="space-y-2 w-full flex flex-col items-center md:items-start">
                            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white drop-shadow-lg leading-tight">
                                {game.title}
                            </h1>

                            <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 text-zinc-300 text-sm md:text-base">
                                {game.studio && (
                                    <div className="flex items-center gap-1.5">
                                        <Building2 className="w-4 h-4" />
                                        <span>{game.studio}</span>
                                    </div>
                                )}
                                {game.releaseDate && (
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4" />
                                        <span>{format(new Date(game.releaseDate), "MMM d, yyyy")}</span>
                                        {statusStr && statusStr !== "Released" && (
                                            <Badge variant="outline" className="border-amber-500 text-amber-500 ml-2">
                                                {statusStr}
                                            </Badge>
                                        )}
                                    </div>
                                )}
                                {gameTypeStr && (
                                    <Badge className="bg-purple-600 hover:bg-purple-700 text-white">
                                        {gameTypeStr}
                                    </Badge>
                                )}
                            </div>
                        </div>

                        <div className="w-full flex justify-center md:justify-start">
                            <ActionBar
                                gameId={game.id}
                                userLibrary={userLibrary}
                                isLoggedIn={!!session}
                                gamePlatforms={platforms.map(p => p.name)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="container mx-auto px-4 py-8 md:py-12">

                {/* Mobile Top Section (Ratings + HLTB) - Hidden on lg screens */}
                <div className="flex flex-col gap-6 mb-8 lg:hidden">
                    <RatingsSection
                        opencriticScore={game.opencriticScore}
                        igdbScore={game.igdbScore}
                        steamReviewScore={game.steamReviewScore}
                        steamReviewPercent={game.steamReviewPercent}
                        steamUrl={game.steamUrl}
                        igdbUrl={game.igdbUrl}
                        opencriticUrl={game.opencriticUrl}
                        variant="compact"
                    />

                    <HLTBCard
                        hltbMain={game.hltbMain}
                        hltbExtra={game.hltbExtra}
                        hltbCompletionist={game.hltbCompletionist}
                        hltbUrl={hltbUrl}
                        userPlaytime={userLibrary?.playtimeManual || userLibrary?.playtimeSteam}
                        predictedMain={game.predictedMain}
                        predictedExtra={game.predictedExtra}
                        predictedCompletionist={game.predictedCompletionist}
                        targetType={userLibrary?.targetedCompletionType || 'Main'}
                    />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">

                    {/* Left Column (Details & Media) */}
                    <div className="lg:col-span-2 space-y-10">
                        {/* About Section */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-bold">About</h2>
                                {game.dataMissing && (
                                    <RefreshButton gameId={game.id} gameTitle={game.title} />
                                )}
                            </div>

                            {/* Genres & Platforms Badges */}
                            <div className="space-y-3 mb-4">
                                {genres.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {genres.map((g) => (
                                            <Link key={g} href={`/search?genre=${encodeURIComponent(g)}`}>
                                                <Badge variant="secondary" className="cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700">
                                                    {g}
                                                </Badge>
                                            </Link>
                                        ))}
                                    </div>
                                )}

                                {platforms.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {platforms.map((p, i) => (
                                            <Link key={i} href={`/search?platform=${encodeURIComponent(p.name)}`}>
                                                <Badge variant="outline" className="bg-zinc-50 dark:bg-zinc-900 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs text-zinc-500 border-zinc-300 dark:border-zinc-700">
                                                    {p.name}
                                                </Badge>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="prose dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-300 leading-relaxed">
                                {game.description ? (
                                    <p className="whitespace-pre-line">{game.description}</p>
                                ) : (
                                    <p className="italic text-zinc-500">No description available.</p>
                                )}
                            </div>
                        </div>

                        {/* Storyline Section (if available) */}
                        {game.storyline && (
                            <div className="space-y-4">
                                <h2 className="text-2xl font-bold">Storyline</h2>
                                <div className="prose dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-300 leading-relaxed italic border-l-4 border-zinc-300 dark:border-zinc-700 pl-4">
                                    <p className="whitespace-pre-line">{game.storyline}</p>
                                </div>
                            </div>
                        )}

                        {/* Media Carousels */}
                        <div className="space-y-8">
                            {game.videos.length > 0 && (
                                <MediaCarousel videos={game.videos} screenshots={[]} title="Trailers" />
                            )}
                            {game.screenshots.length > 0 && (
                                <MediaCarousel videos={[]} screenshots={game.screenshots} title="Screenshots" />
                            )}
                        </div>
                    </div>

                    {/* Right Column (Stats Stack) */}
                    <div className="space-y-6">

                        {/* Time To Beat - Hidden on mobile (moved to top) */}
                        <div className="hidden lg:block">
                            <HLTBCard
                                hltbMain={game.hltbMain}
                                hltbExtra={game.hltbExtra}
                                hltbCompletionist={game.hltbCompletionist}
                                hltbUrl={hltbUrl}
                                userPlaytime={userLibrary?.playtimeManual || userLibrary?.playtimeSteam}
                                predictedMain={game.predictedMain}
                                predictedExtra={game.predictedExtra}
                                predictedCompletionist={game.predictedCompletionist}
                                targetType={userLibrary?.targetedCompletionType || 'Main'}
                            />
                        </div>

                        {/* Ratings Section - Hidden on mobile (moved to top) */}
                        <div className="hidden lg:block">
                            <RatingsSection
                                opencriticScore={game.opencriticScore}
                                igdbScore={game.igdbScore}
                                steamReviewScore={game.steamReviewScore}
                                steamReviewPercent={game.steamReviewPercent}
                                steamUrl={game.steamUrl}
                                igdbUrl={game.igdbUrl}
                                opencriticUrl={game.opencriticUrl}
                            />
                        </div>

                        {/* Related Games (DLCs, Remakes, etc) */}
                        {Object.keys(relatedGames).length > 0 && (
                            <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 shadow-sm border border-zinc-200 dark:border-zinc-800 space-y-4">
                                <h3 className="text-lg font-semibold flex items-center gap-2">
                                    <Gamepad2 className="w-5 h-5 text-purple-600" />
                                    Same Universe
                                </h3>
                                <div className="space-y-4">
                                    {Object.entries(relatedGames).map(([type, list]) => (
                                        <div key={type} className="space-y-2">
                                            <h4 className="text-xs uppercase tracking-wider text-zinc-500 font-bold">
                                                {type.replace('_', ' ')}
                                            </h4>
                                            <ul className="space-y-1">
                                                {list.map(g => {
                                                    const knownGame = knownGamesMap.get(String(g.id));

                                                    if (knownGame) {
                                                        return (
                                                            <li key={g.id} className="flex items-center justify-between gap-2">
                                                                <Link
                                                                    href={`/game/${knownGame.id}`}
                                                                    className="block text-sm font-medium hover:text-purple-600 dark:hover:text-purple-400 truncate transition-colors flex-1"
                                                                >
                                                                    {g.name}
                                                                </Link>
                                                                {knownGame.opencriticScore && (
                                                                    <Badge
                                                                        variant="outline"
                                                                        className={cn(
                                                                            "text-[10px] h-5 px-1.5 min-w-[32px] justify-center",
                                                                            knownGame.opencriticScore >= 84
                                                                                ? "border-green-500/30 text-green-600 bg-green-50/50 dark:bg-green-950/20"
                                                                                : knownGame.opencriticScore >= 74
                                                                                    ? "border-yellow-500/30 text-yellow-600 bg-yellow-50/50 dark:bg-yellow-950/20"
                                                                                    : "border-zinc-300 text-zinc-500 bg-zinc-100 dark:bg-zinc-800"
                                                                        )}
                                                                    >
                                                                        {knownGame.opencriticScore}
                                                                    </Badge>
                                                                )}
                                                            </li>
                                                        );
                                                    }

                                                    return (
                                                        <li key={g.id} className="text-sm text-zinc-600 dark:text-zinc-400 truncate">
                                                            {g.name}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>

                </div>
            </div>
        </div>
    );
}
