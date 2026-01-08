"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { updateUserProfile } from "@/actions/profile";
import { toast } from "sonner";
import { Edit } from "lucide-react";
import { ProfileBackgroundSelector } from "./ProfileBackgroundSelector";

interface EditProfileDialogProps {
    currentAvatarUrl: string;
    currentBackgroundUrl: string;
    // We should really accept full profile settings here or fetch them,
    // but for now we might need to assume defaults if props are missing
    // or better, update the parent to pass them.
    // The previous implementation only passed URLs.
    // I will assume defaults for new fields if not passed, but ideal would be to pass them.
    // Let's modify the component to accept them.
    currentBackgroundMode?: string;
    currentBackgroundGameId?: string | null;
}

export function EditProfileDialog({
    currentAvatarUrl,
    currentBackgroundUrl,
    currentBackgroundMode = "URL",
    currentBackgroundGameId = null,
}: EditProfileDialogProps) {
    const [open, setOpen] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
    const [backgroundUrl, setBackgroundUrl] = useState(currentBackgroundUrl);

    const [backgroundMode, setBackgroundMode] = useState(currentBackgroundMode);
    const [backgroundGameId, setBackgroundGameId] = useState<string | null>(currentBackgroundGameId);

    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await updateUserProfile({
                avatarUrl,
                backgroundUrl: backgroundUrl || undefined,
                backgroundMode,
                backgroundGameId: backgroundGameId || undefined
            });
            toast.success("Profile updated successfully");
            setOpen(false);
        } catch (error) {
            console.error(error);
            toast.error("Failed to update profile");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="bg-background/50 backdrop-blur-sm hover:bg-background/80 text-foreground"
                    title="Edit Profile"
                >
                    <Edit className="h-5 w-5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-zinc-950 border-zinc-800 text-zinc-100 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Profile</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Make changes to your profile appearance here. Click save when you're done.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-4 pt-4">
                        <div className="grid w-full items-center gap-1.5">
                            <Label htmlFor="avatar">Avatar URL</Label>
                            <Input
                                id="avatar"
                                value={avatarUrl}
                                onChange={(e) => setAvatarUrl(e.target.value)}
                                className="bg-zinc-900 border-zinc-700 focus-visible:ring-zinc-600"
                            />
                        </div>

                        <div className="space-y-3 pt-2 border-t border-zinc-800">
                            <Label>Profile Background</Label>
                            <ProfileBackgroundSelector
                                mode={backgroundMode}
                                url={backgroundUrl}
                                gameId={backgroundGameId}
                                onModeChange={setBackgroundMode}
                                onUrlChange={setBackgroundUrl}
                                onGameIdChange={setBackgroundGameId}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-white w-full sm:w-auto">
                            {loading ? "Saving..." : "Save changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
