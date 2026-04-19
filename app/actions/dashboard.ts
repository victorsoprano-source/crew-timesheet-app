"use server"

import { createClient } from "@/lib/supabase/server"

export interface DashboardStats {
  workersToday: number
  presentCount: number
  lateCount: number
  absentCount: number
  hoursLogged: number
  totalST: number
  totalOT: number
  totalDT: number
  weekStart: string
  weekEnd: string
  selectedDate: string
}

// Get count of workers with Present or Late status AND hours > 0 for a specific date
export async function getWorkersToday(dateStr: string): Promise<number> {
  try {
    const supabase = await createClient()

    // Calculate week start for this date (Wednesday-based week)
    const date = new Date(dateStr + "T00:00:00")
    const dayOfWeek = date.getDay()
    const weekStart = new Date(date)
    const diff = dayOfWeek >= 3 ? dayOfWeek - 3 : dayOfWeek + 4
    weekStart.setDate(date.getDate() - diff)
    const weekStartStr = weekStart.toISOString().split("T")[0]

    // Find the timesheet for this week
    const { data: timesheet, error: timesheetError } = await supabase
      .from("timesheets")
      .select("id")
      .eq("week_start", weekStartStr)
      .single()

    if (timesheetError || !timesheet) {
      return 0
    }

    // Get all entries for this date with hours and status
    const { data: entries, error: entriesError } = await supabase
      .from("timesheet_entries")
      .select("worker_id, attendance_status, regular_hours, overtime_hours, double_time_hours")
      .eq("timesheet_id", timesheet.id)
      .eq("work_date", dateStr)

    if (entriesError || !entries) {
      return 0
    }

    // Filter workers: Present/Late status AND total hours > 0 (Absent workers excluded)
    const presentWorkers = entries.filter(e => {
      // Absent workers never count as present
      if (e.attendance_status === "Absent") return false
      
      const isPresent = e.attendance_status === "Present" || e.attendance_status === "Late"
      const totalHours = (Number(e.regular_hours) || 0) + (Number(e.overtime_hours) || 0) + (Number(e.double_time_hours) || 0)
      return isPresent && totalHours > 0
    })

    // Count unique workers
    const uniqueWorkers = new Set(presentWorkers.map(e => e.worker_id))
    return uniqueWorkers.size
  } catch (err) {
    console.error("getWorkersToday error:", err)
    return 0
  }
}

export interface ActivityItem {
  id: string
  action: string
  description: string
  created_at: string
}

// Get stats for a specific week (Wed-Tue) using the SAME logic as Reports
export async function getDashboardStats(weekStartDate?: Date, selectedDayIndex?: number): Promise<DashboardStats> {
  try {
    const supabase = await createClient()

    // Calculate week start (Wednesday)
    const today = new Date()
    let weekStart: Date
    if (weekStartDate) {
      weekStart = weekStartDate
    } else {
      const dayOfWeek = today.getDay()
      weekStart = new Date(today)
      const diff = dayOfWeek >= 3 ? dayOfWeek - 3 : dayOfWeek + 4
      weekStart.setDate(today.getDate() - diff)
    }
    weekStart.setHours(0, 0, 0, 0)
    
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    
    const weekStartStr = weekStart.toISOString().split("T")[0]
    const weekEndStr = weekEnd.toISOString().split("T")[0]

    // Generate week days (Wed-Tue)
    const weekDays: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      weekDays.push(d.toISOString().split("T")[0])
    }

    // Default to first day (Wednesday, index 0) if not specified
    const dayIndex = selectedDayIndex ?? 0
    const selectedDateStr = weekDays[dayIndex] || weekDays[0]

    // Find the timesheet for this week
    const { data: timesheet } = await supabase
      .from("timesheets")
      .select("id")
      .eq("week_start", weekStartStr)
      .single()

    let hoursLogged = 0
    let totalST = 0
    let totalOT = 0
    let totalDT = 0
    let workersToday = 0
    let presentCount = 0
    let lateCount = 0
    let absentCount = 0

    if (timesheet) {
      // Get all entries for this timesheet with status
      const { data: entries } = await supabase
        .from("timesheet_entries")
        .select("worker_id, regular_hours, overtime_hours, double_time_hours, work_date, attendance_status")
        .eq("timesheet_id", timesheet.id)

      if (entries && entries.length > 0) {
        // Sum up hours for the week - EXCLUDE Absent workers
        for (const e of entries) {
          // Skip hours for Absent workers
          if (e.attendance_status === "Absent") continue
          
          const st = Number(e.regular_hours) || 0
          const ot = Number(e.overtime_hours) || 0
          const dt = Number(e.double_time_hours) || 0
          totalST += st
          totalOT += ot
          totalDT += dt
        }
        hoursLogged = totalST + totalOT + totalDT

        // Count workers for selected day - SAME LOGIC AS REPORTS
        // Present or Late status AND hours > 0
        const presentWorkers = new Set<string>()
        const lateWorkers = new Set<string>()
        const absentWorkers = new Set<string>()
        
        for (const e of entries) {
          if (e.work_date === selectedDateStr) {
            const entryHours = (Number(e.regular_hours) || 0) + (Number(e.overtime_hours) || 0) + (Number(e.double_time_hours) || 0)
            
            if (e.attendance_status === "Present" && entryHours > 0) {
              presentWorkers.add(e.worker_id)
            } else if (e.attendance_status === "Late" && entryHours > 0) {
              lateWorkers.add(e.worker_id)
            } else if (e.attendance_status === "Absent") {
              absentWorkers.add(e.worker_id)
            }
          }
        }
        
        presentCount = presentWorkers.size
        lateCount = lateWorkers.size
        absentCount = absentWorkers.size
        workersToday = presentCount + lateCount
      }
    }

    return {
      workersToday,
      presentCount,
      lateCount,
      absentCount,
      hoursLogged: Math.round(hoursLogged),
      totalST: Math.round(totalST),
      totalOT: Math.round(totalOT),
      totalDT: Math.round(totalDT),
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      selectedDate: selectedDateStr,
    }
  } catch (err) {
    console.error("getDashboardStats error:", err)
    return {
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
    }
  }
}

export async function getRecentActivity(): Promise<ActivityItem[]> {
  try {
    const supabase = await createClient()

    const { data, error } = await supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5)

    if (error) {
      console.error("Error fetching activity:", error)
      return []
    }

    return data || []
  } catch (err) {
    console.error("getRecentActivity error:", err)
    return []
  }
}
