'use client';

import { Button } from "@/components/ui/button";
import { triggerEnrichmentAction } from "@/actions/trigger-enrichment";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function RefreshButton({ gameId, gameTitle }: { gameId: string; gameTitle: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await triggerEnrichmentAction(gameId, gameTitle);
      router.refresh();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading} className="gap-2">
       <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
       {loading ? "Refreshing..." : "Refresh Data"}
    </Button>
  );
}
