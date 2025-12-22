'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { updateLibraryEntry } from '@/actions/library';
import { UserLibrary } from '@prisma/client';
import { Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { updateStatusAction } from '@/actions/game-page';

interface ActionBarProps {
  gameId: string;
  userLibrary: UserLibrary | null;
  isLoggedIn: boolean;
}

export function ActionBar({ gameId, userLibrary, isLoggedIn }: ActionBarProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // If no userLibrary entry, default status to nothing (or we can show "Add to Library")
  const [status, setStatus] = useState(userLibrary?.status || "");
  const [playtime, setPlaytime] = useState<string>(
      userLibrary?.playtimeManual
        ? (userLibrary.playtimeManual / 60).toFixed(1)
        : (userLibrary?.playtimeSteam ? (userLibrary.playtimeSteam / 60).toFixed(1) : "0")
  );

  // Track if values changed to show save button for playtime
  const initialPlaytime = userLibrary?.playtimeManual
    ? (userLibrary.playtimeManual / 60).toFixed(1)
    : (userLibrary?.playtimeSteam ? (userLibrary.playtimeSteam / 60).toFixed(1) : "0");

  const hasPlaytimeChanged = playtime !== initialPlaytime;

  if (!isLoggedIn) {
    return (
      <Button onClick={() => router.push(`/login?callbackUrl=/game/${gameId}`)}>
        Login to Track
      </Button>
    );
  }

  const handleStatusChange = async (newStatus: string) => {
    setLoading(true);
    try {
        // If there is no existing library entry, we need to create one.
        // updateLibraryEntry usually updates, but we need to check if it handles creation or if we need a separate action.
        // Checking `actions/library.ts`, `updateLibraryEntry` takes a libraryId.
        // If we don't have a library ID (userLibrary is null), we need to ADD the game first.

        // However, the action bar is simpler if we assume we use a "upsert" logic.
        // Let's check `actions/add-game.ts`. `addGame` adds a game to the library.
        // But `addGame` might require full game data if it's not in DB yet.
        // Here we are on the game page, so the game IS in the DB.

        // Let's rely on `updateLibraryEntry` if `userLibrary` exists.
        // If not, we might need to call `addGameExtended` or similar, but simpler:
        // Let's invoke a server action that handles "Ensure Library Entry".

        // Wait, `ActionBar` is a client component. I can't check server logic here easily without an action.
        // I will implement a small action wrapper in this file or use existing ones.

        // If userLibrary is null, we need to Add.
        if (!userLibrary) {
            // We need an action to "Add existing game to library".
            // `actions/add-game.ts` -> `addGameExtended` takes `EnrichedGameData` or similar.
            // Maybe there is a simpler `addToLibrary(gameId, status)`?

            // Let's use a new server action or a specific one if I find it.
            // I'll create `upsertLibraryEntry` in `actions/library.ts` later or use `updateLibraryEntry` if I can modify it to take gameId.
            // For now, let's assume I'll add a helper action.
             await updateStatusAction(gameId, newStatus);
        } else {
             await updateLibraryEntry(userLibrary.id, { status: newStatus });
        }

        setStatus(newStatus);
        router.refresh();
    } catch (error) {
        console.error("Failed to update status", error);
    } finally {
        setLoading(false);
    }
  };

  const handlePlaytimeSave = async () => {
      if (!userLibrary) return; // Should not happen if we are editing playtime (implies we are tracking)
      setLoading(true);
      try {
          const minutes = Math.round(parseFloat(playtime) * 60);
          await updateLibraryEntry(userLibrary.id, { playtimeManual: minutes });
          router.refresh();
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  // Helper action call (mock for now, will implement)
  // We need to implement `updateStatusAction` that handles both create and update.

  return (
    <div className="flex items-center justify-center gap-4 bg-white/10 backdrop-blur-md p-2 rounded-lg border border-white/20">
      <div className="flex items-center gap-2">
        <Label className="text-white text-xs font-medium">Status</Label>
        <Select value={status} onValueChange={handleStatusChange} disabled={loading}>
            <SelectTrigger className="w-[140px] bg-transparent border-white/20 text-white focus:ring-offset-0 focus:ring-white/20">
                <SelectValue placeholder="Add to..." />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value="Wishlist">Wishlist</SelectItem>
                <SelectItem value="Backlog">Backlog</SelectItem>
                <SelectItem value="Playing">Playing</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Abandoned">Abandoned</SelectItem>
            </SelectContent>
        </Select>
      </div>

      {status === 'Playing' && userLibrary && (
         <div className="flex items-center gap-2 border-l border-white/20 pl-4">
            <Label htmlFor="playtime" className="text-white text-xs font-medium">Hours</Label>
            <Input
                id="playtime"
                type="number"
                step="0.1"
                value={playtime}
                onChange={(e) => setPlaytime(e.target.value)}
                className="w-20 h-9 bg-black/20 border-white/20 text-white"
            />
            {hasPlaytimeChanged && (
                <Button size="icon" variant="ghost" className="h-9 w-9 text-white hover:bg-white/20" onClick={handlePlaytimeSave} disabled={loading}>
                    <Save className="h-4 w-4" />
                </Button>
            )}
         </div>
      )}
    </div>
  );
}

// TODO: Move this to a server action file if needed, but for now we can import.
// I will create `actions/game-page.ts` to handle the upsert logic.
