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

interface EditProfileDialogProps {
    currentAvatarUrl: string;
    currentBackgroundUrl: string;
}

export function EditProfileDialog({
    currentAvatarUrl,
    currentBackgroundUrl,
}: EditProfileDialogProps) {
    const [open, setOpen] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);
    const [backgroundUrl, setBackgroundUrl] = useState(currentBackgroundUrl);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await updateUserProfile({
                avatarUrl,
                backgroundUrl,
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
            <DialogContent className="sm:max-w-[425px] bg-zinc-950 border-zinc-800 text-zinc-100">
                <DialogHeader>
                    <DialogTitle>Edit Profile</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Make changes to your profile appearance here. Click save when you're done.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="avatar" className="text-right">
                                Avatar URL
                            </Label>
                            <Input
                                id="avatar"
                                value={avatarUrl}
                                onChange={(e) => setAvatarUrl(e.target.value)}
                                className="col-span-3 bg-zinc-900 border-zinc-700 focus-visible:ring-zinc-600"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="background" className="text-right">
                                Background URL
                            </Label>
                            <Input
                                id="background"
                                value={backgroundUrl}
                                onChange={(e) => setBackgroundUrl(e.target.value)}
                                className="col-span-3 bg-zinc-900 border-zinc-700 focus-visible:ring-zinc-600"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-white">
                            {loading ? "Saving..." : "Save changes"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
