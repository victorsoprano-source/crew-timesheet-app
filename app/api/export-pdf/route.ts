import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createClient } from "@/lib/supabase/server"

// Get level abbreviation
function getLevelAbbr(level: string): string {
  switch (level) {
    case "Journeyman": return "JM"
    case "Apprentice Year 1": return "APP1"
    case "Apprentice Year 2": return "APP2"
    case "Apprentice Year 3": return "APP3"
    default: return "JM"
  }
}

// Format date as short weekday
function formatShortDay(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00")
  return date.toLocaleDateString("en-US", { weekday: "short" })
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get("weekStart")

    if (!weekStart) {
      return NextResponse.json({ error: "Missing weekStart parameter" }, { status: 400 })
    }

    const supabase = await createClient()

    // Calculate week dates
    const weekStartDate = new Date(weekStart + "T12:00:00")
    const weekEnd = new Date(weekStartDate)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndStr = weekEnd.toISOString().split("T")[0]

    // Generate array of 7 dates
    const weekDates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate)
      d.setDate(d.getDate() + i)
      weekDates.push(d.toISOString().split("T")[0])
    }

    // Find the timesheet for this week
    const { data: timesheet, error: timesheetError } = await supabase
      .from("timesheets")
      .select("id")
      .eq("week_start", weekStart)
      .single()

    if (timesheetError || !timesheet) {
      return NextResponse.json({ error: "No timesheet found for this week" }, { status: 404 })
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
        worker:workers(id, name, trade, level)
      `)
      .eq("timesheet_id", timesheet.id)

    if (entriesError) {
      return NextResponse.json({ error: "Error fetching timesheet entries" }, { status: 500 })
    }

    // Build worker data map
    interface WorkerData {
      name: string
      level: string
      dailyHours: { [date: string]: { st: number; ot: number; dt: number } }
      totalST: number
      totalOT: number
      totalDT: number
      totalHours: number
    }
    
    const workerMap = new Map<string, WorkerData>()

    for (const entry of entries || []) {
      const status = (entry as { attendance_status?: string }).attendance_status
      const isAbsent = status === "Absent"
      
      const st = isAbsent ? 0 : (Number(entry.regular_hours) || 0)
      const ot = isAbsent ? 0 : (Number(entry.overtime_hours) || 0)
      const dt = isAbsent ? 0 : (Number(entry.double_time_hours) || 0)
      const workDate = (entry as { work_date?: string }).work_date || ""

      const worker = entry.worker as { id: string; name: string; trade: string; level?: string } | null
      const workerLevel = worker?.level || "Journeyman"

      let workerData = workerMap.get(entry.worker_id)
      if (!workerData) {
        workerData = {
          name: worker?.name || "Unknown",
          level: workerLevel,
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

    // Convert to sorted array
    const workers = Array.from(workerMap.values())
      .filter(w => w.totalHours > 0)
      .sort((a, b) => a.name.localeCompare(b.name))

    // Calculate grand totals
    let grandTotalST = 0
    let grandTotalOT = 0
    let grandTotalDT = 0
    for (const w of workers) {
      grandTotalST += w.totalST
      grandTotalOT += w.totalOT
      grandTotalDT += w.totalDT
    }
    const grandTotal = grandTotalST + grandTotalOT + grandTotalDT

    // Create PDF document (landscape)
    const pdfDoc = await PDFDocument.create()
    const page = pdfDoc.addPage([792, 612]) // Letter landscape
    const { width, height } = page.getSize()

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    const margin = 40
    let y = height - margin

    // Header
    page.drawText("Ahern Painting Cont., Inc.", {
      x: margin,
      y,
      size: 16,
      font: fontBold,
      color: rgb(0, 0, 0),
    })
    y -= 20

    page.drawText("Weekly Timesheet Report", {
      x: margin,
      y,
      size: 12,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    })
    y -= 25

    // Job info
    page.drawText(`Job: C34921R`, {
      x: margin,
      y,
      size: 10,
      font: fontBold,
      color: rgb(0, 0, 0),
    })

    const weekRangeText = `Week: ${new Date(weekStart + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${new Date(weekEndStr + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
    page.drawText(weekRangeText, {
      x: margin + 150,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0, 0, 0),
    })
    y -= 30

    // Table setup
    const tableLeft = margin
    const colWidths = [140, 65, 65, 65, 65, 65, 65, 65, 80] // Name + 7 days + Total
    const rowHeight = 22
    const headerHeight = 35

    // Draw table header background
    page.drawRectangle({
      x: tableLeft,
      y: y - headerHeight,
      width: colWidths.reduce((a, b) => a + b, 0),
      height: headerHeight,
      color: rgb(0.15, 0.15, 0.2),
    })

    // Table header text
    let colX = tableLeft + 5
    page.drawText("Worker", { x: colX, y: y - 15, size: 9, font: fontBold, color: rgb(1, 1, 1) })
    page.drawText("(Class)", { x: colX, y: y - 27, size: 8, font: fontRegular, color: rgb(0.7, 0.7, 0.7) })
    colX += colWidths[0]

    // Day headers
    for (let i = 0; i < 7; i++) {
      const dayLabel = formatShortDay(weekDates[i])
      const dateNum = new Date(weekDates[i] + "T12:00:00").getDate().toString()
      page.drawText(dayLabel, { x: colX + 15, y: y - 15, size: 9, font: fontBold, color: rgb(1, 1, 1) })
      page.drawText(dateNum, { x: colX + 22, y: y - 27, size: 8, font: fontRegular, color: rgb(0.7, 0.7, 0.7) })
      colX += colWidths[i + 1]
    }

    // Total header
    page.drawText("Total", { x: colX + 20, y: y - 20, size: 9, font: fontBold, color: rgb(1, 1, 1) })

    y -= headerHeight

    // Draw worker rows
    let rowIndex = 0
    for (const worker of workers) {
      // Alternate row colors
      if (rowIndex % 2 === 0) {
        page.drawRectangle({
          x: tableLeft,
          y: y - rowHeight,
          width: colWidths.reduce((a, b) => a + b, 0),
          height: rowHeight,
          color: rgb(0.95, 0.95, 0.95),
        })
      }

      colX = tableLeft + 5
      
      // Worker name with level abbreviation
      const nameWithLevel = `${worker.name} (${getLevelAbbr(worker.level)})`
      page.drawText(nameWithLevel.length > 22 ? nameWithLevel.slice(0, 22) + "..." : nameWithLevel, {
        x: colX,
        y: y - 14,
        size: 8,
        font: fontRegular,
        color: rgb(0, 0, 0),
      })
      colX += colWidths[0]

      // Daily hours
      for (let i = 0; i < 7; i++) {
        const dayData = worker.dailyHours[weekDates[i]]
        if (dayData) {
          const total = dayData.st + dayData.ot + dayData.dt
          if (total > 0) {
            // Show breakdown if there's OT or DT, otherwise just the number
            let hoursText: string
            if (dayData.ot > 0 || dayData.dt > 0) {
              hoursText = `${dayData.st}/${dayData.ot}/${dayData.dt}`
            } else {
              hoursText = dayData.st.toString()
            }
            page.drawText(hoursText, {
              x: colX + 10,
              y: y - 14,
              size: 8,
              font: fontRegular,
              color: rgb(0, 0, 0),
            })
          }
        }
        colX += colWidths[i + 1]
      }

      // Worker total
      page.drawText(worker.totalHours.toString(), {
        x: colX + 25,
        y: y - 14,
        size: 9,
        font: fontBold,
        color: rgb(0, 0, 0),
      })

      y -= rowHeight
      rowIndex++

      // Check if we need a new page
      if (y < margin + 60) {
        // For simplicity, we'll stop here - in production you'd add a new page
        break
      }
    }

    // Totals row
    page.drawRectangle({
      x: tableLeft,
      y: y - rowHeight,
      width: colWidths.reduce((a, b) => a + b, 0),
      height: rowHeight,
      color: rgb(0.2, 0.2, 0.25),
    })

    colX = tableLeft + 5
    page.drawText("TOTALS", { x: colX, y: y - 14, size: 9, font: fontBold, color: rgb(1, 1, 1) })
    colX += colWidths.reduce((a, b) => a + b, 0) - colWidths[colWidths.length - 1] - 5

    page.drawText(grandTotal.toString(), {
      x: colX + 30,
      y: y - 14,
      size: 10,
      font: fontBold,
      color: rgb(1, 1, 1),
    })

    y -= rowHeight + 15

    // Summary
    page.drawText(`ST: ${grandTotalST}  |  OT: ${grandTotalOT}  |  DT: ${grandTotalDT}  |  Total: ${grandTotal} hrs`, {
      x: margin,
      y: y,
      size: 9,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    })

    y -= 15
    page.drawText("ST = Straight Time | OT = Overtime | DT = Double Time | JM = Journeyman | APP = Apprentice", {
      x: margin,
      y: y,
      size: 7,
      font: fontRegular,
      color: rgb(0.5, 0.5, 0.5),
    })

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save()

    // Return PDF as download
    const filename = `Weekly_Timesheet_${weekStart}.pdf`
    
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": pdfBytes.length.toString(),
      },
    })
  } catch (error) {
    console.error("PDF generation error:", error)
    return NextResponse.json(
      { error: "Error generating PDF" },
      { status: 500 }
    )
  }
}
