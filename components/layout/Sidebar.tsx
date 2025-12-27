"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Library, PieChart, Plus, User, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useSession } from "next-auth/react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  collapsed: boolean
  toggleCollapse: () => void
}

export function Sidebar({ className, collapsed, toggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()

  const authenticatedLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/library", label: "Library", icon: Library },
    { href: "/statistics", label: "Statistics", icon: PieChart },
    { href: "/search", label: "Search", icon: Search },
    { href: "/settings", label: "Profile", icon: User },
  ]

  const unauthenticatedLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/search", label: "Search", icon: Search },
  ]

  const links = session?.user ? authenticatedLinks : unauthenticatedLinks

  return (
    <aside className={cn("hidden md:flex flex-col h-screen border-r bg-background transition-all duration-300 fixed inset-y-0 left-0 z-30", collapsed ? "w-[64px]" : "w-64", className)}>
      <div className="space-y-4 py-4 h-full flex flex-col">
        <div className={cn("px-3 py-2 flex items-center", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && (
            <h2 className="px-2 text-lg font-semibold tracking-tight truncate">
              Checkpoint
            </h2>
          )}
          <Button variant="ghost" size="icon" onClick={toggleCollapse} className="h-8 w-8">
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <div className="space-y-1 px-2">
          {links.map((link) => (
            <Button
              key={link.href}
              variant={pathname === link.href ? "secondary" : "ghost"}
              className={cn("w-full", collapsed ? "justify-center px-2" : "justify-start")}
              asChild
            >
              <Link href={link.href}>
                <link.icon className={cn("h-4 w-4", collapsed ? "mr-0" : "mr-2")} />
                {!collapsed && <span>{link.label}</span>}
              </Link>
            </Button>
          ))}
        </div>

        <div className="mt-auto px-3 py-2">
          {session?.user && (
            <div className={cn("flex items-center gap-3 py-2", collapsed ? "justify-center px-0" : "px-4")}>
              <Avatar className="h-8 w-8">
                <AvatarImage src={session.user.image || ""} alt={session.user.name || "User"} />
                <AvatarFallback>{session.user.name?.[0] || "U"}</AvatarFallback>
              </Avatar>
              {!collapsed && (
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-medium leading-none truncate">{session.user.name}</span>
                  <span className="text-xs text-muted-foreground truncate w-32">{session.user.email}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
