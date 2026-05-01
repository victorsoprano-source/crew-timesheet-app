"use client"

import { Home, ClipboardList, UserPlus, Users, BarChart3 } from "lucide-react"

interface BottomNavProps {
  currentScreen: string
  onNavigate: (screen: string) => void
}

export function BottomNav({ currentScreen, onNavigate }: BottomNavProps) {
  const navItems = [
    { id: "dashboard", label: "Home", icon: Home },
    { id: "timesheet", label: "Timesheet", icon: ClipboardList },
    { id: "add-worker", label: "Add", icon: UserPlus },
    { id: "crew-list", label: "Crew", icon: Users },
    { id: "reports", label: "Reports", icon: BarChart3 },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-secondary border-t border-border px-2 py-2 safe-area-pb">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map((item) => {
          const isActive = currentScreen === item.id
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors ${
                isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
