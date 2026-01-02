'use client';

import { useState } from 'react';
import { updateUserPace } from '@/actions/user';
import { createTag, deleteTag } from '@/actions/tag';
import { disconnectAccount } from '@/actions/settings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Trash2, Unplug } from 'lucide-react';
import { Tag } from '@prisma/client';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface SettingsProps {
  initialPace: number;
  initialTags: Tag[];
  initialAccounts: { provider: string; providerAccountId: string }[];
  userSteamId?: string | null;
}

export default function SettingsClient({ initialPace, initialTags, initialAccounts, userSteamId }: SettingsProps) {
  const router = useRouter();
  const [pace, setPace] = useState(initialPace);
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [newTagName, setNewTagName] = useState('');
  const [isSavingPace, setIsSavingPace] = useState(false);

  // Connection State
  // Identify Steam account either from Accounts list or User.steamId
  const steamAccount = initialAccounts.find(a => a.provider === 'steam' || a.provider === 'steamcommunity');

  // Is Connected if we found an account OR we have a steamId on the user record
  const isSteamConnected = !!steamAccount || !!userSteamId;

  // Determine the display ID
  const displaySteamId = steamAccount?.providerAccountId || userSteamId;

  const [isDisconnectDialogOpen, setIsDisconnectDialogOpen] = useState(false);
  const [deleteImportedGames, setDeleteImportedGames] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

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

  const handleDisconnect = async () => {
      setIsDisconnecting(true);
      try {
          // Pass the provider name found, or default to 'steam'
          const providerToDisconnect = steamAccount?.provider || 'steam';
          const res = await disconnectAccount(providerToDisconnect, deleteImportedGames);
          if (res.success) {
              setIsDisconnectDialogOpen(false);
              setDeleteImportedGames(false);
              router.refresh();
          } else {
              // Handle error (maybe toast)
              console.error(res.error);
          }
      } catch (error) {
          console.error(error);
      } finally {
          setIsDisconnecting(false);
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

      {/* Connections Section */}
      <section className="space-y-4">
          <h2 className="text-xl font-semibold">Connexions</h2>
          <p className="text-zinc-500 text-sm">Liez vos comptes externes pour importer vos jeux.</p>
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-6">
              <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                       <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M11.979 0C5.678 0 .511 5.166.021 11.488l3.966 5.86c.667-1.391 2.086-2.35 3.729-2.35.26 0 .515.025.764.07l2.883-4.22a5.57 5.57 0 0 1-.368-1.992c0-3.097 2.51-5.607 5.607-5.607 3.097 0 5.607 2.51 5.607 5.607s-2.51 5.607-5.607 5.607c-2.07 0-3.869-1.119-4.87-2.786l-4.426 1.494a5.275 5.275 0 0 1-2.32 3.837L.344 24c2.812 3.193 6.941 5.23 11.635 5.23C18.595 29.23 24 23.825 24 17.209 24 10.595 18.595 5.19 11.979 5.19zM16.6 20.377a3.17 3.17 0 1 1 0-6.339 3.17 3.17 0 0 1 0 6.339zm-8.84-2.835a1.868 1.868 0 1 1 0-3.737 1.868 1.868 0 0 1 0 3.737zm10.749-3.414c-.93 0-1.685.755-1.685 1.685 0 .93.755 1.685 1.685 1.685.93 0 1.685-.755 1.685-1.685 0-.93-.755-1.685-1.685-1.685z" transform="scale(.82) translate(3,3)"/>
                       </svg>
                       <div className="flex flex-col">
                           <span className="font-medium">Steam</span>
                           {isSteamConnected && <span className="text-xs text-zinc-500">ID: {displaySteamId}</span>}
                       </div>
                  </div>

                  {isSteamConnected ? (
                      <Button variant="destructive" onClick={() => setIsDisconnectDialogOpen(true)}>
                          <Unplug className="mr-2 h-4 w-4" />
                          Déconnecter
                      </Button>
                  ) : (
                      <Button onClick={() => signIn('steam', { callbackUrl: '/dashboard' })}>
                          Lier mon compte Steam
                      </Button>
                  )}
              </div>
          </div>
      </section>

      <Dialog open={isDisconnectDialogOpen} onOpenChange={setIsDisconnectDialogOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Déconnecter Steam ?</DialogTitle>
                  <DialogDescription>
                      Cette action supprimera le lien entre votre compte et Steam.
                  </DialogDescription>
              </DialogHeader>
              <div className="flex items-center space-x-2 py-4">
                  <Checkbox
                    id="delete-games"
                    checked={deleteImportedGames}
                    onCheckedChange={(c) => setDeleteImportedGames(!!c)}
                  />
                  <Label htmlFor="delete-games">
                      Supprimer tous les jeux importés via Steam
                  </Label>
              </div>
              <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDisconnectDialogOpen(false)}>Annuler</Button>
                  <Button variant="destructive" onClick={handleDisconnect} disabled={isDisconnecting}>
                      {isDisconnecting ? 'Déconnexion...' : 'Confirmer la déconnexion'}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}
