'use client';

import { useState } from 'react';
import { updateUserPace } from '@/actions/user';
import { createTag, deleteTag } from '@/actions/tag';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Trash2 } from 'lucide-react';
import { Tag } from '@prisma/client';

interface SettingsProps {
  initialPace: number;
  initialTags: Tag[];
}

export default function SettingsPage({ initialPace, initialTags }: SettingsProps) {
  const [pace, setPace] = useState(initialPace);
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [newTagName, setNewTagName] = useState('');
  const [isSavingPace, setIsSavingPace] = useState(false);

  const handlePaceChange = (val: number[]) => {
      setPace(val[0]);
  };

  const savePace = async () => {
      setIsSavingPace(true);
      await updateUserPace(pace);
      setIsSavingPace(false);
  };

  const handleCreateTag = async () => {
      if (!newTagName.trim()) return;
      const res = await createTag(newTagName);
      if (res.success && res.tag) {
          setTags([...tags, res.tag]);
          setNewTagName('');
      }
  };

  const handleDeleteTag = async (id: string) => {
      const res = await deleteTag(id);
      if (res.success) {
          setTags(tags.filter(t => t.id !== id));
      }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-2xl space-y-12">
      <h1 className="text-3xl font-bold">Paramètres</h1>

      {/* Pace Section */}
      <section className="space-y-4">
          <h2 className="text-xl font-semibold">Facteur de Rythme (Pace)</h2>
          <p className="text-zinc-500 text-sm">
            Ajustez le multiplicateur de temps de jeu estimé. Si vous jouez plus lentement que la moyenne, augmentez ce facteur.
          </p>
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-6">
              <div className="flex justify-between items-center font-medium">
                  <span>Rythme: {Math.round(pace * 100)}%</span>
                  <span className="text-sm text-zinc-500">
                      {pace < 1 ? 'Rapide' : pace > 1 ? 'Lent' : 'Normal'}
                  </span>
              </div>
              <Slider
                value={[pace]}
                min={0.5}
                max={1.5}
                step={0.1}
                onValueChange={handlePaceChange}
              />
              <div className="flex justify-end">
                  <Button onClick={savePace} disabled={isSavingPace}>
                      {isSavingPace ? 'Enregistrement...' : 'Sauvegarder'}
                  </Button>
              </div>
          </div>
      </section>

      {/* Tags Section */}
      <section className="space-y-4">
          <h2 className="text-xl font-semibold">Mes Tags</h2>
          <p className="text-zinc-500 text-sm">Créez des tags pour organiser votre bibliothèque.</p>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-4">
              <div className="flex gap-2">
                  <Input
                    placeholder="Nouveau tag..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                  />
                  <Button onClick={handleCreateTag}>Ajouter</Button>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                  {tags.length === 0 && <span className="text-zinc-400 text-sm">Aucun tag.</span>}
                  {tags.map(tag => (
                      <div key={tag.id} className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full text-sm">
                          <span>{tag.name}</span>
                          <button onClick={() => handleDeleteTag(tag.id)} className="text-zinc-500 hover:text-red-500 ml-1">
                              <Trash2 className="h-3 w-3" />
                          </button>
                      </div>
                  ))}
              </div>
          </div>
      </section>
    </div>
  );
}
