'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { updateLibraryEntry, fixGameMatch } from '@/actions/library';
import { assignTag, removeTag, getUserTags } from '@/actions/tag';
import { Game, UserLibrary, Tag } from '@prisma/client';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

type GameWithLibrary = UserLibrary & { game: Game; tags?: Tag[] };

interface UpdateData {
  status?: string;
  targetedCompletionType?: string;
  playtimeManual?: number;
}

function TagBadge({ tag, initiallySelected, libraryId }: { tag: Tag; initiallySelected: boolean; libraryId: string }) {
    const [isSelected, setIsSelected] = useState(initiallySelected);
    const [loading, setLoading] = useState(false);

    const toggle = async () => {
        setLoading(true);
        if (isSelected) {
            await removeTag(libraryId, tag.id);
        } else {
            await assignTag(libraryId, tag.id);
        }
        setIsSelected(!isSelected);
        setLoading(false);
    };

    return (
        <button
            onClick={toggle}
            disabled={loading}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                isSelected
                ? 'bg-blue-100 border-blue-300 text-blue-800 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-100'
                : 'bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400'
            } ${loading ? 'opacity-50' : ''}`}
        >
            {tag.name}
        </button>
    );
}

interface EditGameModalProps {
  item: GameWithLibrary;
  isOpen: boolean;
  onClose: () => void;
}

export function EditGameModal({ item, isOpen, onClose }: EditGameModalProps) {
  const [status, setStatus] = useState(item.status);
  const [completionType, setCompletionType] = useState(item.targetedCompletionType || 'Main');
  const [manualTime, setManualTime] = useState(item.playtimeManual?.toString() || (item.playtimeSteam || 0).toString());
  const [loading, setLoading] = useState(false);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);

  // Fix Match State
  const [showFixMatch, setShowFixMatch] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getUserTags().then(setAvailableTags);
    }
  }, [isOpen]);

  // Manual HLTB inputs
  const hltbTimes = item.game.hltbTimes ? JSON.parse(item.game.hltbTimes) : {};
  const [hltbMain, setHltbMain] = useState(hltbTimes.main || 0);
  const [hltbExtra, setHltbExtra] = useState(hltbTimes.extra || 0);
  const [hltbCompletionist, setHltbCompletionist] = useState(hltbTimes.completionist || 0);

  const handleSave = async () => {
    setLoading(true);
    try {
      const dataToUpdate: UpdateData = {};

      if (status !== item.status) {
          dataToUpdate.status = status;
      }

      if (completionType !== item.targetedCompletionType) {
          dataToUpdate.targetedCompletionType = completionType;
      }

      const timeVal = parseInt(manualTime);
      if (!isNaN(timeVal) && timeVal !== item.playtimeManual) {
          dataToUpdate.playtimeManual = timeVal;
      }

      const promises = [];

      if (Object.keys(dataToUpdate).length > 0) {
          promises.push(updateLibraryEntry(item.id, dataToUpdate));
      }

      if (showFixMatch) {
          promises.push(fixGameMatch(item.gameId, {
              main: parseFloat(hltbMain.toString()),
              extra: parseFloat(hltbExtra.toString()),
              completionist: parseFloat(hltbCompletionist.toString())
          }));
      }

      await Promise.all(promises);
      onClose();
    } catch (error) {
      console.error("Failed to update game", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit {item.game.title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">

          {/* Status */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="status" className="text-right">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Wishlist">Wishlist</SelectItem>
                <SelectItem value="Backlog">Backlog</SelectItem>
                <SelectItem value="Up Next">Up Next</SelectItem>
                <SelectItem value="Playing">Playing</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Abandoned">Abandoned</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Completion Style */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="completion" className="text-right">Goal</Label>
            <Select value={completionType} onValueChange={setCompletionType}>
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select goal" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Main">Main Story</SelectItem>
                <SelectItem value="Extra">Main + Extra</SelectItem>
                <SelectItem value="100%">100% Completion</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time Override */}
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="time" className="text-right">Time (min)</Label>
            <Input
              id="time"
              type="number"
              value={manualTime}
              onChange={(e) => setManualTime(e.target.value)}
              className="col-span-3"
            />
          </div>

          {/* Fix Match Toggle */}
          <div className="flex justify-end">
              <Button variant="link" size="sm" onClick={() => setShowFixMatch(!showFixMatch)}>
                  {showFixMatch ? "Cancel Fix Match" : "Fix Match Data (HLTB)"}
              </Button>
          </div>

          {/* Fix Match Inputs */}
          {showFixMatch && (
              <div className="space-y-2 border p-2 rounded-md bg-zinc-50 dark:bg-zinc-900">
                  <p className="text-xs text-muted-foreground mb-2">Override HLTB Times (Hours)</p>
                  <div className="grid grid-cols-3 gap-2">
                      <div>
                          <Label className="text-xs">Main</Label>
                          <Input type="number" step="0.1" value={hltbMain} onChange={(e) => setHltbMain(Number(e.target.value))} />
                      </div>
                      <div>
                          <Label className="text-xs">Extra</Label>
                          <Input type="number" step="0.1" value={hltbExtra} onChange={(e) => setHltbExtra(Number(e.target.value))} />
                      </div>
                      <div>
                          <Label className="text-xs">100%</Label>
                          <Input type="number" step="0.1" value={hltbCompletionist} onChange={(e) => setHltbCompletionist(Number(e.target.value))} />
                      </div>
                  </div>
              </div>
          )}

          {/* Tags */}
          <div className="grid gap-2">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-2">
                {availableTags.map(tag => {
                    return (
                        <TagBadge
                            key={tag.id}
                            tag={tag}
                            initiallySelected={item.tags?.some(t => t.id === tag.id) || false}
                            libraryId={item.id}
                        />
                    )
                })}
                 {availableTags.length === 0 && <span className="text-sm text-zinc-500">Go to Settings to create tags.</span>}
            </div>
          </div>

        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
