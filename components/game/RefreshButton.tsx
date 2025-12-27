"use client";

import { Button } from "@/components/ui/button";
import { enrichGameData } from "@/actions/enrich";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface RefreshButtonProps {
  gameId: string;
  gameTitle: string;
}

export function RefreshButton({ gameId, gameTitle }: RefreshButtonProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRefresh = async () => {
    setLoading(true);
    try {
      const result = await enrichGameData(gameId, gameTitle);
      if (result.success) {
        toast.success("Game data enriched");
        router.refresh();
      } else {
        toast.error(result.message || "Failed to enrich data");
      }
    } catch (error) {
      toast.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRefresh}
      disabled={loading}
      className="gap-2"
    >
      <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
      {loading ? "Refreshing..." : "Refresh Data"}
    </Button>
  );
}
