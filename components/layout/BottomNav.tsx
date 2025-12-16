"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Search, Plus, User } from "lucide-react"
import { cn } from "@/lib/utils"

export function BottomNav() {
  const pathname = usePathname()

  const links = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/library", label: "Library", icon: Search },
    { href: "/add", label: "Add", icon: Plus },
    { href: "/settings", label: "Profile", icon: User },
  ]

  return (
    <div className="fixed bottom-0 left-0 z-50 w-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-border md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex flex-col items-center justify-center w-full h-full text-xs gap-1",
              pathname === link.href ? "text-primary" : "text-muted-foreground"
            )}
          >
            <link.icon className="h-5 w-5" />
            <span>{link.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
