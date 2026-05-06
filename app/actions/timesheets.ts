"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { getCurrentUserTeam } from "@/app/actions/auth"

export interface Timesheet {
  id: string
  week_start: string
  week_end: string
  status: "pending" | "completed"
  created_at: string
  updated_at: string
}

export interface TimesheetEntry {
  id: string
  timesheet_id: string
  worker_id: string
  work_date: string
  attendance_status: "Present" | "Absent" | "Late"
  regular_hours: number
  overtime_hours: number
  double_time_hours: number
  job_code: string | null
  photo_ref_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  worker?: {
    id: string
    name: string
    trade: string
  }
}

// Get Wednesday of the current week
function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  // Wednesday = 3
  const diff = day >= 3 ? day - 3 : day + 4
  d.setDate(d.getDate() - diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function getOrCreateTimesheet(weekStart: Date): Promise<Timesheet | null> {
  const supabase = await createClient()
  const team = await getCurrentUserTeam()
  
  // Format dates
  const startStr = weekStart.toISOString().split("T")[0]
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const endStr = weekEnd.toISOString().split("T")[0]

  // Try to find existing timesheet for this team
  const { data: existing } = await supabase
    .from("timesheets")
    .select("*")
    .eq("week_start", startStr)
    .eq("team", team)
    .single()

  if (existing) {
    return existing
  }

  // Create new timesheet for this team
  const { data, error } = await supabase
    .from("timesheets")
    .insert({
      week_start: startStr,
      week_end: endStr,
      status: "pending",
      team: team,
    })
    .select()
    .single()

  if (error) {
    console.error("Error creating timesheet:", error)
    return null
  }

  return data
}

// Note: getWeekDays is a pure utility function that must be defined in the component
// since "use server" files can only export async functions

export async function getTimesheetEntriesForDay(
  timesheetId: string,
  workDate: string
): Promise<TimesheetEntry[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("timesheet_entries")
    .select(`
      *,
      worker:workers(id, name, trade)
    `)
    .eq("timesheet_id", timesheetId)
    .eq("work_date", workDate)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error fetching timesheet entries:", error)
    return []
  }

  return data || []
}

export async function getWeeklyEntries(timesheetId: string): Promise<TimesheetEntry[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("timesheet_entries")
    .select(`
      *,
      worker:workers(id, name, trade)
    `)
    .eq("timesheet_id", timesheetId)
    .order("work_date", { ascending: true })

  if (error) {
    console.error("Error fetching weekly entries:", error)
    return []
  }

  return data || []
}

export async function saveDailyTimesheet(
  timesheetId: string,
  workDate: string,
  entries: Array<{
    worker_id: string
    attendance_status: "Present" | "Absent" | "Late"
    regular_hours: number
    overtime_hours: number
    double_time_hours: number
    job_code?: string
    photo_ref_id?: string
    notes?: string
  }>
): Promise<{ success: boolean; error?: string }> {
  console.log("[v0] saveDailyTimesheet started:", { timesheetId, workDate, entriesCount: entries.length })
  
  try {
    const supabase = await createClient()

    // Check if it's a weekend (Saturday = 6, Sunday = 0)
    const date = new Date(workDate + "T00:00:00")
    const dayOfWeek = date.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    // Delete existing entries for this day
    const { error: deleteError } = await supabase
      .from("timesheet_entries")
      .delete()
      .eq("timesheet_id", timesheetId)
      .eq("work_date", workDate)

    if (deleteError) {
      console.error("[v0] Error deleting existing entries:", deleteError)
    }

    // Filter and process entries
    const entriesToInsert = entries
      .filter(e => e.worker_id)
      .map(entry => {
        // If status is Absent, force all hours to 0
        const isAbsent = entry.attendance_status === "Absent"
        
        return {
          timesheet_id: timesheetId,
          work_date: workDate,
          worker_id: entry.worker_id,
          attendance_status: entry.attendance_status,
          // Force all hours to 0 for Absent workers; force ST to 0 on weekends
          regular_hours: isAbsent ? 0 : (isWeekend ? 0 : (entry.regular_hours || 0)),
          overtime_hours: isAbsent ? 0 : (entry.overtime_hours || 0),
          double_time_hours: isAbsent ? 0 : (entry.double_time_hours || 0),
          job_code: entry.job_code || null,
          photo_ref_id: entry.photo_ref_id || null,
          notes: entry.notes || null,
        }
      })

    console.log("[v0] Entries to insert:", entriesToInsert.length)

    // Log each entry's daily data
    for (const entry of entriesToInsert) {
      console.log(`[v0] Daily saved data - Worker: ${entry.worker_id}, Date: ${workDate}, ST: ${entry.regular_hours}, OT: ${entry.overtime_hours}, DT: ${entry.double_time_hours}, Status: ${entry.attendance_status}`)
    }

    if (entriesToInsert.length > 0) {
      const { error } = await supabase
        .from("timesheet_entries")
        .insert(entriesToInsert)

      if (error) {
        console.error("[v0] Error saving daily timesheet entries:", error)
        return { success: false, error: error.message }
      }
    }

    // Log activity
    await supabase.from("activity_log").insert({
      action: "timesheet_saved",
      description: `Daily timesheet saved for ${workDate} with ${entriesToInsert.length} entries`,
    })

    console.log("[v0] saveDailyTimesheet success")
    revalidatePath("/")
    return { success: true }
  } catch (err) {
    console.error("[v0] saveDailyTimesheet exception:", err)
    return { success: false, error: err instanceof Error ? err.message : "Unknown error occurred" }
  }
}

export async function deleteTimesheetEntry(
  entryId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from("timesheet_entries")
    .delete()
    .eq("id", entryId)

  if (error) {
    console.error("Error deleting timesheet entry:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

export async function getTotalHoursForWeek(weekStart: Date): Promise<number> {
  const supabase = await createClient()
  const team = await getCurrentUserTeam()
  const startStr = weekStart.toISOString().split("T")[0]

  const { data: timesheet } = await supabase
    .from("timesheets")
    .select("id")
    .eq("week_start", startStr)
    .eq("team", team)
    .single()

  if (!timesheet) return 0

  const { data: entries } = await supabase
    .from("timesheet_entries")
    .select("regular_hours, overtime_hours, double_time_hours")
    .eq("timesheet_id", timesheet.id)

  if (!entries) return 0

  return entries.reduce((sum, e) => {
    return sum + Number(e.regular_hours) + Number(e.overtime_hours) + Number(e.double_time_hours)
  }, 0)
}

// Calculate weekly totals per worker
export async function getWeeklyTotals(timesheetId: string): Promise<Map<string, { st: number; ot: number; dt: number }>> {
  const entries = await getWeeklyEntries(timesheetId)
  const totals = new Map<string, { st: number; ot: number; dt: number }>()

  for (const entry of entries) {
    const current = totals.get(entry.worker_id) || { st: 0, ot: 0, dt: 0 }
    totals.set(entry.worker_id, {
      st: current.st + Number(entry.regular_hours),
      ot: current.ot + Number(entry.overtime_hours),
      dt: current.dt + Number(entry.double_time_hours),
    })
  }

  return totals
}
