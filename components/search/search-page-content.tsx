'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Loader2, Globe } from 'lucide-react';
import { useDebounce } from '@/hooks/use-debounce';
import { searchLocalGames, searchOnlineGames, SearchResult } from '@/actions/search';
import { getFilterOptions, FilterOptions } from '@/actions/filters';
import { SearchFilters } from './search-filters';
import { SearchResultCard } from './search-result-card';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';

export function SearchPageContent() {
    const searchParams = useSearchParams();
    const [query, setQuery] = React.useState('');
    const [results, setResults] = React.useState<SearchResult[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [filterOptions, setFilterOptions] = React.useState<FilterOptions>({ genres: [], platforms: [] });

    // Filters State
    const [selectedGenres, setSelectedGenres] = React.useState<string[]>([]);
    const [selectedPlatforms, setSelectedPlatforms] = React.useState<string[]>([]);
    const [minScore, setMinScore] = React.useState(0);

    const [isExtendedSearch, setIsExtendedSearch] = React.useState(false);

    const debouncedQuery = useDebounce(query, 500);
    const debouncedMinScore = useDebounce(minScore, 500);

    // Initialize from URL search params
    React.useEffect(() => {
        const genreParam = searchParams.get('genre');
        if (genreParam) {
            setSelectedGenres([genreParam]);
        }

        const platformParam = searchParams.get('platform');
        if (platformParam) {
            setSelectedPlatforms([platformParam]);
        }
    }, [searchParams]);

    // Fetch Filter Options on Mount
    React.useEffect(() => {
        getFilterOptions().then(setFilterOptions);
    }, []);

    // Perform Search
    React.useEffect(() => {
        const fetchResults = async () => {
            setLoading(true);
            try {
                const filters = {
                    genres: selectedGenres,
                    platforms: selectedPlatforms,
                    minScore: debouncedMinScore > 0 ? debouncedMinScore : undefined
                };

                let data: SearchResult[] = [];
                if (isExtendedSearch && debouncedQuery.length > 2) {
                     data = await searchOnlineGames(debouncedQuery, filters);
                } else {
                     if (debouncedQuery.length > 0) {
                        data = await searchLocalGames(debouncedQuery, filters);
                     }
                }
                setResults(data);
            } catch (error) {
                console.error("Search failed", error);
                toast.error("Search failed");
            } finally {
                setLoading(false);
            }
        };

        fetchResults();
    }, [debouncedQuery, selectedGenres, selectedPlatforms, debouncedMinScore, isExtendedSearch]);

    const handleExtendedSearch = () => {
        setIsExtendedSearch(true);
    };

    const handleResetFilters = () => {
        setSelectedGenres([]);
        setSelectedPlatforms([]);
        setMinScore(0);
        setIsExtendedSearch(false);
    };

    const toggleGenre = (g: string) => {
        if (!g) return;
        setSelectedGenres([g]);
    };

    const togglePlatform = (p: string) => {
        if (!p) return;
        setSelectedPlatforms([p]);
    };

    return (
        <div className="space-y-6">
            {/* Header / Search Bar */}
            <div className="flex flex-col gap-4">
                <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search games..."
                        className="pl-9 h-10 text-base"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            if (e.target.value === '') {
                                setIsExtendedSearch(false);
                                setResults([]);
                            }
                        }}
                    />
                </div>

                <SearchFilters
                    genres={filterOptions.genres}
                    platforms={filterOptions.platforms}
                    selectedGenres={selectedGenres}
                    selectedPlatforms={selectedPlatforms}
                    minScore={minScore}
                    onGenreChange={toggleGenre}
                    onPlatformChange={togglePlatform}
                    onMinScoreChange={setMinScore}
                    onReset={handleResetFilters}
                />
            </div>

            {/* Results */}
            <div className="min-h-[200px]">
                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : (
                    <>
                        {results.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {results.map(game => (
                                    <SearchResultCard key={game.id} game={game} />
                                ))}
                            </div>
                        ) : (
                            debouncedQuery.length > 0 && (
                                <div className="text-center py-12 text-muted-foreground">
                                    <p>No local results found.</p>
                                    {!isExtendedSearch && (
                                        <div className="mt-4">
                                            <Button onClick={handleExtendedSearch} variant="outline">
                                                <Globe className="w-4 h-4 mr-2" />
                                                Search Online (IGDB)
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )
                        )}

                        {/* Extended Search Option */}
                        {results.length > 0 && !isExtendedSearch && (
                            <div className="flex justify-center pt-8 pb-4">
                                <Button variant="secondary" onClick={handleExtendedSearch} className="w-full md:w-auto">
                                    <Globe className="w-4 h-4 mr-2" />
                                    Search Online for &quot;{query}&quot;
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
