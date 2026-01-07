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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Monitor, Smartphone, Gamepad2 } from "lucide-react";

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
  const [openPlatforms, setOpenPlatforms] = useState(false);

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

  const handlePlatformToggle = async (platform: string, checked: boolean) => {
      let newPlatforms = [...ownedPlatforms];
      if (checked) {
          if (!newPlatforms.includes(platform)) newPlatforms.push(platform);
      } else {
          newPlatforms = newPlatforms.filter(p => p !== platform);
      }
      setOwnedPlatforms(newPlatforms);
      try {
          await updateOwnedPlatforms(gameId, newPlatforms);
      } catch {
          toast.error("Failed to update platforms");
          // Revert on error?
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

  // Determine icon for platforms button
  const PlatformIcon = ownedPlatforms.length > 0 ? Check : Monitor; // Or generic
  // Actually let's use a generic icon like Gamepad2 or Monitor

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <StatusSelector gameId={gameId} currentStatus={userLibrary.status} />

      {(userLibrary.status === "PLAYING" || userLibrary.status === "BACKLOG" || userLibrary.status === "COMPLETED") && (
          <>
            <Select defaultValue={userLibrary.targetedCompletionType || "Main"} onValueChange={handleCompletionChange}>
                <SelectTrigger className="w-[140px] h-10 bg-white/10 border-white/20 text-white backdrop-blur-md">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="Main">Main Story</SelectItem>
                    <SelectItem value="Extra">Main + Extra</SelectItem>
                    <SelectItem value="100%">100% Completion</SelectItem>
                </SelectContent>
            </Select>

            {/* Owned Platforms Popover */}
            <Popover open={openPlatforms} onOpenChange={setOpenPlatforms}>
                <PopoverTrigger asChild>
                    <Button variant="secondary" className="h-10 px-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-md gap-2">
                        <Monitor className="w-4 h-4" />
                        <span className="text-xs">{ownedPlatforms.length > 0 ? `${ownedPlatforms.length} Owned` : "Platforms"}</span>
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2 bg-zinc-900 border-zinc-800 text-white" align="start">
                    <div className="space-y-2">
                        <h4 className="font-medium text-xs text-zinc-400 mb-2 uppercase tracking-wider px-1">Owned On</h4>
                        {gamePlatforms && gamePlatforms.length > 0 ? gamePlatforms.map(p => (
                            <div key={p} className="flex items-center gap-2 hover:bg-zinc-800 p-1.5 rounded transition-colors">
                                <Checkbox
                                    id={`ab-op-${p}`}
                                    checked={ownedPlatforms.includes(p)}
                                    onCheckedChange={(c) => handlePlatformToggle(p, c === true)}
                                    className="border-zinc-600 data-[state=checked]:bg-purple-600 data-[state=checked]:border-purple-600"
                                />
                                <Label htmlFor={`ab-op-${p}`} className="text-sm cursor-pointer flex-1">{p}</Label>
                            </div>
                        )) : <div className="text-xs text-zinc-500 italic p-2">No platforms data.</div>}
                    </div>
                </PopoverContent>
            </Popover>
          </>
      )}

      {(userLibrary.status === "PLAYING" || userLibrary.status === "COMPLETED") && (
        <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-md px-3 h-10 backdrop-blur-md">
          <Input
            type="number"
            value={playtime}
            onChange={handlePlaytimeChange}
            onBlur={savePlaytime}
            className="w-16 h-8 bg-transparent border-none text-white placeholder:text-white/50 focus-visible:ring-0 p-0 text-right [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            placeholder="0"
          />
          <span className="text-sm text-white/70 font-medium">hrs</span>
        </div>
      )}
    </div>
  );
}

// Icon import helper
import { Check } from "lucide-react";
