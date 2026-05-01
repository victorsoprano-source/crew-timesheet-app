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

    return generateSummaryPDF(weekStart, weekEndStr, isWeekComplete, workers, fieldReports)

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
  fieldReports: DailyFieldReportData[]
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

    // Draw horizontal rule
    const drawHR = () => {
      page.drawLine({
        start: { x: margin, y: y },
        end: { x: width - margin, y: y },
        thickness: 0.5,
        color: rgb(0.8, 0.8, 0.8),
      })
      y -= 15
    }

    // ===== HEADER with Ahern Branding =====
    // Green header bar
    page.drawRectangle({
      x: 0,
      y: height - 60,
      width: width,
      height: 60,
      color: rgb(0.12, 0.30, 0.23), // #1F4D3A deep green
    })
    
    // Company name in gold
    page.drawText("AHERN PAINTING CONTRACTORS INC.", {
      x: margin, y: height - 38, size: 16, font: fontBold, color: rgb(0.79, 0.65, 0.27), // #C9A646 gold
    })
    
    y = height - 85

    page.drawText("WEEKLY SUMMARY REPORT", {
      x: margin, y, size: 14, font: fontBold, color: rgb(0.12, 0.30, 0.23),
    })
    y -= 22

    page.drawText("Job: C34921R", {
      x: margin, y, size: 11, font: fontRegular, color: rgb(0.4, 0.4, 0.4),
    })
    y -= 20

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
    y -= 25
    drawHR()

    // ===== WEEKLY TOTALS BOX =====
    let totalST = 0, totalOT = 0, totalDT = 0
    for (const w of workers) {
      totalST += w.totalST
      totalOT += w.totalOT
      totalDT += w.totalDT
    }
    const totalHours = totalST + totalOT + totalDT

    page.drawText("SUMMARY", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
    })
    y -= 20

    // Draw totals box
    page.drawRectangle({
      x: margin,
      y: y - 70,
      width: width - (margin * 2),
      height: 70,
      color: rgb(0.96, 0.96, 0.98),
      borderColor: rgb(0.85, 0.85, 0.88),
      borderWidth: 1,
    })

    const boxY = y - 20
    const colWidth = (width - margin * 2) / 5

    // Row 1: Labels
    page.drawText("Workers", { x: margin + 15, y: boxY, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })
    page.drawText("Total Hours", { x: margin + 15 + colWidth, y: boxY, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })
    page.drawText("Straight Time", { x: margin + 15 + colWidth * 2, y: boxY, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })
    page.drawText("Overtime", { x: margin + 15 + colWidth * 3, y: boxY, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })
    page.drawText("Double Time", { x: margin + 15 + colWidth * 4, y: boxY, size: 9, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })

    // Row 2: Values (with highlighted OT/DT)
    const valY = boxY - 25
    page.drawText(`${workers.length}`, { x: margin + 15, y: valY, size: 18, font: fontBold, color: rgb(0.1, 0.1, 0.2) })
    page.drawText(`${totalHours}`, { x: margin + 15 + colWidth, y: valY, size: 18, font: fontBold, color: rgb(0.1, 0.1, 0.2) })
    page.drawText(`${totalST}`, { x: margin + 15 + colWidth * 2, y: valY, size: 16, font: fontBold, color: rgb(0.2, 0.5, 0.3) })
    // Overtime in amber
    page.drawText(`${totalOT}`, { x: margin + 15 + colWidth * 3, y: valY, size: 16, font: fontBold, color: rgb(0.85, 0.55, 0.1) })
    // Double Time in red
    page.drawText(`${totalDT}`, { x: margin + 15 + colWidth * 4, y: valY, size: 16, font: fontBold, color: rgb(0.8, 0.2, 0.2) })

    y -= 90
    drawHR()

    // ===== CREW COMPOSITION =====
    page.drawText("CREW COMPOSITION", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
    })
    y -= 20

    // Count workers by level
    let jmCount = 0, app1Count = 0, app2Count = 0, app3Count = 0
    for (const w of workers) {
      if (w.totalHours > 0) {
        if (w.level === "Journeyman") jmCount++
        else if (w.level === "Apprentice Year 1") app1Count++
        else if (w.level === "Apprentice Year 2") app2Count++
        else if (w.level === "Apprentice Year 3") app3Count++
        else jmCount++
      }
    }

    page.drawText(`Journeyman: ${jmCount}`, { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
    page.drawText(`Apprentice Year 1: ${app1Count}`, { x: margin + 150, y, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
    y -= 14
    page.drawText(`Apprentice Year 2: ${app2Count}`, { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
    page.drawText(`Apprentice Year 3: ${app3Count}`, { x: margin + 150, y, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
    y -= 25
    drawHR()

    // ===== EQUIPMENT USED =====
    // Group equipment by type and merge duplicate entries with dates
    const equipmentByType = new Map<string, Set<string>>() // equipment -> Set of dates
    for (const report of fieldReports) {
      if (report.equipment && Array.isArray(report.equipment)) {
        for (const eq of report.equipment) {
          if (eq && eq.trim()) {
            const eqName = sanitizeText(eq)
            if (!equipmentByType.has(eqName)) {
              equipmentByType.set(eqName, new Set())
            }
            equipmentByType.get(eqName)!.add(report.work_date)
          }
        }
      }
    }

    // Categorize equipment into types
    const manLifts: [string, string[]][] = []
    const forklifts: [string, string[]][] = []
    const arrowBoards: [string, string[]][] = []
    const otherEquip: [string, string[]][] = []

    for (const [equipment, dates] of equipmentByType) {
      const eqLower = equipment.toLowerCase()
      const dateArr = Array.from(dates).sort()
      if (eqLower.includes("lift") || eqLower.includes("boom") || eqLower.includes("scissor") || eqLower.includes("aerial")) {
        manLifts.push([equipment, dateArr])
      } else if (eqLower.includes("forklift") || eqLower.includes("fork lift")) {
        forklifts.push([equipment, dateArr])
      } else if (eqLower.includes("arrow") || eqLower.includes("board") || eqLower.includes("sign")) {
        arrowBoards.push([equipment, dateArr])
      } else {
        otherEquip.push([equipment, dateArr])
      }
    }

    page.drawText("EQUIPMENT USED", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
    })
    y -= 20

    const drawEquipmentCategory = (title: string, items: [string, string[]][]) => {
      if (items.length === 0) return
      checkPageBreak(30)
      page.drawText(title, { x: margin + 15, y, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.3) })
      y -= 14
      for (const [name, dates] of items) {
        checkPageBreak(14)
        const dateStr = dates.map(d => formatShortDate(d).split(",")[0]).join(", ")
        page.drawText(`  - ${name}`, { x: margin + 25, y, size: 9, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
        page.drawText(`(${dateStr})`, { x: margin + 220, y, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })
        y -= 12
      }
      y -= 6
    }

    drawEquipmentCategory("Man Lifts", manLifts)
    drawEquipmentCategory("Forklifts", forklifts)
    drawEquipmentCategory("Arrow Boards", arrowBoards)
    drawEquipmentCategory("Other Equipment", otherEquip)

    if (equipmentByType.size === 0) {
      page.drawText("No equipment recorded this week.", { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })
      y -= 14
    }

    y -= 10
    drawHR()

    // ===== WORKER DETAILS =====
    checkPageBreak(60)
    page.drawText("WORKER DETAILS", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
    })
    y -= 20

    if (workers.length === 0) {
      page.drawText("No workers with hours this week.", { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.5, 0.5, 0.5) })
      y -= 20
    } else {
      for (const worker of workers) {
        checkPageBreak(18)
        page.drawText(`${sanitizeText(worker.name)} (${worker.levelAbbr})`, {
          x: margin + 15, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1),
        })
        page.drawText(`${worker.totalHours} hrs`, {
          x: margin + 280, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.2),
        })
        page.drawText(`ST: ${worker.totalST}  OT: ${worker.totalOT}  DT: ${worker.totalDT}`, {
          x: margin + 350, y, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4),
        })
        y -= 16
      }
    }

    y -= 10
    drawHR()

    // ===== DAILY WORK SUMMARY (Bullet points) =====
    const reportsWithWork = fieldReports.filter(r => r.work_performed && r.work_performed.trim())
    if (reportsWithWork.length > 0) {
      checkPageBreak(50)
      page.drawText("DAILY WORK SUMMARY", {
        x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
      })
      y -= 20

      for (const report of reportsWithWork) {
        checkPageBreak(40)
        const dateLabel = formatShortDate(report.work_date)
        page.drawText(dateLabel, { x: margin + 15, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) })
        y -= 14

        // Convert to bullet points
        const workText = sanitizeText(report.work_performed)
        const bullets = workText
          .split(/[.;]\s*|\n+|\d+[.)]\s*/)
          .map(s => s.trim())
          .filter(s => s.length > 3)
        
        for (const bullet of bullets.slice(0, 5)) {
          checkPageBreak(12)
          const bulletText = bullet.length > 80 ? bullet.substring(0, 77) + "..." : bullet
          page.drawText(`  - ${bulletText}`, { x: margin + 25, y, size: 9, font: fontRegular, color: rgb(0.3, 0.3, 0.3) })
          y -= 12
        }
        y -= 6
      }
      y -= 10
      drawHR()
    }

    // ===== NOTES =====
    const reportsWithNotes = fieldReports.filter(r => r.problems_notes && r.problems_notes.trim())
    if (reportsWithNotes.length > 0) {
      checkPageBreak(40)
      page.drawText("NOTES", {
        x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
      })
      y -= 20

      for (const report of reportsWithNotes) {
        checkPageBreak(30)
        const dateLabel = formatShortDate(report.work_date)
        page.drawText(dateLabel, { x: margin + 15, y, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.3) })
        y -= 14
        
        const noteText = sanitizeText(report.problems_notes)
        const noteBullets = noteText
          .split(/[.;]\s*|\n+/)
          .map(s => s.trim())
          .filter(s => s.length > 3)
        
        for (const bullet of noteBullets.slice(0, 3)) {
          checkPageBreak(12)
          const bulletText = bullet.length > 80 ? bullet.substring(0, 77) + "..." : bullet
          page.drawText(`  - ${bulletText}`, { x: margin + 25, y, size: 9, font: fontRegular, color: rgb(0.4, 0.4, 0.4) })
          y -= 12
        }
        y -= 6
      }
      y -= 10
      drawHR()
    }

    // ===== FOREMAN SIGNATURE =====
    checkPageBreak(80)
    page.drawText("FOREMAN SIGNATURE", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
    })
    y -= 30

    // Signature line
    page.drawText("Name:", { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.4, 0.4, 0.4) })
    page.drawLine({
      start: { x: margin + 60, y: y - 2 },
      end: { x: margin + 250, y: y - 2 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    })
    y -= 25

    page.drawText("Signature:", { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.4, 0.4, 0.4) })
    page.drawLine({
      start: { x: margin + 80, y: y - 2 },
      end: { x: margin + 250, y: y - 2 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    })
    
    page.drawText("Date:", { x: margin + 300, y, size: 10, font: fontRegular, color: rgb(0.4, 0.4, 0.4) })
    page.drawLine({
      start: { x: margin + 340, y: y - 2 },
      end: { x: width - margin, y: y - 2 },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    })

    // Save PDF
    const pdfBytes = await doc.save()
    
    const startFmtFile = weekStart.replace(/-/g, "")
    const filename = `Weekly_Summary_${startFmtFile}.pdf`

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBytes.length),
      },
    })

  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF generation failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
