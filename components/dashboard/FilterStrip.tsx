"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface FilterStripProps {
  filters: { id: string; label: string }[]
  activeFilter: string
  onFilterChange: (id: string) => void
  className?: string
}

export function FilterStrip({ filters, activeFilter, onFilterChange, className }: FilterStripProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <div
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide py-2 gap-2 px-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => onFilterChange(filter.id)}
            className={cn(
              "relative snap-start flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
              activeFilter === filter.id
                ? "text-white"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            {activeFilter === filter.id && (
              <motion.div
                layoutId="activeFilter"
                className="absolute inset-0 bg-primary rounded-full -z-10"
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
              />
            )}
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  )
}
