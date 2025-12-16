"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Sidebar } from "./Sidebar"
import { BottomNav } from "./BottomNav"

export function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname()
    const [collapsed, setCollapsed] = React.useState(false)

    // Exclude login/register from AppShell
    const isAuthPage = pathname === "/login" || pathname === "/register"

    if (isAuthPage) {
        return <>{children}</>
    }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
        {/* Desktop Sidebar */}
        <Sidebar collapsed={collapsed} toggleCollapse={() => setCollapsed(!collapsed)} />

        {/* Main Content */}
        <main
            className={cn(
                "flex-1 transition-all duration-300 min-h-screen w-full",
                "pb-24 md:pb-8", // Mobile padding for bottom nav, normal padding for desktop
                collapsed ? "md:ml-[64px]" : "md:ml-64"
            )}
        >
            <div className="h-full px-4 py-6 md:px-8">
                {children}
            </div>
        </main>

        {/* Mobile Bottom Nav */}
        <BottomNav />
    </div>
  )
}
