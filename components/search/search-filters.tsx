'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, X, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";

interface SearchFiltersProps {
    genres: string[];
    platforms: string[];
    selectedGenres: string[];
    selectedPlatforms: string[];
    minScore: number;
    sortBy: string;
    releaseYear?: number;
    releaseDateModifier?: string;
    onGenreChange: (genre: string) => void; // Expects to toggle specific genre
    onPlatformChange: (platform: string) => void; // Expects to toggle specific platform
    onMinScoreChange: (score: number) => void;
    onSortChange: (sort: string) => void;
    onReleaseYearChange: (year: number | undefined) => void;
    onReleaseDateModifierChange: (modifier: string) => void;
    onReset: () => void;
}

export function SearchFilters({
    genres,
    platforms,
    selectedGenres,
    selectedPlatforms,
    minScore,
    sortBy,
    releaseYear,
    releaseDateModifier,
    onGenreChange,
    onPlatformChange,
    onMinScoreChange,
    onSortChange,
    onReleaseYearChange,
    onReleaseDateModifierChange,
    onReset
}: SearchFiltersProps) {
    const [isOpen, setIsOpen] = React.useState(true);

    return (
        <div className="border rounded-lg bg-card/50 backdrop-blur-sm overflow-hidden">
             <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <h3 className="text-sm font-semibold flex items-center gap-2">
                    Filters
                    {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </h3>
                {(selectedGenres.length > 0 || selectedPlatforms.length > 0 || minScore > 0 || releaseYear) && (
                     <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onReset(); }} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
                        Reset
                    </Button>
                )}
            </div>

            {isOpen && (
                <div className="p-4 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 animate-in slide-in-from-top-2 duration-200">

                    {/* Sort By */}
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Sort By</Label>
                        <Select
                            value={sortBy}
                            onValueChange={onSortChange}
                        >
                            <SelectTrigger className="w-full text-xs h-9">
                                <SelectValue placeholder="Sort By" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="rating">Rating</SelectItem>
                                <SelectItem value="release">Release Date</SelectItem>
                                <SelectItem value="popularity">Popularity</SelectItem>
                                <SelectItem value="alphabetical">Alphabetical</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Genres Multi-Select */}
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Genres</Label>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between h-9 text-xs px-3 font-normal"
                                >
                                    {selectedGenres.length === 0
                                        ? "All Genres"
                                        : `${selectedGenres.length} selected`}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[200px] p-0" align="start">
                                <ScrollArea className="h-[300px] p-2">
                                    <div className="space-y-1">
                                        {genres.map((genre) => (
                                            <div
                                                key={genre}
                                                className="flex items-center space-x-2 rounded-sm px-2 py-1.5 hover:bg-accent hover:text-accent-foreground"
                                            >
                                                <Checkbox
                                                    id={`genre-${genre}`}
                                                    checked={selectedGenres.includes(genre)}
                                                    onCheckedChange={() => onGenreChange(genre)}
                                                />
                                                <label
                                                    htmlFor={`genre-${genre}`}
                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer w-full pl-2"
                                                >
                                                    {genre}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Platforms Multi-Select */}
                    <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Platforms</Label>
                         <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between h-9 text-xs px-3 font-normal"
                                >
                                    {selectedPlatforms.length === 0
                                        ? "All Platforms"
                                        : `${selectedPlatforms.length} selected`}
                                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[200px] p-0" align="start">
                                <ScrollArea className="h-[300px] p-2">
                                    <div className="space-y-1">
                                        {platforms.map((platform) => (
                                            <div
                                                key={platform}
                                                className="flex items-center space-x-2 rounded-sm px-2 py-1.5 hover:bg-accent hover:text-accent-foreground"
                                            >
                                                <Checkbox
                                                    id={`platform-${platform}`}
                                                    checked={selectedPlatforms.includes(platform)}
                                                    onCheckedChange={() => onPlatformChange(platform)}
                                                />
                                                <label
                                                    htmlFor={`platform-${platform}`}
                                                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer w-full pl-2"
                                                >
                                                    {platform}
                                                </label>
                                            </div>
                                        ))}
                                    </div>
                                </ScrollArea>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Release Range */}
                    <div className="space-y-2">
                         <Label className="text-xs text-muted-foreground">Release Range</Label>
                         <Select
                            value={releaseDateModifier || "any"}
                            onValueChange={(val) => onReleaseDateModifierChange(val === "any" ? "" : val)}
                        >
                            <SelectTrigger className="w-full text-xs h-9">
                                <SelectValue placeholder="Time Period" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="any">Any Time</SelectItem>
                                <SelectItem value="this_month">This Month</SelectItem>
                                <SelectItem value="last_month">Last Month</SelectItem>
                                <SelectItem value="next_month">Next Month</SelectItem>
                                <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                                <SelectItem value="last_2_months">Last 2 Months</SelectItem>
                                <SelectItem value="next_2_months">Next 2 Months</SelectItem>
                                <SelectItem value="this_year">This Year</SelectItem>
                                <SelectItem value="next_year">Next Year</SelectItem>
                                <SelectItem value="past_year">Past Year</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Specific Year */}
                    <div className="space-y-2">
                         <Label className="text-xs text-muted-foreground">Specific Year</Label>
                         <Input
                            type="number"
                            placeholder="e.g. 2023"
                            className="h-9 text-xs"
                            min={1950}
                            max={new Date().getFullYear() + 5}
                            value={releaseYear || ''}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                onReleaseYearChange(isNaN(val) ? undefined : val);
                            }}
                         />
                    </div>

                    {/* Score */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center h-[24px]">
                             <Label className="text-xs text-muted-foreground">Min Score</Label>
                             <span className="text-xs font-mono">{minScore > 0 ? minScore : 'Any'}</span>
                        </div>
                        <Slider
                            value={[minScore]}
                            min={0}
                            max={100}
                            step={5}
                            onValueChange={(vals) => onMinScoreChange(vals[0])}
                            className="py-2"
                        />
                    </div>
                </div>
            )}

            {/* Active Filters Tags */}
            {isOpen && (selectedGenres.length > 0 || selectedPlatforms.length > 0 || minScore > 0 || releaseYear) && (
                <div className="flex flex-wrap gap-2 px-4 pb-4 border-t pt-2 bg-zinc-50/50 dark:bg-zinc-900/20">
                    {selectedGenres.map(g => (
                        <div key={g} className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-full flex items-center gap-1 border border-primary/20">
                            {g}
                            <X className="w-3 h-3 cursor-pointer hover:text-primary/70" onClick={() => onGenreChange(g)} />
                        </div>
                    ))}
                    {selectedPlatforms.map(p => (
                        <div key={p} className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-full flex items-center gap-1 border border-primary/20">
                            {p}
                            <X className="w-3 h-3 cursor-pointer hover:text-primary/70" onClick={() => onPlatformChange(p)} />
                        </div>
                    ))}
                     {releaseYear && (
                        <div className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-full flex items-center gap-1 border border-primary/20">
                            Year: {releaseYear}
                            <X className="w-3 h-3 cursor-pointer hover:text-primary/70" onClick={() => onReleaseYearChange(undefined)} />
                        </div>
                    )}
                    {minScore > 0 && (
                        <div className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-full flex items-center gap-1 border border-primary/20">
                            Score &ge; {minScore}
                            <X className="w-3 h-3 cursor-pointer hover:text-primary/70" onClick={() => onMinScoreChange(0)} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
