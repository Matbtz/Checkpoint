"use client";

import { StatusSelector } from "./StatusSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { updateManualPlayTime, addGameToLibrary, updateTargetedCompletion, updateOwnedPlatforms } from "@/actions/library";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Check } from "lucide-react";

interface ActionBarProps {
  gameId: string;
  userLibrary: any;
  isLoggedIn: boolean;
  gamePlatforms: string[];
}

export function ActionBar({ gameId, userLibrary, isLoggedIn, gamePlatforms }: ActionBarProps) {
  const [playtime, setPlaytime] = useState<string>("");
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  // Owned Platforms State
  const [ownedPlatforms, setOwnedPlatforms] = useState<string[]>([]);

  useEffect(() => {
    if (userLibrary) {
        setOwnedPlatforms(userLibrary.ownedPlatforms || []);
        if (userLibrary.playtimeManual) {
            setPlaytime((userLibrary.playtimeManual / 60).toString());
        } else if (userLibrary.playtimeSteam) {
            setPlaytime((userLibrary.playtimeSteam / 60).toString());
        } else {
            setPlaytime("");
        }
    }
  }, [userLibrary]);

  if (!isLoggedIn) {
    return (
      <Button
        variant="secondary"
        onClick={() => router.push("/login")}
        className="bg-white/10 hover:bg-white/20 text-white border border-white/10 backdrop-blur-md"
      >
        Login to Track
      </Button>
    );
  }

  const handleAddToLibrary = async () => {
    setAdding(true);
    try {
      await addGameToLibrary(gameId);
      toast.success("Game added to library");
      router.refresh();
    } catch (error) {
      toast.error("Failed to add game");
    } finally {
      setAdding(false);
    }
  };

  const handlePlaytimeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPlaytime(val);
  };

  const savePlaytime = async () => {
    if (!playtime) return;
    const hours = parseFloat(playtime);
    if (isNaN(hours)) return;

    try {
      await updateManualPlayTime(gameId, Math.round(hours * 60));
      toast.success("Playtime updated");
    } catch (error) {
      toast.error("Failed to update playtime");
    }
  };

  const togglePlatform = async (platform: string) => {
      const isOwned = ownedPlatforms.includes(platform);
      let newPlatforms = [...ownedPlatforms];

      if (isOwned) {
          newPlatforms = newPlatforms.filter(p => p !== platform);
      } else {
          newPlatforms.push(platform);
      }

      setOwnedPlatforms(newPlatforms); // Optimistic update

      try {
          await updateOwnedPlatforms(gameId, newPlatforms);
      } catch {
          toast.error("Failed to update platforms");
          setOwnedPlatforms(ownedPlatforms); // Revert
      }
  };

  if (!userLibrary) {
    return (
      <Button
        variant="secondary"
        onClick={handleAddToLibrary}
        disabled={adding}
        className="bg-white/10 hover:bg-white/20 text-white border border-white/10 backdrop-blur-md"
      >
        {adding ? "Adding..." : "Add to Library"}
      </Button>
    )
  }

  const handleCompletionChange = async (val: string) => {
    try {
        await updateTargetedCompletion(gameId, val);
        toast.success("Goal updated");
    } catch {
        toast.error("Failed to update goal");
    }
  };

  return (
    <div className="flex flex-col gap-4">
        {/* ROW 1: Controls (Status - Hours - Objective) */}
        <div className="flex items-end gap-3 flex-wrap">

            {/* 1. Status */}
            <div className="space-y-1">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider pl-1">Status</span>
                <StatusSelector gameId={gameId} currentStatus={userLibrary.status} />
            </div>

            {(userLibrary.status === "PLAYING" || userLibrary.status === "BACKLOG" || userLibrary.status === "COMPLETED") && (
                <>
                     {/* 2. Hours Played */}
                    <div className="space-y-1">
                         <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider pl-1">Hours</span>
                        <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-md px-2 h-10 backdrop-blur-md w-[100px]">
                            <Input
                                type="number"
                                value={playtime}
                                onChange={handlePlaytimeChange}
                                onBlur={savePlaytime}
                                className="w-full h-8 bg-transparent border-none text-white placeholder:text-white/50 focus-visible:ring-0 p-0 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                placeholder="0"
                                aria-label="Hours played"
                            />
                            <span className="text-sm text-white/70 font-medium">hrs</span>
                        </div>
                    </div>

                    {/* 3. Objective */}
                    <div className="space-y-1">
                        <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider pl-1">Objective</span>
                        <Select defaultValue={userLibrary.targetedCompletionType || "Main"} onValueChange={handleCompletionChange}>
                            <SelectTrigger
                                className="w-[130px] h-10 bg-white/10 border-white/20 text-white backdrop-blur-md"
                                aria-label="Select completion objective"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Main">Main Story</SelectItem>
                                <SelectItem value="Extra">Main + Extra</SelectItem>
                                <SelectItem value="100%">100% Completion</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </>
            )}
        </div>

        {/* ROW 2: Platforms (Pills) */}
        {(userLibrary.status === "PLAYING" || userLibrary.status === "BACKLOG" || userLibrary.status === "COMPLETED") && gamePlatforms && gamePlatforms.length > 0 && (
            <div className="space-y-1">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-wider pl-1">Game owned on</span>
                <div className="flex flex-wrap gap-2">
                    {gamePlatforms.map((platform) => {
                        const isOwned = ownedPlatforms.includes(platform);
                        return (
                            <button
                                key={platform}
                                onClick={() => togglePlatform(platform)}
                                aria-pressed={isOwned}
                                aria-label={`Toggle ownership for ${platform}`}
                                className={`
                                    px-3 py-1 rounded-full text-xs font-medium border transition-all duration-200 flex items-center gap-1.5
                                    ${isOwned
                                        ? "bg-white text-black border-white hover:bg-white/90"
                                        : "bg-transparent text-white/60 border-white/20 hover:border-white/40 hover:text-white"
                                    }
                                `}
                            >
                                {isOwned && <Check className="w-3 h-3" />}
                                {platform}
                            </button>
                        )
                    })}
                </div>
            </div>
        )}
    </div>
  );
}
