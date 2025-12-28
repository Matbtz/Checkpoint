import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ScoreBadge } from "@/components/game/ScoreBadge";
import { HLTBCard } from "@/components/game/HLTBCard";
import { ActionBar } from "@/components/game/ActionBar";
import { MediaGallery } from "@/components/game/MediaGallery";
import { RefreshButton } from "@/components/game/RefreshButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Calendar, Building2 } from "lucide-react";
import { format } from "date-fns";

export default async function GameDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const userId = session?.user?.id;

  const game = await prisma.game.findUnique({
    where: { id },
    include: {
      users: {
        where: { userId: userId ?? "" }, // Prevent fetching all users if not logged in
      },
    },
  });

  if (!game) {
    notFound();
  }

  const userLibrary = (game as any).users?.[0] || null;

  // Parse platforms if they are stored as JSON
  let platforms: { name: string }[] = [];
  if (game.platforms && Array.isArray(game.platforms)) {
      platforms = game.platforms as { name: string }[];
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

  // Prepare fallback for cover image
  const coverImage = game.coverImage || "/placeholder-game.png"; // You might want a real placeholder
  const backgroundImage = game.backgroundImage || coverImage;

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
            <div className="shrink-0 w-48 md:w-64 lg:w-72 aspect-[3/4] rounded-lg shadow-2xl overflow-hidden border-4 border-white/10 relative transform translate-y-8 md:translate-y-0">
                <Image
                    src={coverImage}
                    alt={`${game.title} cover`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 200px, 300px"
                    priority
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
                            </div>
                        )}
                    </div>
                </div>

                <div className="w-full flex justify-center md:justify-start">
                  <ActionBar
                      gameId={game.id}
                      userLibrary={userLibrary}
                      isLoggedIn={!!session}
                  />
                </div>
            </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="container mx-auto px-4 py-8 md:py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">

            {/* Left Column (Details & Media) */}
            <div className="md:col-span-2 space-y-10">
                {/* About Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-2xl font-bold">About</h2>
                        {game.dataMissing && (
                            <RefreshButton gameId={game.id} gameTitle={game.title} />
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

                {/* Media Gallery */}
                <MediaGallery screenshots={game.screenshots} videos={game.videos} />
            </div>

            {/* Right Column (Stats Stack) */}
            <div className="space-y-6">

                {/* Time To Beat */}
                <HLTBCard
                    hltbMain={game.hltbMain}
                    hltbExtra={game.hltbExtra}
                    hltbCompletionist={game.hltbCompletionist}
                    userPlaytime={userLibrary?.playtimeManual || userLibrary?.playtimeSteam}
                />

                {/* Ratings Card */}
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 space-y-4 shadow-sm">
                    <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        Ratings & Info
                    </h3>

                    <div className="flex flex-wrap gap-2">
                        {game.opencriticScore && (
                            <ScoreBadge score={game.opencriticScore} type="opencritic" />
                        )}
                        {game.igdbScore && (
                            <ScoreBadge score={game.igdbScore} type="igdb" />
                        )}
                        {game.steamReviewScore && (
                            <Badge variant="secondary" className="bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                                Steam: {game.steamReviewScore}
                            </Badge>
                        )}
                    </div>

                    {/* Metadata */}
                    <div className="space-y-4 pt-2">
                         {genres.length > 0 && (
                            <div className="space-y-2">
                                <span className="text-xs font-medium text-zinc-500 uppercase">Genres</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {genres.map((g) => (
                                        <Badge key={g} variant="outline" className="text-xs">{g}</Badge>
                                    ))}
                                </div>
                            </div>
                         )}

                         {platforms.length > 0 && (
                            <div className="space-y-2">
                                <span className="text-xs font-medium text-zinc-500 uppercase">Platforms</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {platforms.map((p, i) => (
                                        <Badge key={i} variant="outline" className="text-xs bg-zinc-50 dark:bg-zinc-900">{p.name}</Badge>
                                    ))}
                                </div>
                            </div>
                         )}
                    </div>

                    {/* External Links */}
                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 mt-4">
                        {game.steamUrl && (
                            <Button variant="ghost" size="icon" asChild title="Steam Store">
                                <a href={game.steamUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="w-4 h-4" />
                                </a>
                            </Button>
                        )}
                        {game.igdbUrl && (
                             <Button variant="ghost" size="icon" asChild title="IGDB">
                                <a href={game.igdbUrl} target="_blank" rel="noopener noreferrer">
                                    <span className="font-bold text-xs">IGDB</span>
                                </a>
                            </Button>
                        )}
                        {game.opencriticUrl && (
                             <Button variant="ghost" size="icon" asChild title="OpenCritic">
                                <a href={game.opencriticUrl} target="_blank" rel="noopener noreferrer">
                                    <span className="font-bold text-xs">OC</span>
                                </a>
                            </Button>
                        )}
                    </div>
                </div>

            </div>

        </div>
      </div>
    </div>
  );
}
