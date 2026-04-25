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
    console.error("[v0] Missing Supabase environment variables")
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

/**
 * Sanitize text for PDF rendering - removes/replaces unsupported characters
 */
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

interface WorkerSummary {
  name: string
  levelAbbr: string
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

    const supabase = await withTimeout(createApiClient(), 5000, "Supabase client creation")

    // Calculate week end
    const weekStartDate = new Date(weekStart + "T12:00:00")
    const weekEnd = new Date(weekStartDate)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndStr = weekEnd.toISOString().split("T")[0]

    // Check if week is complete (today > weekEnd)
    const today = new Date()
    const isWeekComplete = today > weekEnd

    // Find timesheet
    const timesheetResult = await withTimeout(
      supabase.from("timesheets").select("id").eq("week_start", weekStart).single(),
      10000,
      "Timesheet query"
    )

    if (timesheetResult.error || !timesheetResult.data) {
      return generateSummaryPDF(weekStart, weekEndStr, isWeekComplete, [], null, null, null)
    }

    // Get entries with worker info
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

    if (entriesResult.error) {
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    // Build worker summaries
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

    // Get field report data (crew counts, equipment, notes)
    const fieldReportsResult = await supabase
      .from("daily_field_reports")
      .select("*")
      .eq("week_start", weekStart)
      .order("work_date", { ascending: true })

    let crewSummary: { jm: number; app1: number; app2: number; app3: number } | null = null
    let equipment: string[] = []
    let notes: string | null = null

    if (fieldReportsResult.data && fieldReportsResult.data.length > 0) {
      // Aggregate crew counts (take max for each category)
      let maxJM = 0, maxApp1 = 0, maxApp2 = 0, maxApp3 = 0
      const allEquipment = new Set<string>()
      const noteEntries: string[] = []

      for (const report of fieldReportsResult.data) {
        maxJM = Math.max(maxJM, report.journeyman_count || 0)
        maxApp1 = Math.max(maxApp1, report.apprentice_year1_count || 0)
        maxApp2 = Math.max(maxApp2, report.apprentice_year2_count || 0)
        maxApp3 = Math.max(maxApp3, report.apprentice_year3_count || 0)

        if (report.equipment && Array.isArray(report.equipment)) {
          for (const eq of report.equipment) {
            if (eq) allEquipment.add(eq)
          }
        }

        if (report.problems_notes?.trim()) {
          const d = new Date(report.work_date + "T12:00:00")
          noteEntries.push(`${d.toLocaleDateString("en-US", { weekday: "short" })}: ${report.problems_notes}`)
        }
      }

      if (maxJM > 0 || maxApp1 > 0 || maxApp2 > 0 || maxApp3 > 0) {
        crewSummary = { jm: maxJM, app1: maxApp1, app2: maxApp2, app3: maxApp3 }
      }

      equipment = Array.from(allEquipment)
      if (noteEntries.length > 0) {
        notes = noteEntries.join(" | ")
      }
    }

    const workers = Array.from(workerMap.values())
      .filter(w => w.totalHours > 0)
      .sort((a, b) => a.name.localeCompare(b.name))

    return generateSummaryPDF(weekStart, weekEndStr, isWeekComplete, workers, crewSummary, equipment.length > 0 ? equipment : null, notes)

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
  crewSummary: { jm: number; app1: number; app2: number; app3: number } | null,
  equipment: string[] | null,
  notes: string | null
): Promise<NextResponse> {
  try {
    // Portrait: 612 x 792 (8.5" x 11")
    const doc = await PDFDocument.create()
    const page = doc.addPage([612, 792])
    const { width, height } = page.getSize()
    
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

    const margin = 50
    let y = height - margin

    // Header
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
    y -= 35

    // Calculate totals
    let totalST = 0, totalOT = 0, totalDT = 0
    for (const w of workers) {
      totalST += w.totalST
      totalOT += w.totalOT
      totalDT += w.totalDT
    }
    const totalHours = totalST + totalOT + totalDT

    // Summary box
    page.drawRectangle({
      x: margin,
      y: y - 70,
      width: width - (margin * 2),
      height: 70,
      color: rgb(0.95, 0.95, 0.98),
      borderColor: rgb(0.8, 0.8, 0.85),
      borderWidth: 1,
    })

    page.drawText("WEEKLY SUMMARY", {
      x: margin + 15, y: y - 18, size: 10, font: fontBold, color: rgb(0.3, 0.3, 0.4),
    })

    // Summary stats in a row
    const statsY = y - 45
    const statWidth = (width - margin * 2 - 30) / 4

    // Workers count
    page.drawText(`${workers.length}`, {
      x: margin + 15, y: statsY, size: 20, font: fontBold, color: rgb(0.1, 0.1, 0.2),
    })
    page.drawText("Workers", {
      x: margin + 15, y: statsY - 15, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
    })

    // Total hours
    page.drawText(`${totalHours}`, {
      x: margin + 15 + statWidth, y: statsY, size: 20, font: fontBold, color: rgb(0.1, 0.1, 0.2),
    })
    page.drawText("Total Hrs", {
      x: margin + 15 + statWidth, y: statsY - 15, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
    })

    // ST/OT/DT breakdown
    page.drawText(`${totalST}`, {
      x: margin + 15 + statWidth * 2, y: statsY, size: 16, font: fontBold, color: rgb(0.2, 0.5, 0.3),
    })
    page.drawText("ST", {
      x: margin + 15 + statWidth * 2, y: statsY - 15, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
    })

    page.drawText(`${totalOT}`, {
      x: margin + 15 + statWidth * 2.5, y: statsY, size: 16, font: fontBold, color: rgb(0.7, 0.5, 0.1),
    })
    page.drawText("OT", {
      x: margin + 15 + statWidth * 2.5, y: statsY - 15, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
    })

    page.drawText(`${totalDT}`, {
      x: margin + 15 + statWidth * 3, y: statsY, size: 16, font: fontBold, color: rgb(0.7, 0.2, 0.2),
    })
    page.drawText("DT", {
      x: margin + 15 + statWidth * 3, y: statsY - 15, size: 8, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
    })

    y -= 90

    // Workers list
    page.drawText("WORKER DETAILS", {
      x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
    })
    y -= 20

    if (workers.length === 0) {
      page.drawText("No workers with hours this week.", {
        x: margin + 10, y, size: 10, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
      })
      y -= 20
    } else {
      for (const worker of workers) {
        if (y < margin + 120) break

        page.drawText(`${sanitizeText(worker.name)} - ${worker.levelAbbr}`, {
          x: margin + 10, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.1),
        })

        page.drawText(`${worker.totalHours} hrs`, {
          x: margin + 280, y, size: 10, font: fontBold, color: rgb(0.1, 0.1, 0.2),
        })

        page.drawText(`(ST:${worker.totalST} OT:${worker.totalOT} DT:${worker.totalDT})`, {
          x: margin + 350, y, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4),
        })

        y -= 18
      }
    }

    y -= 15

    // Crew Summary section
    if (crewSummary && y > margin + 100) {
      page.drawText("CREW SUMMARY", {
        x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
      })
      y -= 18

      const crewText = `Journeymen: ${crewSummary.jm} | APP1: ${crewSummary.app1} | APP2: ${crewSummary.app2} | APP3: ${crewSummary.app3}`
      page.drawText(crewText, {
        x: margin + 10, y, size: 9, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
      })
      y -= 25
    }

    // Equipment section
    if (equipment && equipment.length > 0 && y > margin + 80) {
      page.drawText("EQUIPMENT USED", {
        x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
      })
      y -= 18

      // Sanitize each equipment item
      const sanitizedEquip = equipment.map(e => sanitizeText(e)).filter(e => e.length > 0)
      const equipText = sanitizedEquip.join(", ")
      const maxLen = 80
      const displayEquip = equipText.length > maxLen ? equipText.substring(0, maxLen) + "..." : equipText
      page.drawText(displayEquip, {
        x: margin + 10, y, size: 9, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
      })
      y -= 25
    }

    // Notes section
    if (notes && y > margin + 50) {
      page.drawText("NOTES", {
        x: margin, y, size: 11, font: fontBold, color: rgb(0.2, 0.2, 0.3),
      })
      y -= 18

      const sanitizedNotes = sanitizeText(notes)
      const maxLen = 200
      const displayNotes = sanitizedNotes.length > maxLen ? sanitizedNotes.substring(0, maxLen) + "..." : sanitizedNotes
      page.drawText(displayNotes, {
        x: margin + 10, y, size: 9, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
      })
    }

    // Footer
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
