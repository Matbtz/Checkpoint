"use client";

import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { syncSteamPlaytime } from "@/actions/steam";
import { toast } from "sonner";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function SyncSteamButton({ className }: { className?: string }) {
    const [loading, setLoading] = useState(false);

    const handleSync = async () => {
        setLoading(true);
        try {
            const result = await syncSteamPlaytime();
            if (result.success) {
                toast.success(`Synced ${result.updatedCount} games from Steam`);
            }
        } catch (error) {
            console.error(error);
            toast.error("Failed to sync Steam library");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={loading}
            className={cn("gap-2", className)}
        >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            {loading ? "Syncing..." : "Refresh Steam"}
        </Button>
    );
}
