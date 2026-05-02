import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createClient } from "@/lib/supabase/server"

// Timeout wrapper for async operations
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get("weekStart")

    if (!weekStart) {
      return NextResponse.json({ error: "Missing weekStart parameter" }, { status: 400 })
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
    }

    const supabase = await withTimeout(createClient(), 5000, "Supabase client creation")

    // Calculate week dates
    const weekStartDate = new Date(weekStart + "T12:00:00")
    const weekEnd = new Date(weekStartDate)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndStr = weekEnd.toISOString().split("T")[0]

    // Find timesheet
    const timesheetResult = await withTimeout(
      (async () => supabase.from("timesheets").select("id").eq("week_start", weekStart).single())(),
      10000,
      "Timesheet query"
    )

    if (timesheetResult.error || !timesheetResult.data) {
      return generateSimplePDF(weekStart, weekEndStr, [], 0)
    }

    // Get entries
    const entriesResult = await withTimeout(
      (async () => supabase
        .from("timesheet_entries")
        .select(`
          worker_id,
          regular_hours,
          overtime_hours,
          double_time_hours,
          attendance_status,
          worker:workers(id, name)
        `)
        .eq("timesheet_id", timesheetResult.data.id))(),
      10000,
      "Entries query"
    )

    if (entriesResult.error) {
      return NextResponse.json({ error: "Database error: " + entriesResult.error.message }, { status: 500 })
    }

    // Build worker totals
    const workerMap = new Map<string, { name: string; totalHours: number }>()

    for (const entry of entriesResult.data || []) {
      const isAbsent = entry.attendance_status === "Absent"
      const st = isAbsent ? 0 : (Number(entry.regular_hours) || 0)
      const ot = isAbsent ? 0 : (Number(entry.overtime_hours) || 0)
      const dt = isAbsent ? 0 : (Number(entry.double_time_hours) || 0)
      const total = st + ot + dt

      const workerRaw = Array.isArray(entry.worker) ? entry.worker[0] : entry.worker
        const worker = workerRaw as { id: string; name: string } | null
      const workerName = worker?.name || "Unknown"

      const existing = workerMap.get(entry.worker_id)
      if (existing) {
        existing.totalHours += total
      } else {
        workerMap.set(entry.worker_id, { name: workerName, totalHours: total })
      }
    }

    const workers = Array.from(workerMap.values())
      .filter(w => w.totalHours > 0)
      .sort((a, b) => a.name.localeCompare(b.name))

    const grandTotal = workers.reduce((sum, w) => sum + w.totalHours, 0)

    return generateSimplePDF(weekStart, weekEndStr, workers, grandTotal)

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function generateSimplePDF(
  weekStart: string,
  weekEnd: string,
  workers: { name: string; totalHours: number }[],
  grandTotal: number
): Promise<NextResponse> {
  try {
    const doc = await PDFDocument.create()
    const page = doc.addPage([612, 792])
    const { height } = page.getSize()
    
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica)
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold)

    const margin = 50
    let y = height - margin

    // Title
    page.drawText("Weekly Timesheet Report", {
      x: margin, y, size: 20, font: fontBold, color: rgb(0, 0, 0),
    })
    y -= 30

    // Company
    page.drawText("Ahern Painting Cont., Inc.", {
      x: margin, y, size: 14, font: fontRegular, color: rgb(0.3, 0.3, 0.3),
    })
    y -= 25

    // Job
    page.drawText("Job: C34921R", {
      x: margin, y, size: 12, font: fontBold, color: rgb(0, 0, 0),
    })
    y -= 20

    // Week range
    const startFmt = new Date(weekStart + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" })
    const endFmt = new Date(weekEnd + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    page.drawText(`Week: ${startFmt} - ${endFmt}`, {
      x: margin, y, size: 12, font: fontRegular, color: rgb(0, 0, 0),
    })
    y -= 40

    // Workers header
    page.drawText("Workers:", {
      x: margin, y, size: 14, font: fontBold, color: rgb(0, 0, 0),
    })
    y -= 25

    if (workers.length === 0) {
      page.drawText("No workers with hours this week.", {
        x: margin + 20, y, size: 11, font: fontRegular, color: rgb(0.5, 0.5, 0.5),
      })
    } else {
      for (const worker of workers) {
        if (y < margin + 50) break
        
        page.drawText(worker.name, {
          x: margin + 20, y, size: 11, font: fontRegular, color: rgb(0, 0, 0),
        })
        page.drawText(`${worker.totalHours} hrs`, {
          x: margin + 300, y, size: 11, font: fontBold, color: rgb(0, 0, 0),
        })
        y -= 18
      }
    }

    y -= 20

    // Grand total
    page.drawText("Total Hours:", {
      x: margin, y, size: 14, font: fontBold, color: rgb(0, 0, 0),
    })
    page.drawText(`${grandTotal} hrs`, {
      x: margin + 300, y, size: 14, font: fontBold, color: rgb(0, 0, 0),
    })

    const pdfBytes = await doc.save()

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Weekly_Timesheet_${weekStart}.pdf"`,
        "Content-Length": pdfBytes.length.toString(),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF generation failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
