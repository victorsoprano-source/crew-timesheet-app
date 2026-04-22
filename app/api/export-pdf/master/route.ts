import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createClient } from "@/lib/supabase/server"

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

interface WorkerDailyData {
  name: string
  level: string
  levelAbbr: string
  dailyHours: { [date: string]: { st: number; ot: number; dt: number } }
  totalST: number
  totalOT: number
  totalDT: number
  totalHours: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get("weekStart")

    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: "Invalid weekStart parameter" }, { status: 400 })
    }

    const supabase = await withTimeout(createClient(), 5000, "Supabase client creation")

    // Calculate week dates (Wed through Tue)
    const weekStartDate = new Date(weekStart + "T12:00:00")
    const weekDates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate)
      d.setDate(d.getDate() + i)
      weekDates.push(d.toISOString().split("T")[0])
    }
    const weekEndStr = weekDates[6]

    // Find timesheet
    const timesheetResult = await withTimeout(
      supabase.from("timesheets").select("id").eq("week_start", weekStart).single(),
      10000,
      "Timesheet query"
    )

    if (timesheetResult.error || !timesheetResult.data) {
      return generateMasterPDF(weekStart, weekEndStr, weekDates, [], null)
    }

    // Get entries with worker info including level
    const entriesResult = await withTimeout(
      supabase
        .from("timesheet_entries")
        .select(`
          worker_id,
          work_date,
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

    if (entriesResult.error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    // Build worker data map
    const workerMap = new Map<string, WorkerDailyData>()

    for (const entry of entriesResult.data || []) {
      const isAbsent = entry.attendance_status === "Absent"
      const st = isAbsent ? 0 : (Number(entry.regular_hours) || 0)
      const ot = isAbsent ? 0 : (Number(entry.overtime_hours) || 0)
      const dt = isAbsent ? 0 : (Number(entry.double_time_hours) || 0)
      const workDate = entry.work_date || ""

      const worker = entry.worker as { id: string; name: string; level?: string } | null
      const workerLevel = worker?.level || "Journeyman"

      let workerData = workerMap.get(entry.worker_id)
      if (!workerData) {
        workerData = {
          name: worker?.name || "Unknown",
          level: workerLevel,
          levelAbbr: getLevelAbbr(workerLevel),
          dailyHours: {},
          totalST: 0,
          totalOT: 0,
          totalDT: 0,
          totalHours: 0,
        }
        workerMap.set(entry.worker_id, workerData)
      }

      workerData.dailyHours[workDate] = { st, ot, dt }
      workerData.totalST += st
      workerData.totalOT += ot
      workerData.totalDT += dt
      workerData.totalHours += st + ot + dt
    }

    // Get notes from field reports
    const notesResult = await supabase
      .from("daily_field_reports")
      .select("work_date, problems_notes")
      .eq("week_start", weekStart)
      .not("problems_notes", "is", null)
      .order("work_date", { ascending: true })

    let notes: string | null = null
    if (notesResult.data && notesResult.data.length > 0) {
      const noteEntries = notesResult.data
        .filter(r => r.problems_notes?.trim())
        .map(r => {
          const d = new Date(r.work_date + "T12:00:00")
          return `${d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}: ${r.problems_notes}`
        })
      if (noteEntries.length > 0) {
        notes = noteEntries.join(" | ")
      }
    }

    const workers = Array.from(workerMap.values())
      .filter(w => w.totalHours > 0)
      .sort((a, b) => a.name.localeCompare(b.name))

    return generateMasterPDF(weekStart, weekEndStr, weekDates, workers, notes)

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function generateMasterPDF(
  weekStart: string,
  weekEnd: string,
  weekDates: string[],
  workers: WorkerDailyData[],
  notes: string | null
): Promise<NextResponse> {
  try {
    // Landscape orientation: 792 x 612 (11" x 8.5")
    const doc = await PDFDocument.create()
    const page = doc.addPage([792, 612])
    const { width, height } = page.getSize()
    
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

    const margin = 30
    let y = height - margin

    // Header
    page.drawText("WEEKLY TIMESHEET MASTER", {
      x: margin, y, size: 16, font: fontBold, color: rgb(0, 0, 0),
    })
    y -= 20

    page.drawText("Ahern Painting Cont., Inc.", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.2),
    })
    page.drawText("Job: C34921R", {
      x: margin + 200, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.2),
    })
    y -= 16

    const startFmt = new Date(weekStart + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
    const endFmt = new Date(weekEnd + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    page.drawText(`Week: ${startFmt} - ${endFmt}`, {
      x: margin, y, size: 10, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
    })
    y -= 25

    // Table setup
    const tableX = margin
    const tableWidth = width - (margin * 2)
    const nameColWidth = 140
    const dayColWidth = 70
    const totalColWidth = 60
    const rowHeight = 24
    const headerHeight = 30

    // Day names for columns
    const dayNames = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"]

    // Draw table header
    const headerY = y
    
    // Header background
    page.drawRectangle({
      x: tableX,
      y: headerY - headerHeight,
      width: tableWidth,
      height: headerHeight,
      color: rgb(0.15, 0.15, 0.25),
    })

    // Column headers
    let colX = tableX + 5
    page.drawText("Worker Name", {
      x: colX, y: headerY - 12, size: 9, font: fontBold, color: rgb(1, 1, 1),
    })
    page.drawText("Classification", {
      x: colX, y: headerY - 22, size: 7, font: fontRegular, color: rgb(0.8, 0.8, 0.8),
    })
    colX = tableX + nameColWidth

    // Day column headers
    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(weekDates[i] + "T12:00:00")
      const dayNum = dayDate.getDate()
      
      page.drawText(dayNames[i], {
        x: colX + 20, y: headerY - 12, size: 9, font: fontBold, color: rgb(1, 1, 1),
      })
      page.drawText(String(dayNum), {
        x: colX + 28, y: headerY - 22, size: 7, font: fontRegular, color: rgb(0.8, 0.8, 0.8),
      })
      
      colX += dayColWidth
    }

    // Total column
    page.drawText("Total", {
      x: colX + 10, y: headerY - 16, size: 9, font: fontBold, color: rgb(1, 1, 1),
    })

    y = headerY - headerHeight

    // Draw vertical lines for columns
    const tableBottom = y - (workers.length + 1) * rowHeight - 10
    
    // Name column line
    page.drawLine({
      start: { x: tableX + nameColWidth, y: headerY },
      end: { x: tableX + nameColWidth, y: Math.max(tableBottom, margin + 50) },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    })

    // Day column lines
    for (let i = 0; i < 7; i++) {
      const lineX = tableX + nameColWidth + (i + 1) * dayColWidth
      page.drawLine({
        start: { x: lineX, y: headerY },
        end: { x: lineX, y: Math.max(tableBottom, margin + 50) },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      })
    }

    // Draw worker rows
    let grandTotalST = 0
    let grandTotalOT = 0
    let grandTotalDT = 0

    for (const worker of workers) {
      if (y < margin + 80) break // Leave room for totals and notes

      // Alternate row background
      const rowIndex = workers.indexOf(worker)
      if (rowIndex % 2 === 0) {
        page.drawRectangle({
          x: tableX,
          y: y - rowHeight,
          width: tableWidth,
          height: rowHeight,
          color: rgb(0.97, 0.97, 0.97),
        })
      }

      // Worker name with classification
      colX = tableX + 5
      page.drawText(`${worker.name} - ${worker.levelAbbr}`, {
        x: colX, y: y - 15, size: 8, font: fontBold, color: rgb(0, 0, 0),
      })

      colX = tableX + nameColWidth

      // Daily hours
      for (let i = 0; i < 7; i++) {
        const date = weekDates[i]
        const hours = worker.dailyHours[date] || { st: 0, ot: 0, dt: 0 }
        const isWeekend = i === 3 || i === 4 // Sat or Sun

        let hoursText = ""
        if (isWeekend) {
          // Weekend: only show OT/DT
          if (hours.ot > 0 || hours.dt > 0) {
            const parts = []
            if (hours.ot > 0) parts.push(`${hours.ot}ot`)
            if (hours.dt > 0) parts.push(`${hours.dt}dt`)
            hoursText = parts.join("/")
          }
        } else {
          // Weekday: show ST/OT/DT
          const parts = []
          if (hours.st > 0) parts.push(`${hours.st}`)
          if (hours.ot > 0) parts.push(`${hours.ot}ot`)
          if (hours.dt > 0) parts.push(`${hours.dt}dt`)
          hoursText = parts.join("/")
        }

        if (hoursText) {
          page.drawText(hoursText, {
            x: colX + 8, y: y - 15, size: 7, font: fontRegular, color: rgb(0.1, 0.1, 0.1),
          })
        }

        colX += dayColWidth
      }

      // Total hours
      page.drawText(`${worker.totalHours}`, {
        x: colX + 15, y: y - 15, size: 9, font: fontBold, color: rgb(0, 0, 0),
      })

      grandTotalST += worker.totalST
      grandTotalOT += worker.totalOT
      grandTotalDT += worker.totalDT

      y -= rowHeight
    }

    // Draw horizontal line above totals
    page.drawLine({
      start: { x: tableX, y: y },
      end: { x: tableX + tableWidth, y: y },
      thickness: 1,
      color: rgb(0.3, 0.3, 0.3),
    })

    // Totals row
    y -= 5
    page.drawText("TOTALS:", {
      x: tableX + 5, y: y - 12, size: 9, font: fontBold, color: rgb(0, 0, 0),
    })

    const grandTotal = grandTotalST + grandTotalOT + grandTotalDT
    colX = tableX + nameColWidth + (7 * dayColWidth)
    page.drawText(`${grandTotal}`, {
      x: colX + 12, y: y - 12, size: 10, font: fontBold, color: rgb(0, 0, 0),
    })

    y -= 25

    // Hour breakdown
    page.drawText(`ST: ${grandTotalST}   OT: ${grandTotalOT}   DT: ${grandTotalDT}`, {
      x: tableX + 5, y: y - 5, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
    })

    y -= 25

    // Notes section
    if (notes && y > margin + 30) {
      page.drawText("Notes:", {
        x: tableX, y: y, size: 9, font: fontBold, color: rgb(0, 0, 0),
      })
      y -= 12
      
      // Truncate notes if too long
      const maxNoteLen = 150
      const displayNotes = notes.length > maxNoteLen ? notes.substring(0, maxNoteLen) + "..." : notes
      page.drawText(displayNotes, {
        x: tableX, y: y, size: 8, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
      })
    }

    // Legend at bottom
    page.drawText("Legend: ST = Straight Time, OT = Overtime, DT = Double Time | JM = Journeyman, APP1/2/3 = Apprentice Year 1/2/3", {
      x: margin, y: margin, size: 7, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
    })

    const pdfBytes = await doc.save()

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Weekly_Timesheet_Master_${weekStart}.pdf"`,
        "Content-Length": pdfBytes.length.toString(),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF generation failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
