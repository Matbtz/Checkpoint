"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutDashboard, Library, PieChart, Settings, Home, Search, Plus, User, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useSession } from "next-auth/react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
  collapsed: boolean
  toggleCollapse: () => void
}

function Sidebar({ className, collapsed, toggleCollapse }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/library", label: "Library", icon: Library },
    { href: "/statistics", label: "Statistics", icon: PieChart },
    { href: "/settings", label: "Settings", icon: Settings },
  ]

  return (
    <div className={cn("pb-12 h-screen border-r bg-background transition-all duration-300", collapsed ? "w-[64px]" : "w-64", className)}>
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
    </div>
  )
}

function MobileNav() {
  const pathname = usePathname()

  const links = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/library", label: "Library", icon: Search },
    { href: "/add", label: "Add", icon: Plus },
    { href: "/settings", label: "Profile", icon: User },
  ]

  return (
    <div className="fixed bottom-0 left-0 z-50 w-full h-16 bg-background/80 backdrop-blur border-t flex items-center justify-around md:hidden">
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
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const [collapsed, setCollapsed] = React.useState(false)

    // Exclude login/register from AppShell
    const isAuthPage = pathname === "/login" || pathname === "/register"

    if (isAuthPage) {
        return <>{children}</>
    }

  return (
    <div className="flex min-h-screen flex-col md:flex-row bg-background">
        {/* Desktop Sidebar */}
        <aside className={cn("hidden md:block flex-shrink-0 fixed inset-y-0 left-0 z-30 transition-all duration-300", collapsed ? "w-[64px]" : "w-64")}>
            <Sidebar collapsed={collapsed} toggleCollapse={() => setCollapsed(!collapsed)} />
        </aside>

        {/* Main Content */}
        <main className={cn("flex-1 pb-16 md:pb-0 h-screen overflow-y-auto transition-all duration-300", collapsed ? "md:ml-[64px]" : "md:ml-64")}>
             <ScrollArea className="h-full">
                {children}
             </ScrollArea>
        </main>

        {/* Mobile Bottom Nav */}
        <MobileNav />
    </div>
  )
}
