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

function formatDateWithMonth(dateStr: string): string {
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

    // Draw horizontal rule
    const drawHR = () => {
      page.drawLine({
        start: { x: margin, y: y },
        end: { x: width - margin, y: y },
        thickness: 0.5,
        color: rgb(0.85, 0.85, 0.85),
      })
      y -= 15
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
    y -= 25
    drawHR()

    // ===== CREW COMPOSITION THIS WEEK =====
    page.drawText("CREW COMPOSITION THIS WEEK", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
    })
    y -= 20

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

    // Format as requested: "Journeyman: X"
    page.drawText(`Journeyman: ${jmCount}`, { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
    y -= 14
    page.drawText(`Apprentice Year 1: ${app1Count}`, { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
    y -= 14
    page.drawText(`Apprentice Year 2: ${app2Count}`, { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
    y -= 14
    page.drawText(`Apprentice Year 3: ${app3Count}`, { x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.2, 0.2, 0.2) })
    y -= 25
    drawHR()

    // ===== EQUIPMENT SUMMARY (Count at top) =====
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

    page.drawText("EQUIPMENT SUMMARY", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
    })
    y -= 20

    page.drawText(`Total Equipment Types: ${equipmentByMachine.size}`, {
      x: margin + 15, y, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.3),
    })
    y -= 20

    // List each equipment with dates
    if (equipmentByMachine.size > 0) {
      for (const [equipment, dates] of equipmentByMachine) {
        checkPageBreak(40)
        
        page.drawText(equipment, {
          x: margin + 15, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2),
        })
        y -= 14

        page.drawText("Used:", {
          x: margin + 25, y, size: 9, font: fontRegular, color: rgb(0.4, 0.4, 0.4),
        })
        y -= 12

        // List dates as bullet points
        for (const dateStr of dates) {
          checkPageBreak(14)
          page.drawText(`  - ${formatDateWithMonth(dateStr)}`, {
            x: margin + 25, y, size: 9, font: fontRegular, color: rgb(0.4, 0.4, 0.4),
          })
          y -= 12
        }
        y -= 6
      }
    } else {
      page.drawText("No equipment recorded this week.", {
        x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
      })
      y -= 14
    }
    y -= 10
    drawHR()

    // ===== WEEKLY TOTALS BOX with Overtime Highlight =====
    let totalST = 0, totalOT = 0, totalDT = 0
    for (const w of workers) {
      totalST += w.totalST
      totalOT += w.totalOT
      totalDT += w.totalDT
    }
    const totalHours = totalST + totalOT + totalDT

    checkPageBreak(100)
    
    page.drawText("WEEKLY TOTALS", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
    })
    y -= 20

    // Draw totals box
    page.drawRectangle({
      x: margin,
      y: y - 70,
      width: width - (margin * 2),
      height: 70,
      color: rgb(0.95, 0.95, 0.98),
      borderColor: rgb(0.8, 0.8, 0.85),
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
    
    // Highlight Overtime in amber/orange
    page.drawText(`${totalOT}`, { x: margin + 15 + colWidth * 3, y: valY, size: 16, font: fontBold, color: rgb(0.85, 0.55, 0.1) })
    
    // Highlight Double Time in red
    page.drawText(`${totalDT}`, { x: margin + 15 + colWidth * 4, y: valY, size: 16, font: fontBold, color: rgb(0.8, 0.2, 0.2) })

    y -= 90
    drawHR()

    // ===== WORKER DETAILS =====
    checkPageBreak(80)
    page.drawText("WORKER DETAILS", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
    })
    y -= 20

    if (workers.length === 0) {
      page.drawText("No workers with hours this week.", {
        x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
      })
      y -= 20
    } else {
      for (const worker of workers) {
        checkPageBreak(20)

        page.drawText(`${sanitizeText(worker.name)} (${worker.levelAbbr})`, {
          x: margin + 15, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1),
        })
        page.drawText(`${worker.totalHours} hrs`, {
          x: margin + 280, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.2),
        })
        page.drawText(`ST: ${worker.totalST}  OT: ${worker.totalOT}  DT: ${worker.totalDT}`, {
          x: margin + 350, y, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4),
        })
        y -= 18
      }
    }

    y -= 15
    drawHR()

    // ===== DAILY WORK SUMMARY (Bullet points per day) =====
    const reportsWithWork = fieldReports.filter(r => r.work_performed && r.work_performed.trim())
    if (reportsWithWork.length > 0) {
      checkPageBreak(60)
      page.drawText("DAILY WORK SUMMARY", {
        x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
      })
      y -= 20

      for (const report of reportsWithWork) {
        checkPageBreak(50)

        const dateLabel = formatShortDate(report.work_date)
        page.drawText(dateLabel, {
          x: margin + 15, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2),
        })
        y -= 16

        // Convert work performed text to bullet points
        const workText = sanitizeText(report.work_performed)
        
        // Split by common delimiters (periods, semicolons, newlines, or numbered lists)
        const bullets = workText
          .split(/[.;]\s*|\n+|\d+[.)]\s*/)
          .map(s => s.trim())
          .filter(s => s.length > 3) // Filter out very short fragments
        
        for (const bullet of bullets.slice(0, 5)) { // Max 5 bullets per day
          checkPageBreak(14)
          const bulletText = bullet.length > 70 ? bullet.substring(0, 67) + "..." : bullet
          page.drawText(`  - ${bulletText}`, {
            x: margin + 25, y, size: 9, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
          })
          y -= 13
        }
        y -= 8
      }
      y -= 10
      drawHR()
    }

    // ===== NOTES/PROBLEMS =====
    const reportsWithNotes = fieldReports.filter(r => r.problems_notes && r.problems_notes.trim())
    if (reportsWithNotes.length > 0) {
      checkPageBreak(50)
      page.drawText("NOTES & ISSUES", {
        x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
      })
      y -= 20

      for (const report of reportsWithNotes) {
        checkPageBreak(30)
        const dateLabel = formatShortDate(report.work_date)
        page.drawText(dateLabel, {
          x: margin + 15, y, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.3),
        })
        y -= 14
        
        const noteText = sanitizeText(report.problems_notes)
        // Split into bullet points
        const noteBullets = noteText
          .split(/[.;]\s*|\n+/)
          .map(s => s.trim())
          .filter(s => s.length > 3)
        
        for (const bullet of noteBullets.slice(0, 3)) {
          checkPageBreak(14)
          const bulletText = bullet.length > 70 ? bullet.substring(0, 67) + "..." : bullet
          page.drawText(`  - ${bulletText}`, {
            x: margin + 25, y, size: 9, font: fontRegular, color: rgb(0.4, 0.4, 0.4),
          })
          y -= 13
        }
        y -= 6
      }
      y -= 10
      drawHR()
    }

    // ===== PHOTOS SECTION (with thumbnails placeholder and captions) =====
    const photosByDate = new Map<string, ReportPhotoData[]>()
    for (const photo of photos) {
      if (!photosByDate.has(photo.work_date)) {
        photosByDate.set(photo.work_date, [])
      }
      photosByDate.get(photo.work_date)!.push(photo)
    }

    if (photosByDate.size > 0) {
      checkPageBreak(80)
      page.drawText("PHOTOS", {
        x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
      })
      y -= 20

      for (const [date, datePhotos] of photosByDate) {
        checkPageBreak(50)
        const dateLabel = formatShortDate(date)
        page.drawText(dateLabel, {
          x: margin + 15, y, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.3),
        })
        y -= 16

        // Draw photo placeholders (thumbnails) - in a row
        const thumbWidth = 80
        const thumbHeight = 60
        const thumbSpacing = 10
        let thumbX = margin + 25

        for (let i = 0; i < Math.min(datePhotos.length, 4); i++) {
          const photo = datePhotos[i]
          
          // Draw thumbnail placeholder box
          page.drawRectangle({
            x: thumbX,
            y: y - thumbHeight,
            width: thumbWidth,
            height: thumbHeight,
            borderColor: rgb(0.7, 0.7, 0.7),
            borderWidth: 0.5,
            color: rgb(0.95, 0.95, 0.95),
          })

          // Draw image icon in center
          page.drawText("[IMG]", {
            x: thumbX + 25,
            y: y - thumbHeight / 2 - 4,
            size: 10,
            font: fontRegular,
            color: rgb(0.6, 0.6, 0.6),
          })

          thumbX += thumbWidth + thumbSpacing
        }
        y -= thumbHeight + 8

        // Photo captions
        for (let i = 0; i < Math.min(datePhotos.length, 4); i++) {
          const photo = datePhotos[i]
          if (photo.caption) {
            checkPageBreak(14)
            const captionText = sanitizeText(photo.caption).substring(0, 50)
            page.drawText(`  Photo ${i + 1}: ${captionText}`, {
              x: margin + 25, y, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
            })
            y -= 12
          }
        }
        y -= 10
      }
      y -= 10
      drawHR()
    }

    // ===== FOREMAN SIGNATURE SECTION =====
    checkPageBreak(100)
    page.drawText("FOREMAN SIGNATURE", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
    })
    y -= 30

    page.drawText("Foreman: _________________________________", {
      x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
    })
    y -= 25

    page.drawText("Signature: _________________________________", {
      x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
    })
    y -= 25

    page.drawText("Date: _________________________________", {
      x: margin + 15, y, size: 10, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
    })
    y -= 30

    // ===== FOOTER =====
    page.drawText(`Generated: ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, {
      x: margin, y: margin - 10, size: 8, font: fontRegular, color: rgb(0.6, 0.6, 0.6),
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
