"use client";

import { StatusSelector } from "./StatusSelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { updateManualPlayTime, addGameToLibrary } from "@/actions/library";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface ActionBarProps {
  gameId: string;
  userLibrary: any; // Using any to avoid complex type matching, but should be UserLibrary
  isLoggedIn: boolean;
}

export function ActionBar({ gameId, userLibrary, isLoggedIn }: ActionBarProps) {
  const [playtime, setPlaytime] = useState<string>("");
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (userLibrary?.playtimeManual) {
        setPlaytime((userLibrary.playtimeManual / 60).toString());
    } else {
        setPlaytime("");
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

  return (
    <div className="flex items-center gap-3">
      <StatusSelector gameId={gameId} currentStatus={userLibrary.status} />

      {userLibrary.status === "PLAYING" && (
        <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-md px-3 py-1 backdrop-blur-md">
          <Input
            type="number"
            value={playtime}
            onChange={handlePlaytimeChange}
            onBlur={savePlaytime}
            className="w-16 h-8 bg-transparent border-none text-white placeholder:text-white/50 focus-visible:ring-0 p-0 text-right"
            placeholder="0"
          />
          <span className="text-sm text-white/70 font-medium">hrs</span>
        </div>
      )}
    </div>
  );
}
