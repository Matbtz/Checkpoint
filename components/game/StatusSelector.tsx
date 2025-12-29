"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateGameStatus } from "@/actions/library";
import { toast } from "sonner";
import { useState } from "react";

interface StatusSelectorProps {
  gameId: string;
  currentStatus: string;
}

const STATUS_OPTIONS = [
  { value: "BACKLOG", label: "Backlog" },
  { value: "PLAYING", label: "Playing" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ABANDONED", label: "Abandoned" },
  { value: "WISHLIST", label: "Wishlist" },
];

export function StatusSelector({ gameId, currentStatus }: StatusSelectorProps) {
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus);
    setLoading(true);
    try {
      await updateGameStatus(gameId, newStatus);
      toast.success("Status updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update status");
      // Revert on error
      setStatus(currentStatus);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Select value={status} onValueChange={handleStatusChange} disabled={loading}>
      <SelectTrigger className="w-[140px] bg-white/10 border-white/20 text-white backdrop-blur-md">
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
