import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  console.log("[v0] PDF export started")
  
  try {
    const { searchParams } = new URL(request.url)
    const weekStart = searchParams.get("weekStart")

    console.log("[v0] weekStart param:", weekStart)

    if (!weekStart) {
      console.log("[v0] Missing weekStart parameter")
      return NextResponse.json({ error: "Missing weekStart parameter" }, { status: 400 })
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRegex.test(weekStart)) {
      console.log("[v0] Invalid date format:", weekStart)
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 })
    }

    const supabase = await createClient()
    console.log("[v0] Supabase client created")

    // Calculate week dates
    const weekStartDate = new Date(weekStart + "T12:00:00")
    const weekEnd = new Date(weekStartDate)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndStr = weekEnd.toISOString().split("T")[0]

    console.log("[v0] Week range:", weekStart, "to", weekEndStr)

    // Find the timesheet for this week
    const { data: timesheet, error: timesheetError } = await supabase
      .from("timesheets")
      .select("id")
      .eq("week_start", weekStart)
      .single()

    console.log("[v0] Timesheet query result:", { timesheet, error: timesheetError?.message })

    if (timesheetError || !timesheet) {
      console.log("[v0] No timesheet found, generating empty PDF")
      // Generate empty PDF with message
      return await generateSimplePDF(weekStart, weekEndStr, [], 0)
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

    console.log("[v0] Entries query result:", { 
      count: entries?.length || 0, 
      error: entriesError?.message 
    })

    if (entriesError) {
      console.log("[v0] Error fetching entries:", entriesError.message)
      return NextResponse.json({ error: "Error fetching timesheet entries: " + entriesError.message }, { status: 500 })
    }

    // Build simple worker totals list
    interface WorkerTotal {
      name: string
      totalHours: number
    }
    
    const workerMap = new Map<string, WorkerTotal>()

    for (const entry of entries || []) {
      const status = (entry as { attendance_status?: string }).attendance_status
      const isAbsent = status === "Absent"
      
      const st = isAbsent ? 0 : (Number(entry.regular_hours) || 0)
      const ot = isAbsent ? 0 : (Number(entry.overtime_hours) || 0)
      const dt = isAbsent ? 0 : (Number(entry.double_time_hours) || 0)
      const total = st + ot + dt

      const worker = entry.worker as { id: string; name: string } | null
      const workerName = worker?.name || "Unknown"

      const existing = workerMap.get(entry.worker_id)
      if (existing) {
        existing.totalHours += total
      } else {
        workerMap.set(entry.worker_id, {
          name: workerName,
          totalHours: total,
        })
      }
    }

    // Convert to sorted array, filter out zero hours
    const workers = Array.from(workerMap.values())
      .filter(w => w.totalHours > 0)
      .sort((a, b) => a.name.localeCompare(b.name))

    console.log("[v0] Workers with hours:", workers.length)

    // Calculate grand total
    const grandTotal = workers.reduce((sum, w) => sum + w.totalHours, 0)

    console.log("[v0] Grand total hours:", grandTotal)

    // Generate simple PDF
    return await generateSimplePDF(weekStart, weekEndStr, workers, grandTotal)

  } catch (error) {
    console.error("[v0] PDF generation error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json(
      { error: "Error generating PDF: " + errorMessage },
      { status: 500 }
    )
  }
}

// Generate a simple PDF with just worker names and total hours
async function generateSimplePDF(
  weekStart: string,
  weekEnd: string,
  workers: { name: string; totalHours: number }[],
  grandTotal: number
): Promise<NextResponse> {
  console.log("[v0] Starting PDF document creation")
  
  try {
    // Create PDF document
    const pdfDoc = await PDFDocument.create()
    console.log("[v0] PDF document created")
    
    const page = pdfDoc.addPage([612, 792]) // Letter portrait
    const { height } = page.getSize()
    console.log("[v0] Page added")

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
    console.log("[v0] Fonts embedded")

    const margin = 50
    let y = height - margin

    // Title
    page.drawText("Weekly Timesheet Report", {
      x: margin,
      y,
      size: 20,
      font: fontBold,
      color: rgb(0, 0, 0),
    })
    y -= 30

    // Company
    page.drawText("Ahern Painting Cont., Inc.", {
      x: margin,
      y,
      size: 14,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    })
    y -= 25

    // Job
    page.drawText("Job: C34921R", {
      x: margin,
      y,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    })
    y -= 20

    // Week range
    const startFormatted = new Date(weekStart + "T12:00:00").toLocaleDateString("en-US", { 
      month: "long", 
      day: "numeric" 
    })
    const endFormatted = new Date(weekEnd + "T12:00:00").toLocaleDateString("en-US", { 
      month: "long", 
      day: "numeric",
      year: "numeric"
    })
    page.drawText(`Week: ${startFormatted} - ${endFormatted}`, {
      x: margin,
      y,
      size: 12,
      font: fontRegular,
      color: rgb(0, 0, 0),
    })
    y -= 40

    // Workers section
    page.drawText("Workers:", {
      x: margin,
      y,
      size: 14,
      font: fontBold,
      color: rgb(0, 0, 0),
    })
    y -= 25

    if (workers.length === 0) {
      page.drawText("No workers with hours this week.", {
        x: margin + 20,
        y,
        size: 11,
        font: fontRegular,
        color: rgb(0.5, 0.5, 0.5),
      })
      y -= 20
    } else {
      // List workers with total hours
      for (const worker of workers) {
        if (y < margin + 50) {
          // Don't go past bottom margin
          page.drawText("... and more workers", {
            x: margin + 20,
            y,
            size: 10,
            font: fontRegular,
            color: rgb(0.5, 0.5, 0.5),
          })
          break
        }

        page.drawText(`${worker.name}`, {
          x: margin + 20,
          y,
          size: 11,
          font: fontRegular,
          color: rgb(0, 0, 0),
        })
        
        page.drawText(`${worker.totalHours} hrs`, {
          x: margin + 300,
          y,
          size: 11,
          font: fontBold,
          color: rgb(0, 0, 0),
        })
        
        y -= 18
      }
    }

    y -= 20

    // Grand total
    page.drawText("Total Hours:", {
      x: margin,
      y,
      size: 14,
      font: fontBold,
      color: rgb(0, 0, 0),
    })
    page.drawText(`${grandTotal} hrs`, {
      x: margin + 300,
      y,
      size: 14,
      font: fontBold,
      color: rgb(0, 0, 0),
    })

    console.log("[v0] All content drawn, saving PDF")

    // Generate PDF bytes
    const pdfBytes = await pdfDoc.save()
    console.log("[v0] PDF saved, size:", pdfBytes.length, "bytes")

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
  } catch (pdfError) {
    console.error("[v0] PDF creation error:", pdfError)
    const errorMessage = pdfError instanceof Error ? pdfError.message : "Unknown PDF error"
    return NextResponse.json(
      { error: "PDF creation failed: " + errorMessage },
      { status: 500 }
    )
  }
}
