"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Users, Clock, FileText, Plus, UserPlus, List, BarChart3, HardHat, Loader2 } from "lucide-react"
import { getDashboardStats, getRecentActivity, type DashboardStats, type ActivityItem } from "@/app/actions/dashboard"

interface DashboardProps {
  supervisorName: string
  onNavigate: (screen: string) => void
}

export function Dashboard({ supervisorName, onNavigate }: DashboardProps) {
  const [stats, setStats] = useState<DashboardStats>({ 
    workersToday: 0,
    presentCount: 0,
    lateCount: 0,
    absentCount: 0,
    hoursLogged: 0, 
    totalST: 0,
    totalOT: 0,
    totalDT: 0,
    weekStart: "",
    weekEnd: "",
    selectedDate: "",
  })
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Calculate current day index within Wed-Tue week (0=Wed, 1=Thu, ..., 6=Tue)
  const getCurrentDayIndex = () => {
    const today = new Date()
    const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
    // Map to Wed-Tue week: Wed=0, Thu=1, Fri=2, Sat=3, Sun=4, Mon=5, Tue=6
    const dayMap: Record<number, number> = { 3: 0, 4: 1, 5: 2, 6: 3, 0: 4, 1: 5, 2: 6 }
    return dayMap[dayOfWeek] ?? 0
  }

  const selectedDayIndex = getCurrentDayIndex()

  const loadData = async () => {
    setIsLoading(true)
    
    // Add timeout to prevent infinite loading (10 seconds max)
    const timeoutId = setTimeout(() => {
      setIsLoading(false)
    }, 10000)
    
    try {
      // Pass selectedDayIndex (0 = Wednesday) - same logic as Reports
      const [statsData, activityData] = await Promise.all([
        getDashboardStats(undefined, selectedDayIndex),
        getRecentActivity(),
      ])
      
      setStats(statsData)
      setActivities(activityData)
    } catch (err) {
      console.error("Dashboard fetch error:", err)
      // Keep default values (already set to 0)
    } finally {
      clearTimeout(timeoutId)
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const formatWeekRange = () => {
    if (!stats.weekStart || !stats.weekEnd) return "This Week"
    const start = new Date(stats.weekStart + "T00:00:00")
    const end = new Date(stats.weekEnd + "T00:00:00")
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
  }

  const statCards = [
    { label: "Workers Today", value: stats.workersToday.toString(), icon: Users, color: "text-primary" },
    { label: "Total Hours", value: stats.hoursLogged.toString(), icon: Clock, color: "text-accent" },
  ]

  const actions = [
    { label: "Create Timesheet", icon: Plus, screen: "timesheet" },
    { label: "Add Worker", icon: UserPlus, screen: "add-worker" },
    { label: "Crew List", icon: List, screen: "crew-list" },
    { label: "Daily Reports", icon: BarChart3, screen: "reports" },
  ]

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hr ago`
    return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
  }

  return (
    <div className="flex flex-col gap-6 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
          <HardHat className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">Crew Timesheet</h1>
          <p className="text-sm text-muted-foreground">Welcome, {supervisorName}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Current Week</p>
          <p className="text-sm font-medium text-foreground">{formatWeekRange()}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        {statCards.map((stat) => (
          <Card key={stat.label} className="flex flex-col items-center gap-2 p-4 bg-card border-border relative">
            <stat.icon className={`h-5 w-5 ${stat.color}`} />
            <span className="text-2xl font-bold text-foreground">{stat.value}</span>
            <span className="text-xs text-muted-foreground text-center leading-tight">{stat.label}</span>
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-card/50 rounded-lg">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </Card>
        ))}
        
        {/* Hours Breakdown Card - ST/OT/DT */}
        <Card className="flex flex-col p-4 bg-card border-border relative">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-chart-3" />
            <span className="text-xs font-medium text-muted-foreground">Hours Breakdown</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {/* Straight Time */}
            <div className="flex flex-col items-center justify-center bg-muted/30 rounded-lg py-2 px-1">
              <span className="text-base sm:text-lg font-bold text-foreground tabular-nums">{stats.totalST}</span>
              <span className="text-[9px] sm:text-[10px] text-muted-foreground font-medium mt-0.5">ST</span>
              <span className="text-[8px] text-muted-foreground/70 hidden sm:block">Straight</span>
            </div>
            {/* Overtime */}
            <div className="flex flex-col items-center justify-center bg-muted/30 rounded-lg py-2 px-1">
              <span className="text-base sm:text-lg font-bold text-chart-2 tabular-nums">{stats.totalOT}</span>
              <span className="text-[9px] sm:text-[10px] text-muted-foreground font-medium mt-0.5">OT</span>
              <span className="text-[8px] text-muted-foreground/70 hidden sm:block">Overtime</span>
            </div>
            {/* Double Time */}
            <div className="flex flex-col items-center justify-center bg-muted/30 rounded-lg py-2 px-1">
              <span className="text-base sm:text-lg font-bold text-chart-3 tabular-nums">{stats.totalDT}</span>
              <span className="text-[9px] sm:text-[10px] text-muted-foreground font-medium mt-0.5">DT</span>
              <span className="text-[8px] text-muted-foreground/70 hidden sm:block">Double</span>
            </div>
          </div>
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-card/50 rounded-lg">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
        </Card>
      </div>

      {/* Daily Attendance Breakdown */}
      <Card className="p-4 bg-card border-border relative">
        <p className="text-xs text-muted-foreground mb-3">
          Daily Attendance ({stats.selectedDate ? new Date(stats.selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "Today"})
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-accent/10">
            <span className="text-xl font-bold text-accent">{stats.presentCount}</span>
            <span className="text-xs text-muted-foreground">Present</span>
          </div>
          <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-chart-3/10">
            <span className="text-xl font-bold text-chart-3">{stats.lateCount}</span>
            <span className="text-xs text-muted-foreground">Late</span>
          </div>
          <div className="flex flex-col items-center gap-1 p-3 rounded-lg bg-destructive/10">
            <span className="text-xl font-bold text-destructive">{stats.absentCount}</span>
            <span className="text-xs text-muted-foreground">Absent</span>
          </div>
        </div>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/50 rounded-lg">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </Card>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="secondary"
            className="flex h-24 flex-col items-center justify-center gap-2 bg-card hover:bg-secondary border border-border"
            onClick={() => onNavigate(action.screen)}
          >
            <action.icon className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-foreground">{action.label}</span>
          </Button>
        ))}
      </div>

      {/* Recent Activity */}
      <Card className="p-4 bg-card border-border">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Recent Activity</h2>
        <div className="flex flex-col gap-3">
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : activities.length > 0 ? (
            activities.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                <span className="text-sm text-muted-foreground">{activity.description}</span>
                <span className="text-xs text-muted-foreground/70">{formatTimeAgo(activity.created_at)}</span>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-2">No recent activity</p>
          )}
        </div>
      </Card>
    </div>
  )
}
