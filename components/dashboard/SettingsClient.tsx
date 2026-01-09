'use client';

import { useState } from 'react';
import { updateUserPace, updateUserPlatforms, updateUserDefaultCompletionGoal } from '@/actions/user';
import { createTag, deleteTag } from '@/actions/tag';
import { disconnectAccount } from '@/actions/settings';
import { generateMobileKey } from '@/actions/mobile-auth';
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
import { Trash2, Unplug, Info, Smartphone, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { Tag } from '@prisma/client';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "@/components/ui/hover-card"

const PLATFORMS = [
    "PC",
    "PlayStation 5",
    "PlayStation 4",
    "Xbox Series",
    "Xbox One",
    "Nintendo Switch"
];

interface SettingsProps {
    initialPace: number;
    initialDefaultCompletionGoal: string;
    initialTags: Tag[];
    initialAccounts: { provider: string; providerAccountId: string }[];
    userSteamId?: string | null;
    initialPlatforms: string[];
    initialMobileKey?: string | null;
}

export default function SettingsClient({ initialPace, initialDefaultCompletionGoal, initialTags, initialAccounts, userSteamId, initialPlatforms, initialMobileKey }: SettingsProps) {
    const router = useRouter();
    const [pace, setPace] = useState(initialPace);
    const [defaultCompletionGoal, setDefaultCompletionGoal] = useState(initialDefaultCompletionGoal || 'Main');
    const [tags, setTags] = useState<Tag[]>(initialTags);
    const [newTagName, setNewTagName] = useState('');
    const [isSavingPace, setIsSavingPace] = useState(false);
    const [isSavingGoal, setIsSavingGoal] = useState(false);

    const [platforms, setPlatforms] = useState<string[]>(initialPlatforms || []);
    const [isSavingPlatforms, setIsSavingPlatforms] = useState(false);

    // Mobile Key State
    const [mobileKey, setMobileKey] = useState<string | null>(initialMobileKey || null);
    const [isGeneratingKey, setIsGeneratingKey] = useState(false);
    const [isKeyVisible, setIsKeyVisible] = useState(false);

    // Connection State
    const steamAccount = initialAccounts.find(a => a.provider === 'steam' || a.provider === 'steamcommunity');
    const isSteamConnected = !!steamAccount || !!userSteamId;
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

    const handlePlatformToggle = (platform: string, checked: boolean) => {
        if (checked) {
            setPlatforms(prev => [...prev, platform]);
        } else {
            setPlatforms(prev => prev.filter(p => p !== platform));
        }
    };

    const savePlatforms = async () => {
        setIsSavingPlatforms(true);
        try {
            await updateUserPlatforms(platforms);
        } catch (error) {
            console.error(error);
        } finally {
            setIsSavingPlatforms(false);
        }
    };

    const saveCompletionGoal = async (goal: string) => {
        setDefaultCompletionGoal(goal);
        setIsSavingGoal(true);
        await updateUserDefaultCompletionGoal(goal);
        setIsSavingGoal(false);
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

    const handleGenerateKey = async () => {
        setIsGeneratingKey(true);
        const res = await generateMobileKey();
        if (res.success && res.mobileKey) {
            setMobileKey(res.mobileKey);
            setIsKeyVisible(true);
        }
        setIsGeneratingKey(false);
    };

    const handleDisconnect = async () => {
        setIsDisconnecting(true);
        try {
            const providerToDisconnect = steamAccount?.provider || 'steam';
            const res = await disconnectAccount(providerToDisconnect, deleteImportedGames);
            if (res.success) {
                setIsDisconnectDialogOpen(false);
                setDeleteImportedGames(false);
                router.refresh();
            } else {
                console.error(res.error);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsDisconnecting(false);
        }
    };

    const completionOptions = [
        {
            value: "Main",
            label: "Main Story",
            description: "Focus on completing the main storyline only."
        },
        {
            value: "Extra",
            label: "Main + Extra",
            description: "Main story plus side quests and extra content."
        },
        {
            value: "100%",
            label: "Completionist",
            description: "Achieve 100% completion including all collectibles and achievements."
        }
    ];

    return (
        <div className="container mx-auto py-8 px-4 max-w-2xl space-y-12 text-zinc-900 dark:text-zinc-100">
            <h1 className="text-3xl font-bold">Settings</h1>

            {/* Pace Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold">Pace Factor</h2>
                <p className="text-zinc-500 text-sm">
                    Adjust the estimated playtime multiplier. If you play slower than average, increase this factor.
                </p>
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-6">
                    <div className="flex justify-between items-center font-medium">
                        <span>Pace: {Math.round(pace * 100)}%</span>
                        <span className="text-sm text-zinc-500">
                            {pace < 1 ? 'Fast' : pace > 1 ? 'Slow' : 'Normal'}
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
                            {isSavingPace ? 'Saving...' : 'Save'}
                        </Button>
                    </div>
                </div>
            </section>

            {/* Default Completion Goal Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold">Default Completion Goal</h2>
                <p className="text-zinc-500 text-sm">
                    Choose the default goal (Main Story, Main + Extra, 100%) when adding a new game.
                </p>
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {completionOptions.map((option) => (
                            <HoverCard key={option.value}>
                                <HoverCardTrigger asChild>
                                    <button
                                        onClick={() => saveCompletionGoal(option.value)}
                                        disabled={isSavingGoal}
                                        className={cn(
                                            "flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all h-24 text-center gap-1",
                                            defaultCompletionGoal === option.value
                                                ? "border-primary bg-primary/5 text-primary"
                                                : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50 dark:bg-zinc-950"
                                        )}
                                    >
                                        <span className="font-bold text-sm">{option.label}</span>
                                        {isSavingGoal && defaultCompletionGoal === option.value && (
                                            <span className="text-[10px] animate-pulse">Saving...</span>
                                        )}
                                    </button>
                                </HoverCardTrigger>
                                <HoverCardContent className="w-64 text-sm bg-zinc-900 text-white border-zinc-800 p-3">
                                    <p className="font-semibold mb-1">{option.label}</p>
                                    <p className="text-zinc-400 leading-snug">{option.description}</p>
                                </HoverCardContent>
                            </HoverCard>
                        ))}
                    </div>
                </div>
            </section>

            {/* Platforms Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold">Owned Platforms</h2>
                <p className="text-zinc-500 text-sm">
                    Select platforms you own. Games on these platforms will be prioritized.
                </p>
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {PLATFORMS.map(platform => (
                            <div key={platform} className="flex items-center space-x-2">
                                <Checkbox
                                    id={`platform-${platform}`}
                                    checked={platforms.includes(platform)}
                                    onCheckedChange={(checked) => handlePlatformToggle(platform, !!checked)}
                                />
                                <Label htmlFor={`platform-${platform}`} className="cursor-pointer">{platform}</Label>
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-end">
                        <Button onClick={savePlatforms} disabled={isSavingPlatforms}>
                            {isSavingPlatforms ? 'Saving...' : 'Save Platforms'}
                        </Button>
                    </div>
                </div>
            </section>

            {/* Tags Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold">My Tags</h2>
                <p className="text-zinc-500 text-sm">Create tags to organize your library.</p>

                <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="New tag..."
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                        />
                        <Button onClick={handleCreateTag}>Add</Button>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-4">
                        {tags.length === 0 && <span className="text-zinc-400 text-sm">No tags.</span>}
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

            {/* Widget Mobile & API Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold">Widget Mobile & API</h2>
                <p className="text-zinc-500 text-sm">Connect the Checkpoint Widget Android app to your library.</p>

                <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-6">
                    <div className="space-y-4">
                        <Label htmlFor="mobile-key">API Key</Label>
                        <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                                <Smartphone className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                                <Input
                                    id="mobile-key"
                                    value={mobileKey || "No key generated"}
                                    readOnly
                                    type={isKeyVisible ? "text" : "password"}
                                    className="pl-9 pr-10 font-mono"
                                />
                                {mobileKey && (
                                    <button
                                        onClick={() => setIsKeyVisible(!isKeyVisible)}
                                        className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300 transition-colors"
                                    >
                                        {isKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                    </button>
                                )}
                            </div>
                            <Button
                                variant="outline"
                                onClick={handleGenerateKey}
                                disabled={isGeneratingKey}
                            >
                                {isGeneratingKey ? (
                                    <>
                                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        {mobileKey ? 'Regenerate' : 'Generate'}
                                    </>
                                )}
                            </Button>
                        </div>
                        <div className="bg-zinc-100 dark:bg-zinc-950 p-3 rounded text-xs text-zinc-500 flex items-start gap-2">
                             <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                             <p>Copiez cette clé dans les paramètres de l'application Android Checkpoint Widget.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Connections Section */}
            <section className="space-y-4">
                <h2 className="text-xl font-semibold">Connections</h2>
                <p className="text-zinc-500 text-sm">Link external accounts to import your games.</p>
                <div className="bg-white dark:bg-zinc-900 p-6 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M11.979 0C5.678 0 .511 5.166.021 11.488l3.966 5.86c.667-1.391 2.086-2.35 3.729-2.35.26 0 .515.025.764.07l2.883-4.22a5.57 5.57 0 0 1-.368-1.992c0-3.097 2.51-5.607 5.607-5.607 3.097 0 5.607 2.51 5.607 5.607s-2.51 5.607-5.607 5.607c-2.07 0-3.869-1.119-4.87-2.786l-4.426 1.494a5.275 5.275 0 0 1-2.32 3.837L.344 24c2.812 3.193 6.941 5.23 11.635 5.23C18.595 29.23 24 23.825 24 17.209 24 10.595 18.595 5.19 11.979 5.19zM16.6 20.377a3.17 3.17 0 1 1 0-6.339 3.17 3.17 0 0 1 0 6.339zm-8.84-2.835a1.868 1.868 0 1 1 0-3.737 1.868 1.868 0 0 1 0 3.737zm10.749-3.414c-.93 0-1.685.755-1.685 1.685 0 .93.755 1.685 1.685 1.685.93 0 1.685-.755 1.685-1.685-1.685 0-.93-.755-1.685-1.685-1.685z" transform="scale(.82) translate(3,3)" />
                            </svg>
                            <div className="flex flex-col">
                                <span className="font-medium">Steam</span>
                                {isSteamConnected && <span className="text-xs text-zinc-500">ID: {displaySteamId}</span>}
                            </div>
                        </div>

                        {isSteamConnected ? (
                            <Button variant="destructive" onClick={() => setIsDisconnectDialogOpen(true)}>
                                <Unplug className="mr-2 h-4 w-4" />
                                Disconnect
                            </Button>
                        ) : (
                            <Button onClick={() => signIn('steam', { callbackUrl: '/dashboard' })}>
                                Link Steam Account
                            </Button>
                        )}
                    </div>
                </div>
            </section>

            <Dialog open={isDisconnectDialogOpen} onOpenChange={setIsDisconnectDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Disconnect Steam?</DialogTitle>
                        <DialogDescription>
                            This will unlink your account from Steam.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-center space-x-2 py-4">
                        <Checkbox
                            id="delete-games"
                            checked={deleteImportedGames}
                            onCheckedChange={(c) => setDeleteImportedGames(!!c)}
                        />
                        <Label htmlFor="delete-games">
                            Delete all games imported via Steam
                        </Label>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDisconnectDialogOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDisconnect} disabled={isDisconnecting}>
                            {isDisconnecting ? 'Disconnecting...' : 'Confirm Disconnect'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
