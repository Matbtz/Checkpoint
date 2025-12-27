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
import { X } from "lucide-react";

interface SearchFiltersProps {
    genres: string[];
    platforms: string[];
    selectedGenres: string[];
    selectedPlatforms: string[];
    minScore: number;
    onGenreChange: (genre: string) => void;
    onPlatformChange: (platform: string) => void;
    onMinScoreChange: (score: number) => void;
    onReset: () => void;
}

export function SearchFilters({
    genres,
    platforms,
    selectedGenres,
    selectedPlatforms,
    minScore,
    onGenreChange,
    onPlatformChange,
    onMinScoreChange,
    onReset
}: SearchFiltersProps) {
    return (
        <div className="flex flex-col gap-4 p-4 border rounded-lg bg-card/50 backdrop-blur-sm">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Filters</h3>
                <Button variant="ghost" size="sm" onClick={onReset} className="h-8 px-2 text-xs">
                    Reset
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Genres */}
                <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Genre</Label>
                    <Select
                        value={selectedGenres[0] || "all"}
                        onValueChange={(val) => onGenreChange(val === "all" ? "" : val)}
                    >
                        <SelectTrigger className="w-full text-xs h-9">
                            <SelectValue placeholder="All Genres" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Genres</SelectItem>
                            {genres.map(g => (
                                <SelectItem key={g} value={g}>{g}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Platforms */}
                <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Platform</Label>
                    <Select
                         value={selectedPlatforms[0] || "all"}
                         onValueChange={(val) => onPlatformChange(val === "all" ? "" : val)}
                    >
                        <SelectTrigger className="w-full text-xs h-9">
                            <SelectValue placeholder="All Platforms" />
                        </SelectTrigger>
                        <SelectContent>
                             <SelectItem value="all">All Platforms</SelectItem>
                            {platforms.map(p => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Score */}
                <div className="space-y-2">
                    <div className="flex justify-between">
                         <Label className="text-xs text-muted-foreground">Min Score</Label>
                         <span className="text-xs font-mono">{minScore}</span>
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

            {/* Active Filters Tags (Optional visual feedback) */}
            {(selectedGenres.length > 0 || selectedPlatforms.length > 0 || minScore > 0) && (
                <div className="flex flex-wrap gap-2 pt-2 border-t mt-2">
                    {selectedGenres.map(g => (
                        <div key={g} className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
                            {g}
                            <X className="w-3 h-3 cursor-pointer hover:text-primary/70" onClick={() => onGenreChange(g)} />
                        </div>
                    ))}
                    {selectedPlatforms.map(p => (
                        <div key={p} className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
                            {p}
                            <X className="w-3 h-3 cursor-pointer hover:text-primary/70" onClick={() => onPlatformChange(p)} />
                        </div>
                    ))}
                    {minScore > 0 && (
                        <div className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-full flex items-center gap-1">
                            Score &ge; {minScore}
                            <X className="w-3 h-3 cursor-pointer hover:text-primary/70" onClick={() => onMinScoreChange(0)} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
