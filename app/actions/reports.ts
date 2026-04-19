"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export interface DailyReport {
  id: string
  report_date: string
  worker_count: number
  total_hours: number
  projects: string[]
  status: "pending" | "completed"
  created_at: string
}

export interface ReportPhoto {
  id: string
  week_start: string
  work_date: string
  photo_pathname: string
  caption: string | null
  created_at: string
}

export interface DailyFieldReport {
  id: string
  week_start: string
  work_date: string
  work_performed: string | null
  journeyman_count: number
  apprentice_count: number // Legacy field
  apprentice_year1_count: number
  apprentice_year2_count: number
  apprentice_year3_count: number
  equipment: string[]
  problems_notes: string | null
  created_at: string
  updated_at: string
}

export interface WeeklyTotalsReport {
  weekStart: string
  weekEnd: string
  totalST: number
  totalOT: number
  totalDT: number
  totalHours: number
  workerCount: number
  dailyWorkerCounts: { [date: string]: number } // Workers present per day
  workerTotals: Array<{
    workerId: string
    workerName: string
    workerTrade: string
    weeklyST: number
    weeklyOT: number
    weeklyDT: number
    weeklyTotal: number
  }>
  // Week status for UI display
  isWeekComplete: boolean
  lastDataDate: string // The last date with data (for week-to-date display)
  daysWithData: number // Number of days with actual data
}

export interface DailyWorkerTotals {
  date: string
  totalST: number
  totalOT: number
  totalDT: number
  totalHours: number
  workerCount: number
  workers: Array<{
    workerId: string
    workerName: string
    workerTrade: string
    dailyST: number
    dailyOT: number
    dailyDT: number
    dailyTotal: number
    status: string
  }>
}

// Get weekly totals from real timesheet data
export async function getWeeklyTotalsFromTimesheets(weekStartDate: Date): Promise<WeeklyTotalsReport | null> {
  const supabase = await createClient()
  
  const weekStartStr = weekStartDate.toISOString().split("T")[0]
  const weekEnd = new Date(weekStartDate)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekEndStr = weekEnd.toISOString().split("T")[0]

  

  // Find the timesheet for this week
  const { data: timesheet, error: timesheetError } = await supabase
    .from("timesheets")
    .select("id")
    .eq("week_start", weekStartStr)
    .single()

  if (timesheetError || !timesheet) {
    return {
      weekStart: weekStartStr,
      weekEnd: weekEndStr,
      totalST: 0,
      totalOT: 0,
      totalDT: 0,
      totalHours: 0,
      workerCount: 0,
      dailyWorkerCounts: {},
      workerTotals: [],
      isWeekComplete: false,
      lastDataDate: weekStartStr,
      daysWithData: 0,
    }
  }

  

  // Get all entries for this timesheet with worker info
  const { data: entries, error: entriesError } = await supabase
    .from("timesheet_entries")
    .select(`
      worker_id,
      regular_hours,
      overtime_hours,
      double_time_hours,
      work_date,
      attendance_status,
      worker:workers(id, name, trade)
    `)
    .eq("timesheet_id", timesheet.id)

  if (entriesError) {
    console.error("Error fetching entries:", entriesError)
    return null
  }

  // Calculate totals per worker
  const workerMap = new Map<string, {
    workerId: string
    workerName: string
    workerTrade: string
    weeklyST: number
    weeklyOT: number
    weeklyDT: number
  }>()

  // Track daily worker counts (only Present/Late, not Absent)
  const dailyWorkerCounts: { [date: string]: Set<string> } = {}

  let totalST = 0
  let totalOT = 0
  let totalDT = 0

  for (const entry of entries || []) {
    const status = (entry as { attendance_status?: string }).attendance_status
    const isAbsent = status === "Absent"
    
    // For Absent workers, treat hours as 0 regardless of stored value
    const st = isAbsent ? 0 : (Number(entry.regular_hours) || 0)
    const ot = isAbsent ? 0 : (Number(entry.overtime_hours) || 0)
    const dt = isAbsent ? 0 : (Number(entry.double_time_hours) || 0)
    const totalHoursEntry = st + ot + dt

    // Track workers present per day (Present or Late status AND hours > 0)
    const isPresent = status === "Present" || status === "Late"
    const hasHours = totalHoursEntry > 0
    
    if (isPresent && hasHours) {
      const workDate = (entry as { work_date?: string }).work_date
      if (workDate) {
        if (!dailyWorkerCounts[workDate]) {
          dailyWorkerCounts[workDate] = new Set()
        }
        dailyWorkerCounts[workDate].add(entry.worker_id)
      }
    }

    // Add to totals (Absent workers contribute 0)
    totalST += st
    totalOT += ot
    totalDT += dt

    const existing = workerMap.get(entry.worker_id)
    if (existing) {
      existing.weeklyST += st
      existing.weeklyOT += ot
      existing.weeklyDT += dt
    } else {
      const worker = entry.worker as { id: string; name: string; trade: string } | null
      workerMap.set(entry.worker_id, {
        workerId: entry.worker_id,
        workerName: worker?.name || "Unknown",
        workerTrade: worker?.trade || "Unknown",
        weeklyST: st,
        weeklyOT: ot,
        weeklyDT: dt,
      })
    }
  }

  const workerTotals = Array.from(workerMap.values()).map(w => ({
    ...w,
    weeklyTotal: w.weeklyST + w.weeklyOT + w.weeklyDT,
  }))

  const totalHours = totalST + totalOT + totalDT

  // Convert Sets to counts
  const dailyWorkerCountsResult: { [date: string]: number } = {}
  for (const [date, workers] of Object.entries(dailyWorkerCounts)) {
    dailyWorkerCountsResult[date] = workers.size
  }

  // Calculate week status
  const today = new Date()
  const todayStr = today.toISOString().split("T")[0]
  const isWeekComplete = todayStr > weekEndStr // Week is complete if today is after the week end (Tuesday)
  
  // Find the last date with actual data
  const datesWithData = Object.keys(dailyWorkerCountsResult).sort()
  const lastDataDate = datesWithData.length > 0 ? datesWithData[datesWithData.length - 1] : weekStartStr
  const daysWithData = datesWithData.length

  return {
    weekStart: weekStartStr,
    weekEnd: weekEndStr,
    totalST,
    totalOT,
    totalDT,
    totalHours,
    workerCount: workerTotals.length,
    dailyWorkerCounts: dailyWorkerCountsResult,
    workerTotals,
    isWeekComplete,
    lastDataDate,
    daysWithData,
  }
}

// Get daily totals for a specific date
export async function getDailyWorkerTotals(weekStart: string, workDate: string): Promise<DailyWorkerTotals> {
  const supabase = await createClient()

  // Find the timesheet for this week
  const { data: timesheet, error: timesheetError } = await supabase
    .from("timesheets")
    .select("id")
    .eq("week_start", weekStart)
    .single()

  if (timesheetError || !timesheet) {
    return {
      date: workDate,
      totalST: 0,
      totalOT: 0,
      totalDT: 0,
      totalHours: 0,
      workerCount: 0,
      workers: [],
    }
  }

  // Get entries for this specific day
  const { data: entries, error: entriesError } = await supabase
    .from("timesheet_entries")
    .select(`
      worker_id,
      regular_hours,
      overtime_hours,
      double_time_hours,
      attendance_status,
      worker:workers(id, name, trade)
    `)
    .eq("timesheet_id", timesheet.id)
    .eq("work_date", workDate)

  if (entriesError || !entries) {
    return {
      date: workDate,
      totalST: 0,
      totalOT: 0,
      totalDT: 0,
      totalHours: 0,
      workerCount: 0,
      workers: [],
    }
  }

  let totalST = 0
  let totalOT = 0
  let totalDT = 0
  const workers: DailyWorkerTotals["workers"] = []

  for (const entry of entries) {
    const status = entry.attendance_status || "Present"
    const isAbsent = status === "Absent"
    
    const st = isAbsent ? 0 : (Number(entry.regular_hours) || 0)
    const ot = isAbsent ? 0 : (Number(entry.overtime_hours) || 0)
    const dt = isAbsent ? 0 : (Number(entry.double_time_hours) || 0)
    const dailyTotal = st + ot + dt

    totalST += st
    totalOT += ot
    totalDT += dt

    const worker = entry.worker as { id: string; name: string; trade: string } | null
    workers.push({
      workerId: entry.worker_id,
      workerName: worker?.name || "Unknown",
      workerTrade: worker?.trade || "Unknown",
      dailyST: st,
      dailyOT: ot,
      dailyDT: dt,
      dailyTotal,
      status,
    })
  }

  // Filter to only workers who were present and had hours
  const presentWorkers = workers.filter(w => w.status !== "Absent" && w.dailyTotal > 0)

  return {
    date: workDate,
    totalST,
    totalOT,
    totalDT,
    totalHours: totalST + totalOT + totalDT,
    workerCount: presentWorkers.length,
    workers,
  }
}

export async function getDailyReports(): Promise<DailyReport[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("daily_reports")
    .select("*")
    .order("report_date", { ascending: false })
    .limit(10)

  if (error) {
    console.error("Error fetching daily reports:", error)
    return []
  }

  return data || []
}

export async function getWeeklyStats(): Promise<{ totalHours: number; avgWorkers: number }> {
  const supabase = await createClient()

  // Get reports from last 7 days
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const { data } = await supabase
    .from("daily_reports")
    .select("worker_count, total_hours")
    .gte("report_date", sevenDaysAgo.toISOString().split("T")[0])

  if (!data || data.length === 0) {
    return { totalHours: 0, avgWorkers: 0 }
  }

  const totalHours = data.reduce((sum, r) => sum + Number(r.total_hours), 0)
  const avgWorkers = Math.round(data.reduce((sum, r) => sum + r.worker_count, 0) / data.length)

  return { totalHours, avgWorkers }
}

export async function createDailyReport(data: {
  report_date: string
  worker_count: number
  total_hours: number
  projects: string[]
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from("daily_reports")
    .upsert(
      {
        report_date: data.report_date,
        worker_count: data.worker_count,
        total_hours: data.total_hours,
        projects: data.projects,
        status: "pending",
      },
      { onConflict: "report_date" }
    )

  if (error) {
    console.error("Error creating daily report:", error)
    return { success: false, error: error.message }
  }

  // Log activity
  await supabase.from("activity_log").insert({
    action: "report_created",
    description: `Daily report generated for ${data.report_date}`,
  })

  revalidatePath("/")
  return { success: true }
}

export async function markReportCompleted(
  reportId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from("daily_reports")
    .update({ status: "completed" })
    .eq("id", reportId)

  if (error) {
    console.error("Error marking report completed:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

// Report Photos functions
export async function getReportPhotos(weekStart: string, workDate?: string): Promise<ReportPhoto[]> {
  const supabase = await createClient()

  let query = supabase
    .from("report_photos")
    .select("*")
    .eq("week_start", weekStart)
    .order("created_at", { ascending: false })

  if (workDate) {
    query = query.eq("work_date", workDate)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching report photos:", error)
    return []
  }

  return data || []
}

export async function addReportPhoto(data: {
  weekStart: string
  workDate: string
  photoPathname: string
  caption?: string
}): Promise<{ success: boolean; photo?: ReportPhoto; error?: string }> {
  const supabase = await createClient()

  const { data: photo, error } = await supabase
    .from("report_photos")
    .insert({
      week_start: data.weekStart,
      work_date: data.workDate,
      photo_pathname: data.photoPathname,
      caption: data.caption || null,
    })
    .select()
    .single()

  if (error) {
    console.error("Error adding report photo:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true, photo }
}

export async function updatePhotoCaption(
  photoId: string,
  caption: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from("report_photos")
    .update({ caption, updated_at: new Date().toISOString() })
    .eq("id", photoId)

  if (error) {
    console.error("Error updating photo caption:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

export async function deleteReportPhoto(photoId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // First get the photo to retrieve the pathname for blob deletion
  const { data: photo, error: fetchError } = await supabase
    .from("report_photos")
    .select("photo_pathname")
    .eq("id", photoId)
    .single()

  if (fetchError) {
    console.error("Error fetching photo for deletion:", fetchError)
    return { success: false, error: fetchError.message }
  }

  // Delete from database
  const { error } = await supabase
    .from("report_photos")
    .delete()
    .eq("id", photoId)

  if (error) {
    console.error("Error deleting report photo:", error)
    return { success: false, error: error.message }
  }

  // Delete from blob storage (fire and forget - don't fail if blob deletion fails)
  if (photo?.photo_pathname) {
    try {
      const { del } = await import("@vercel/blob")
      await del(photo.photo_pathname)
    } catch (blobError) {
      console.error("Error deleting from blob storage:", blobError)
      // Don't fail the operation if blob deletion fails
    }
  }

  revalidatePath("/")
  return { success: true }
}

// Daily Field Report functions
export async function getDailyFieldReport(weekStart: string, workDate: string): Promise<DailyFieldReport | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("daily_field_reports")
    .select("*")
    .eq("week_start", weekStart)
    .eq("work_date", workDate)
    .single()

  if (error) {
    if (error.code === "PGRST116") {
      // No rows found - this is normal for new days
      return null
    }
    console.error("Error fetching daily field report:", error)
    return null
  }

  return {
    ...data,
    equipment: data.equipment || [],
  }
}

export async function saveDailyFieldReport(data: {
  weekStart: string
  workDate: string
  workPerformed?: string
  journeymanCount?: number
  apprenticeYear1Count?: number
  apprenticeYear2Count?: number
  apprenticeYear3Count?: number
  equipment?: string[]
  problemsNotes?: string
}): Promise<{ success: boolean; report?: DailyFieldReport; error?: string }> {
  const supabase = await createClient()

  const upsertData = {
    week_start: data.weekStart,
    work_date: data.workDate,
    work_performed: data.workPerformed || null,
    journeyman_count: data.journeymanCount || 0,
    apprentice_year1_count: data.apprenticeYear1Count || 0,
    apprentice_year2_count: data.apprenticeYear2Count || 0,
    apprentice_year3_count: data.apprenticeYear3Count || 0,
    apprentice_count: (data.apprenticeYear1Count || 0) + (data.apprenticeYear2Count || 0) + (data.apprenticeYear3Count || 0), // Legacy field
    equipment: data.equipment || [],
    problems_notes: data.problemsNotes || null,
    updated_at: new Date().toISOString(),
  }

  const { data: report, error } = await supabase
    .from("daily_field_reports")
    .upsert(upsertData, { onConflict: "week_start,work_date" })
    .select()
    .single()

  if (error) {
    console.error("Error saving daily field report:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { 
    success: true, 
    report: {
      ...report,
      equipment: report.equipment || [],
    }
  }
}
