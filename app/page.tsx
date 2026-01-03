import Image from "next/image";
import Link from "next/link";
import { auth } from "@/auth";
import {
    getCachedDiscoveryGames,
    getMostAnticipatedGames
} from "@/actions/discovery";
import { getUserPlatforms } from "@/actions/user";
import { TopRatedGames } from "@/components/discovery/TopRatedGames";
import { DiscoverySection } from "@/components/discovery/DiscoverySection";
import { RecommendationSection } from "@/components/dashboard/RecommendationSection";
import { Game } from "@prisma/client";
import { Button } from "@/components/ui/button";

export default async function Home() {
    const session = await auth();

    // Parallel data fetching
    const [
        topRatedGames,
        recentReleases,
        upcomingGames,
        mostAnticipatedGames,
        recentlyReviewedGames,
        userPlatforms
    ] = await Promise.all([
        getCachedDiscoveryGames('TOP_RATED'),
        getCachedDiscoveryGames('RECENT'),
        getCachedDiscoveryGames('UPCOMING'),
        getMostAnticipatedGames(),
        getCachedDiscoveryGames('RECENTLY_REVIEWED'),
        getUserPlatforms()
    ]);

    // Filtering Logic
    // If user has platforms selected, filter the discovery lists (except Top Rated)
    const hasPlatformFilter = userPlatforms.length > 0;

    const filterGamesByPlatform = (games: Game[]) => {
        if (!hasPlatformFilter) return games.slice(0, 10);

        return games.filter(game => {
            if (!game.platforms) return false; // If no platform info, maybe exclude? Or include? strict: exclude.
            try {
                // Game.platforms is a JSON string: [{ name: "Switch" }, { name: "PC" }]
                const gamePlatforms = JSON.parse(game.platforms as string) as { name: string }[];
                // Check if ANY of the game platforms match ANY of the user platforms
                // User platforms: ["PC", "PlayStation 5"]
                // Game platforms: ["PC (Microsoft Windows)"] - we need partial match or normalized match?
                // The SettingsClient uses specific names. IGDB returns specific names.
                // Let's rely on loose matching for now.
                return gamePlatforms.some(gp =>
                    userPlatforms.some(up => gp.name.toLowerCase().includes(up.toLowerCase()) || up.toLowerCase().includes(gp.name.toLowerCase()))
                );
            } catch (e) {
                return false;
            }
        }).slice(0, 10);
    };

    const filteredRecent = filterGamesByPlatform(recentReleases);
    const filteredUpcoming = filterGamesByPlatform(upcomingGames);
    const filteredAnticipated = filterGamesByPlatform(mostAnticipatedGames);
    const filteredRecentlyReviewed = filterGamesByPlatform(recentlyReviewedGames);

    // Determine Hero Game (Use #1 Top Rated or fallback)
    const isTopRated = topRatedGames.length > 0;
    const heroGame: Game | null = isTopRated ? topRatedGames[0] : (recentReleases[0] || null);

    const heroImage = heroGame?.backgroundImage || heroGame?.coverImage;

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 font-sans">

            {/* Hero Section */}
            <section className="relative h-[500px] w-full overflow-hidden">
                {heroGame ? (
                    <>
                        <div className="absolute inset-0 bg-zinc-900">
                            {heroImage ? (
                                <Image
                                    src={heroImage}
                                    alt={heroGame.title}
                                    fill
                                    className="object-cover"
                                    priority
                                />
                            ) : (
                                // Fallback background if no image exists
                                <div className="absolute inset-0 bg-zinc-900" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-zinc-50 dark:from-zinc-950 via-transparent to-black/30" />
                            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
                        </div>

                        <div className="relative z-10 container mx-auto flex h-full flex-col justify-end pb-12 px-4 md:px-6">
                            <div className="max-w-2xl space-y-4">
                                <div className="flex items-center gap-2">
                                    {isTopRated && heroGame.opencriticScore && (
                                        <span className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-3 py-1 text-sm font-bold text-white shadow-lg">
                                            Top Rated #{1}
                                        </span>
                                    )}
                                    <span className="inline-flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/20 px-3 py-1 text-sm font-medium text-white shadow-lg">
                                        {heroGame.studio || 'Unknown Studio'}
                                    </span>
                                </div>

                                <h1 className="text-4xl md:text-6xl font-black text-white drop-shadow-lg tracking-tight leading-none">
                                    {heroGame.title}
                                </h1>

                                <p className="line-clamp-3 text-lg text-zinc-200 drop-shadow-md max-w-xl">
                                    {heroGame.description}
                                </p>

                                <div className="flex gap-4 pt-4">
                                    {session ? (
                                        <Link href="/library">
                                            <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                                                Go to Library
                                            </Button>
                                        </Link>
                                    ) : (
                                        <div className="flex gap-4">
                                            <Link href="/login">
                                                <Button size="lg" className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                                                    Sign In
                                                </Button>
                                            </Link>
                                            <Link href="/register">
                                                <Button size="lg" variant="outline" className="bg-transparent text-white border-white hover:bg-white/20">
                                                    Register
                                                </Button>
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex h-full items-center justify-center bg-zinc-900 text-zinc-500">
                        <div className="text-center">
                            <h1 className="text-4xl font-bold mb-4">Welcome to Game Library</h1>
                            <p>Start importing games to see them here.</p>
                            <div className="mt-8 flex justify-center gap-4">
                                {session ? (
                                    <Link href="/library">
                                        <Button>Go to Library</Button>
                                    </Link>
                                ) : (
                                    <Link href="/login">
                                        <Button>Sign In</Button>
                                    </Link>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </section>

            {/* Discovery Sections */}
            <main className="container mx-auto px-4 py-12 space-y-16 md:px-6">

                {/* Daily Recommendations (Authenticated Only) */}
                {session && (
                    <RecommendationSection />
                )}

                {/* Top Rated Section (with Client Filter) */}
                <section>
                    <TopRatedGames games={topRatedGames} />
                </section>

                {/* Recently Reviewed */}
                <section>
                    <DiscoverySection
                        title="Recently Reviewed"
                        games={filteredRecentlyReviewed}
                        viewMoreHref="/search?minScore=80&sortBy=release"
                    />
                </section>

                {/* Other Sections */}
                <section>
                    <DiscoverySection
                        title="Recent Releases"
                        games={filteredRecent}
                        viewMoreHref="/search?releaseDateModifier=last_2_months&sortBy=release"
                    />
                </section>

                <section>
                    <DiscoverySection
                        title="Upcoming Games"
                        games={filteredUpcoming}
                        viewMoreHref="/search?releaseDateModifier=next_2_months&sortBy=release_asc"
                    />
                </section>

                <section>
                    <DiscoverySection
                        title="Most Anticipated"
                        games={filteredAnticipated}
                        viewMoreHref="/search?releaseDateModifier=next_year&sortBy=popularity"
                    />
                </section>

            </main>

            {/* Footer / Status */}
            <footer className="border-t border-zinc-200 dark:border-zinc-800 py-12 bg-white dark:bg-black">
                <div className="container mx-auto px-4 text-center text-zinc-500 text-sm">
                    <p>&copy; {new Date().getFullYear()} Game Library Manager. All rights reserved.</p>
                </div>
            </footer>

        </div>
    );
}
