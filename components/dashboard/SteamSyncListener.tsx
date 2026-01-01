"use client";

import { useEffect, useRef } from "react";
import { syncSteamPlaytime } from "@/actions/steam";

export function SteamSyncListener() {
    const hasSynced = useRef(false);

    useEffect(() => {
        if (hasSynced.current) return;

        async function runAutoSync() {
            try {
                // Run lightweight sync (only active games)
                await syncSteamPlaytime({ activeOnly: true });
                hasSynced.current = true;
            } catch (error) {
                console.error("Auto-sync failed", error);
            }
        }

        // Delay slightly to not block initial render
        const timer = setTimeout(runAutoSync, 2000);
        return () => clearTimeout(timer);
    }, []);

    return null;
}
