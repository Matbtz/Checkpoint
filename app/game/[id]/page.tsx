import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { ActionBar } from '@/components/game/action-bar';
import { HLTBCard } from '@/components/game/hltb-card';
import { ScoreBadge } from '@/components/game/score-badge';
import { MediaGallery } from '@/components/game/media-gallery';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Gamepad2, Globe, ExternalLink } from 'lucide-react';
import { RefreshButton } from '@/components/game/refresh-button';

export default async function GamePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth();
  const userId = session?.user?.id;

  const game = await prisma.game.findUnique({
    where: { id: params.id },
    include: {
      users: userId ? {
        where: { userId }
      } : false
    }
  });

  if (!game) {
    notFound();
  }

  const userLibrary = game.users?.[0] || null;
  const releaseYear = game.releaseDate ? new Date(game.releaseDate).getFullYear() : null;

  // Parse Metadata
  const genres = game.genres ? JSON.parse(game.genres) : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platforms: any[] = Array.isArray(game.platforms) ? game.platforms as any[] : [];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black text-zinc-900 dark:text-zinc-100 pb-20">

      {/* Hero Section */}
      <div className="relative w-full h-[50vh] min-h-[400px] lg:h-[60vh]">
        {/* Background Image with Gradient */}
        <div className="absolute inset-0">
            {game.backgroundImage ? (
                <Image
                    src={game.backgroundImage}
                    alt="Background"
                    fill
                    className="object-cover"
                    priority
                />
            ) : (
                <div className="w-full h-full bg-zinc-900" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/60 to-black/30" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
        </div>

        {/* Hero Content */}
        <div className="absolute bottom-0 left-0 w-full p-6 md:p-12 lg:px-24 flex flex-col md:flex-row gap-8 items-center md:items-end z-10">

            {/* Poster */}
            <div className="relative w-[140px] md:w-[200px] aspect-[3/4] rounded-lg shadow-2xl overflow-hidden border-2 border-white/10 shrink-0 hidden md:block">
                 <Image
                    src={game.coverImage || '/placeholder.png'}
                    alt={game.title}
                    fill
                    className="object-cover"
                    priority
                />
            </div>

            {/* Info & Actions */}
            <div className="flex-1 space-y-4 mb-4 text-left">
                <div className="space-y-1">
                    <h1 className="text-4xl md:text-6xl font-black tracking-tight text-white drop-shadow-xl">{game.title}</h1>
                    <div className="flex items-center justify-start gap-3 text-lg text-zinc-300 font-medium">
                        {game.studio && <span>{game.studio}</span>}
                        {game.studio && releaseYear && <span>•</span>}
                        {releaseYear && <span>{releaseYear}</span>}
                    </div>
                </div>

                <div className="pt-2 flex flex-wrap gap-4 items-center justify-start">
                    <ActionBar
                        gameId={game.id}
                        userLibrary={userLibrary}
                        isLoggedIn={!!session}
                    />
                    {game.dataMissing && (
                         <RefreshButton gameId={game.id} gameTitle={game.title} />
                    )}
                </div>
            </div>

            {/* Mobile Poster (Shown differently if needed, but keeping it clean for now, maybe small thumbnail next to title?) */}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="container mx-auto px-6 md:px-12 lg:px-24 -mt-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* Left Column (Details) */}
            <div className="lg:col-span-2 space-y-12 pt-8">

                {/* About */}
                <section className="space-y-4">
                    <h2 className="text-2xl font-bold">About</h2>
                    <div className="prose dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-300 leading-relaxed">
                        <p>{game.description || "No description available."}</p>
                    </div>
                </section>

                {/* Media */}
                <section>
                    <MediaGallery
                        screenshots={game.screenshots}
                        videos={game.videos}
                        title={game.title}
                    />
                </section>
            </div>

            {/* Right Column (Stats Stack) */}
            <div className="space-y-6">

                {/* Time To Beat */}
                <HLTBCard
                    hltbMain={game.hltbMain}
                    hltbExtra={game.hltbExtra}
                    hltbCompletionist={game.hltbCompletionist}
                    userPlaytimeMinutes={userLibrary?.playtimeManual || userLibrary?.playtimeSteam}
                />

                {/* Ratings */}
                <div className="grid grid-cols-1 gap-3">
                    <ScoreBadge
                        source="opencritic"
                        score={game.opencriticScore}
                        label="OpenCritic"
                        icon={Globe}
                    />
                     {/* Steam Score is stored as string "Very Positive" etc or null, need to parse if we want number,
                         but schema says `steamReviewScore` String. Wait, schema has `steamReviewPercent` Int?
                         Let's check schema again. `steamReviewPercent` is Int. `steamReviewScore` is text description.
                     */}
                    <ScoreBadge
                        source="steam"
                        score={game.steamReviewPercent}
                        label={game.steamReviewScore || "Steam"}
                        icon={Gamepad2}
                    />
                </div>

                {/* Metadata */}
                <div className="space-y-4 p-4 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
                    <div>
                        <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Genres</h4>
                        <div className="flex flex-wrap gap-2">
                            {genres.map((g: string) => (
                                <Badge key={g} variant="secondary" className="bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700">
                                    {g}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h4 className="text-xs font-bold uppercase text-muted-foreground mb-2">Platforms</h4>
                        <div className="flex flex-wrap gap-2">
                             {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                             {platforms.map((p: any) => {
                                 const name = typeof p === 'string' ? p : p.name;
                                 return (
                                    <Badge key={name} variant="outline" className="border-zinc-300 dark:border-zinc-700">
                                        {name}
                                    </Badge>
                                 );
                             })}
                        </div>
                    </div>
                </div>

                {/* Links */}
                <div className="flex gap-2 justify-start">
                    {game.steamUrl && (
                        <Button variant="outline" size="sm" asChild>
                            <a href={game.steamUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                                <Gamepad2 className="w-4 h-4" /> Steam
                            </a>
                        </Button>
                    )}
                    {game.igdbUrl && (
                        <Button variant="outline" size="sm" asChild>
                            <a href={game.igdbUrl} target="_blank" rel="noopener noreferrer" className="gap-2">
                                <ExternalLink className="w-4 h-4" /> IGDB
                            </a>
                        </Button>
                    )}
                </div>

            </div>
        </div>
      </div>
    </div>
  );
}
