import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Force Node.js runtime for PDF generation
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

// Create Supabase client directly in API route
async function createApiClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase configuration")
  }
  
  const cookieStore = await cookies()
  return createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignore
          }
        },
      },
    }
  )
}

// Timeout wrapper
async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  let timeoutId: NodeJS.Timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${operation} timed out`)), ms)
  })
  try {
    const result = await Promise.race([promise, timeoutPromise])
    clearTimeout(timeoutId!)
    return result
  } catch (error) {
    clearTimeout(timeoutId!)
    throw error
  }
}

function getLevelAbbr(level: string): string {
  switch (level) {
    case "Journeyman": return "JM"
    case "Apprentice Year 1": return "APP1"
    case "Apprentice Year 2": return "APP2"
    case "Apprentice Year 3": return "APP3"
    default: return "JM"
  }
}

function sanitizeText(text: string | null | undefined): string {
  if (!text) return ""
  let result = String(text)
  result = result.split("").map(char => {
    const code = char.charCodeAt(0)
    if (code === 10 || code === 13 || code === 9) return " "
    if (code < 32 || (code > 126 && code < 160) || code > 255) return ""
    return char
  }).join("")
  result = result.replace(/  +/g, " ")
  return result.trim() || ""
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

interface WorkerSummary {
  name: string
  level: string
  levelAbbr: string
  totalST: number
  totalOT: number
  totalDT: number
  totalHours: number
}

interface DailyFieldReportData {
  work_date: string
  work_performed: string | null
  journeyman_count: number
  apprentice_year1_count: number
  apprentice_year2_count: number
  apprentice_year3_count: number
  equipment: string[]
  problems_notes: string | null
}

interface ReportPhotoData {
  work_date: string
  photo_pathname: string
  caption: string | null
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get("weekStart")

    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: "Invalid weekStart parameter" }, { status: 400 })
    }

    const supabase = await withTimeout(createApiClient(), 5000, "Supabase client creation")

    // Calculate week end
    const weekStartDate = new Date(weekStart + "T12:00:00")
    const weekEnd = new Date(weekStartDate)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndStr = weekEnd.toISOString().split("T")[0]

    // Check if week is complete
    const today = new Date()
    const isWeekComplete = today > weekEnd

    // Find timesheet
    const timesheetResult = await withTimeout(
      supabase.from("timesheets").select("id").eq("week_start", weekStart).single(),
      10000,
      "Timesheet query"
    )

    // Get entries with worker info
    let workers: WorkerSummary[] = []
    if (timesheetResult.data) {
      const entriesResult = await withTimeout(
        supabase
          .from("timesheet_entries")
          .select(`
            worker_id,
            regular_hours,
            overtime_hours,
            double_time_hours,
            attendance_status,
            worker:workers(id, name, level)
          `)
          .eq("timesheet_id", timesheetResult.data.id),
        10000,
        "Entries query"
      )

      if (!entriesResult.error) {
        const workerMap = new Map<string, WorkerSummary>()

        for (const entry of entriesResult.data || []) {
          const isAbsent = entry.attendance_status === "Absent"
          const st = isAbsent ? 0 : (Number(entry.regular_hours) || 0)
          const ot = isAbsent ? 0 : (Number(entry.overtime_hours) || 0)
          const dt = isAbsent ? 0 : (Number(entry.double_time_hours) || 0)

          const worker = entry.worker as { id: string; name: string; level?: string } | null
          const workerLevel = worker?.level || "Journeyman"

          let workerData = workerMap.get(entry.worker_id)
          if (!workerData) {
            workerData = {
              name: worker?.name || "Unknown",
              level: workerLevel,
              levelAbbr: getLevelAbbr(workerLevel),
              totalST: 0,
              totalOT: 0,
              totalDT: 0,
              totalHours: 0,
            }
            workerMap.set(entry.worker_id, workerData)
          }

          workerData.totalST += st
          workerData.totalOT += ot
          workerData.totalDT += dt
          workerData.totalHours += st + ot + dt
        }

        workers = Array.from(workerMap.values())
          .filter(w => w.totalHours > 0)
          .sort((a, b) => a.name.localeCompare(b.name))
      }
    }

    // Get field reports for daily work summaries and equipment
    const fieldReportsResult = await supabase
      .from("daily_field_reports")
      .select("*")
      .eq("week_start", weekStart)
      .order("work_date", { ascending: true })

    const fieldReports: DailyFieldReportData[] = fieldReportsResult.data || []

    // Get photos for this week
    const photosResult = await supabase
      .from("report_photos")
      .select("work_date, photo_pathname, caption")
      .eq("week_start", weekStart)
      .order("work_date", { ascending: true })

    const photos: ReportPhotoData[] = photosResult.data || []

    return generateSummaryPDF(weekStart, weekEndStr, isWeekComplete, workers, fieldReports, photos)

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function generateSummaryPDF(
  weekStart: string,
  weekEnd: string,
  isWeekComplete: boolean,
  workers: WorkerSummary[],
  fieldReports: DailyFieldReportData[],
  photos: ReportPhotoData[]
): Promise<NextResponse> {
  try {
    const doc = await PDFDocument.create()
    let page = doc.addPage([612, 792]) // 8.5" x 11"
    const { width, height } = page.getSize()
    
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

    const margin = 50
    let y = height - margin

    // Helper to check page break and add new page if needed
    const checkPageBreak = (neededSpace: number) => {
      if (y < margin + neededSpace) {
        page = doc.addPage([612, 792])
        y = height - margin
        return true
      }
      return false
    }

    // ===== HEADER =====
    page.drawText("WEEKLY SUMMARY REPORT", {
      x: margin, y, size: 18, font: fontBold, color: rgb(0.1, 0.1, 0.2),
    })
    y -= 25

    page.drawText("Ahern Painting Cont., Inc.", {
      x: margin, y, size: 12, font: fontBold, color: rgb(0.3, 0.3, 0.3),
    })
    y -= 18

    page.drawText("Job: C34921R", {
      x: margin, y, size: 11, font: fontRegular, color: rgb(0.4, 0.4, 0.4),
    })
    y -= 22

    // Week dates
    const startFmt = new Date(weekStart + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })
    const endFmt = new Date(weekEnd + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    page.drawText(`Week: ${startFmt} - ${endFmt}`, {
      x: margin, y, size: 11, font: fontRegular, color: rgb(0, 0, 0),
    })
    y -= 18

    // Status badge
    const statusText = isWeekComplete ? "Final Weekly Total" : "Week To Date"
    const statusColor = isWeekComplete ? rgb(0.2, 0.6, 0.3) : rgb(0.8, 0.5, 0.1)
    page.drawText(`Status: ${statusText}`, {
      x: margin, y, size: 10, font: fontBold, color: statusColor,
    })
    y -= 30

    // ===== CREW COMPOSITION THIS WEEK =====
    page.drawText("CREW COMPOSITION THIS WEEK", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
    })
    y -= 18

    // Count workers by level (only those with hours > 0)
    let jmCount = 0, app1Count = 0, app2Count = 0, app3Count = 0
    for (const w of workers) {
      if (w.totalHours > 0) {
        if (w.level === "Journeyman") jmCount++
        else if (w.level === "Apprentice Year 1") app1Count++
        else if (w.level === "Apprentice Year 2") app2Count++
        else if (w.level === "Apprentice Year 3") app3Count++
        else jmCount++ // Default to journeyman
      }
    }

    if (jmCount > 0) {
      page.drawText(`• ${jmCount} Journeyman`, { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
      y -= 14
    }
    if (app1Count > 0) {
      page.drawText(`• ${app1Count} Apprentice - Year 1`, { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
      y -= 14
    }
    if (app2Count > 0) {
      page.drawText(`• ${app2Count} Apprentice - Year 2`, { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
      y -= 14
    }
    if (app3Count > 0) {
      page.drawText(`• ${app3Count} Apprentice - Year 3`, { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
      y -= 14
    }

    if (jmCount === 0 && app1Count === 0 && app2Count === 0 && app3Count === 0) {
      page.drawText("No crew data available.", { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })
      y -= 14
    }

    y -= 20

    // ===== WEEKLY TOTALS BOX =====
    let totalST = 0, totalOT = 0, totalDT = 0
    for (const w of workers) {
      totalST += w.totalST
      totalOT += w.totalOT
      totalDT += w.totalDT
    }
    const totalHours = totalST + totalOT + totalDT

    page.drawRectangle({
      x: margin,
      y: y - 55,
      width: width - (margin * 2),
      height: 55,
      color: rgb(0.95, 0.95, 0.98),
      borderColor: rgb(0.8, 0.8, 0.85),
      borderWidth: 1,
    })

    page.drawText("WEEKLY TOTALS", {
      x: margin + 15, y: y - 15, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.4),
    })

    const statsY = y - 38
    const statWidth = (width - margin * 2 - 30) / 4

    page.drawText(`${workers.length}`, { x: margin + 15, y: statsY, size: 18, font: fontBold, color: rgb(0.1, 0.1, 0.2) })
    page.drawText("Workers", { x: margin + 15, y: statsY - 12, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })

    page.drawText(`${totalHours}`, { x: margin + 15 + statWidth, y: statsY, size: 18, font: fontBold, color: rgb(0.1, 0.1, 0.2) })
    page.drawText("Total Hrs", { x: margin + 15 + statWidth, y: statsY - 12, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })

    page.drawText(`${totalST}`, { x: margin + 15 + statWidth * 2, y: statsY, size: 14, font: fontBold, color: rgb(0.2, 0.5, 0.3) })
    page.drawText("ST", { x: margin + 15 + statWidth * 2, y: statsY - 12, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })

    page.drawText(`${totalOT}`, { x: margin + 15 + statWidth * 2.5, y: statsY, size: 14, font: fontBold, color: rgb(0.7, 0.5, 0.1) })
    page.drawText("OT", { x: margin + 15 + statWidth * 2.5, y: statsY - 12, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })

    page.drawText(`${totalDT}`, { x: margin + 15 + statWidth * 3, y: statsY, size: 14, font: fontBold, color: rgb(0.7, 0.2, 0.2) })
    page.drawText("DT", { x: margin + 15 + statWidth * 3, y: statsY - 12, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })

    y -= 75

    // ===== WORKER DETAILS =====
    checkPageBreak(80)
    page.drawText("WORKER DETAILS", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
    })
    y -= 18

    if (workers.length === 0) {
      page.drawText("No workers with hours this week.", {
        x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
      })
      y -= 20
    } else {
      for (const worker of workers) {
        checkPageBreak(20)

        page.drawText(`${sanitizeText(worker.name)} - ${worker.levelAbbr}`, {
          x: margin + 15, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1),
        })
        page.drawText(`${worker.totalHours} hrs`, {
          x: margin + 280, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.2),
        })
        page.drawText(`(ST:${worker.totalST} OT:${worker.totalOT} DT:${worker.totalDT})`, {
          x: margin + 350, y, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4),
        })
        y -= 16
      }
    }

    y -= 20

    // ===== EQUIPMENT USAGE (Grouped by Machine) =====
    const equipmentByMachine = new Map<string, string[]>() // equipment -> dates used
    for (const report of fieldReports) {
      if (report.equipment && Array.isArray(report.equipment)) {
        for (const eq of report.equipment) {
          if (eq && eq.trim()) {
            const eqName = sanitizeText(eq)
            if (!equipmentByMachine.has(eqName)) {
              equipmentByMachine.set(eqName, [])
            }
            equipmentByMachine.get(eqName)!.push(report.work_date)
          }
        }
      }
    }

    if (equipmentByMachine.size > 0) {
      checkPageBreak(60)
      page.drawText("EQUIPMENT USAGE", {
        x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
      })
      y -= 18

      for (const [equipment, dates] of equipmentByMachine) {
        checkPageBreak(35)
        
        page.drawText(equipment, {
          x: margin + 15, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2),
        })
        y -= 14

        const datesList = dates.map(d => formatShortDate(d)).join(", ")
        page.drawText(`• ${datesList}`, {
          x: margin + 25, y, size: 9, font: fontRegular, color: rgb(0.4, 0.4, 0.4),
        })
        y -= 16
      }
      y -= 10
    }

    // ===== DAILY WORK SUMMARY =====
    const reportsWithWork = fieldReports.filter(r => r.work_performed && r.work_performed.trim())
    if (reportsWithWork.length > 0) {
      checkPageBreak(60)
      page.drawText("DAILY WORK SUMMARY", {
        x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
      })
      y -= 18

      for (const report of reportsWithWork) {
        checkPageBreak(40)

        const dateLabel = formatShortDate(report.work_date)
        page.drawText(dateLabel, {
          x: margin + 15, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2),
        })
        y -= 14

        // Wrap long text
        const workText = sanitizeText(report.work_performed)
        const maxLineLen = 80
        const lines: string[] = []
        let remaining = workText
        while (remaining.length > maxLineLen) {
          let breakPoint = remaining.lastIndexOf(" ", maxLineLen)
          if (breakPoint === -1) breakPoint = maxLineLen
          lines.push(remaining.substring(0, breakPoint))
          remaining = remaining.substring(breakPoint).trim()
        }
        if (remaining) lines.push(remaining)

        for (const line of lines.slice(0, 3)) { // Max 3 lines per day
          checkPageBreak(14)
          page.drawText(`- ${line}`, {
            x: margin + 25, y, size: 9, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
          })
          y -= 12
        }
        y -= 6
      }
      y -= 10
    }

    // ===== NOTES/PROBLEMS =====
    const reportsWithNotes = fieldReports.filter(r => r.problems_notes && r.problems_notes.trim())
    if (reportsWithNotes.length > 0) {
      checkPageBreak(50)
      page.drawText("NOTES & ISSUES", {
        x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
      })
      y -= 18

      for (const report of reportsWithNotes) {
        checkPageBreak(30)
        const dateLabel = formatShortDate(report.work_date)
        const noteText = sanitizeText(report.problems_notes).substring(0, 100)
        page.drawText(`${dateLabel}: ${noteText}`, {
          x: margin + 15, y, size: 9, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
        })
        y -= 14
      }
      y -= 10
    }

    // ===== PHOTOS SECTION =====
    // Group photos by date
    const photosByDate = new Map<string, ReportPhotoData[]>()
    for (const photo of photos) {
      if (!photosByDate.has(photo.work_date)) {
        photosByDate.set(photo.work_date, [])
      }
      photosByDate.get(photo.work_date)!.push(photo)
    }

    if (photosByDate.size > 0) {
      checkPageBreak(60)
      page.drawText("PHOTOS", {
        x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
      })
      y -= 18

      for (const [date, datePhotos] of photosByDate) {
        checkPageBreak(30)
        const dateLabel = formatShortDate(date)
        page.drawText(`${dateLabel} - ${datePhotos.length} photo(s)`, {
          x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
        })
        y -= 14

        // List photo captions if available
        for (const photo of datePhotos.slice(0, 3)) {
          if (photo.caption) {
            checkPageBreak(14)
            page.drawText(`• ${sanitizeText(photo.caption).substring(0, 60)}`, {
              x: margin + 25, y, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
            })
            y -= 12
          }
        }
        y -= 6
      }
    }

    // ===== FOOTER =====
    page.drawText(`Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, {
      x: margin, y: margin, size: 8, font: fontRegular, color: rgb(0.6, 0.6, 0.6),
    })

    const pdfBytes = await doc.save()

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Weekly_Summary_${weekStart}.pdf"`,
        "Content-Length": pdfBytes.length.toString(),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF generation failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
