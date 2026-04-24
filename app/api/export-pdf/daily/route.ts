import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createClient } from "@/lib/supabase/server"

// Timeout wrapper
async function withTimeout<T>(promise: Promise<T>, ms: number, operation: string): Promise<T> {
  let timeoutId: NodeJS.Timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${operation} timed out after ${ms}ms`)), ms)
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

function getLevelAbbr(level: string | null | undefined): string {
  if (!level) return "JM"
  switch (level) {
    case "Journeyman": return "JM"
    case "Apprentice Year 1": return "APP1"
    case "Apprentice Year 2": return "APP2"
    case "Apprentice Year 3": return "APP3"
    default: return "JM"
  }
}

interface WorkerEntry {
  name: string
  level: string
  levelAbbr: string
  st: number
  ot: number
  dt: number
  total: number
  status: string
}

interface FieldReport {
  work_performed: string
  journeyman_count: number
  apprentice_year1_count: number
  apprentice_year2_count: number
  apprentice_year3_count: number
  equipment: string[]
  problems_notes: string
}

export async function GET(request: NextRequest) {
  console.log("[v0] Daily PDF export started")
  
  try {
    const { searchParams } = new URL(request.url)
    const workDate = searchParams.get("workDate")
    const weekStart = searchParams.get("weekStart")

    console.log("[v0] Parameters - workDate:", workDate, "weekStart:", weekStart)

    if (!workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      console.log("[v0] Invalid workDate parameter")
      return NextResponse.json({ error: "Invalid workDate parameter. Expected format: YYYY-MM-DD" }, { status: 400 })
    }
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      console.log("[v0] Invalid weekStart parameter")
      return NextResponse.json({ error: "Invalid weekStart parameter. Expected format: YYYY-MM-DD" }, { status: 400 })
    }

    console.log("[v0] Creating Supabase client...")
    let supabase
    try {
      supabase = await withTimeout(createClient(), 5000, "Supabase client creation")
      console.log("[v0] Supabase client created successfully")
    } catch (err) {
      console.error("[v0] Supabase client creation failed:", err)
      return NextResponse.json({ error: "Failed to connect to database" }, { status: 500 })
    }

    // Find timesheet
    console.log("[v0] Querying timesheet for week_start:", weekStart)
    let timesheetId: string | null = null
    try {
      const timesheetResult = await withTimeout(
        supabase.from("timesheets").select("id").eq("week_start", weekStart).single(),
        10000,
        "Timesheet query"
      )
      console.log("[v0] Timesheet query result:", { data: timesheetResult.data, error: timesheetResult.error?.message })
      timesheetId = timesheetResult.data?.id || null
    } catch (err) {
      console.error("[v0] Timesheet query failed:", err)
      // Continue without timesheet - we'll show empty workers
    }

    let workers: WorkerEntry[] = []
    let totalST = 0
    let totalOT = 0
    let totalDT = 0

    if (timesheetId) {
      console.log("[v0] Querying entries for timesheet_id:", timesheetId, "work_date:", workDate)
      try {
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
            .eq("timesheet_id", timesheetId)
            .eq("work_date", workDate),
          10000,
          "Entries query"
        )
        
        console.log("[v0] Entries query result:", { 
          count: entriesResult.data?.length || 0, 
          error: entriesResult.error?.message 
        })

        if (entriesResult.data && Array.isArray(entriesResult.data)) {
          for (const entry of entriesResult.data) {
            // Safely extract worker data
            const workerData = entry.worker as { id?: string; name?: string; level?: string } | null
            const workerName = workerData?.name || "Unknown Worker"
            const workerLevel = workerData?.level || "Journeyman"
            
            const status = entry.attendance_status || "Present"
            const isAbsent = status === "Absent"
            
            const st = isAbsent ? 0 : (Number(entry.regular_hours) || 0)
            const ot = isAbsent ? 0 : (Number(entry.overtime_hours) || 0)
            const dt = isAbsent ? 0 : (Number(entry.double_time_hours) || 0)
            
            totalST += st
            totalOT += ot
            totalDT += dt

            workers.push({
              name: workerName,
              level: workerLevel,
              levelAbbr: getLevelAbbr(workerLevel),
              st,
              ot,
              dt,
              total: st + ot + dt,
              status,
            })
          }
        }
      } catch (err) {
        console.error("[v0] Entries query failed:", err)
        // Continue with empty workers
      }
    }

    // Sort workers by name
    workers.sort((a, b) => a.name.localeCompare(b.name))
    console.log("[v0] Workers processed:", workers.length)

    // Get field report data with safe defaults
    console.log("[v0] Querying field report for week_start:", weekStart, "work_date:", workDate)
    let fieldReport: FieldReport = {
      work_performed: "No work description provided.",
      journeyman_count: 0,
      apprentice_year1_count: 0,
      apprentice_year2_count: 0,
      apprentice_year3_count: 0,
      equipment: [],
      problems_notes: "No notes recorded.",
    }

    try {
      const fieldReportResult = await withTimeout(
        supabase
          .from("daily_field_reports")
          .select("work_performed, journeyman_count, apprentice_year1_count, apprentice_year2_count, apprentice_year3_count, equipment, problems_notes")
          .eq("week_start", weekStart)
          .eq("work_date", workDate)
          .single(),
        10000,
        "Field report query"
      )
      
      console.log("[v0] Field report query result:", { 
        hasData: !!fieldReportResult.data, 
        error: fieldReportResult.error?.message 
      })

      if (fieldReportResult.data) {
        const data = fieldReportResult.data
        fieldReport = {
          work_performed: data.work_performed || "No work description provided.",
          journeyman_count: Number(data.journeyman_count) || 0,
          apprentice_year1_count: Number(data.apprentice_year1_count) || 0,
          apprentice_year2_count: Number(data.apprentice_year2_count) || 0,
          apprentice_year3_count: Number(data.apprentice_year3_count) || 0,
          equipment: Array.isArray(data.equipment) ? data.equipment : [],
          problems_notes: data.problems_notes || "No notes recorded.",
        }
      }
    } catch (err) {
      console.error("[v0] Field report query failed:", err)
      // Continue with default values
    }

    console.log("[v0] Field report data:", {
      hasWorkPerformed: fieldReport.work_performed !== "No work description provided.",
      equipmentCount: fieldReport.equipment.length,
      hasNotes: fieldReport.problems_notes !== "No notes recorded.",
    })

    // PHOTOS DISABLED FOR NOW
    console.log("[v0] Photos temporarily disabled - skipping photo query")
    const photoCount = 0

    // Generate PDF
    console.log("[v0] Starting PDF generation...")
    try {
      const response = await generateDailyPDF(workDate, workers, totalST, totalOT, totalDT, fieldReport, photoCount)
      console.log("[v0] PDF generation completed successfully")
      return response
    } catch (pdfError) {
      console.error("[v0] PDF generation failed:", pdfError)
      return NextResponse.json(
        { error: `PDF generation error: ${pdfError instanceof Error ? pdfError.message : "Unknown error"}` },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error("[v0] Daily PDF export error:", error)
    return NextResponse.json(
      { error: `Export failed: ${error instanceof Error ? error.message : "Unknown error"}` },
      { status: 500 }
    )
  }
}

async function generateDailyPDF(
  workDate: string,
  workers: WorkerEntry[],
  totalST: number,
  totalOT: number,
  totalDT: number,
  fieldReport: FieldReport,
  photoCount: number
): Promise<NextResponse> {
  console.log("[v0] Creating PDF document...")
  const pdfDoc = await PDFDocument.create()
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Colors
  const black = rgb(0, 0, 0)
  const darkGray = rgb(0.3, 0.3, 0.3)
  const lightGray = rgb(0.85, 0.85, 0.85)
  const headerBg = rgb(0.15, 0.15, 0.2)
  const white = rgb(1, 1, 1)

  // Page dimensions (Letter Portrait)
  const pageWidth = 612
  const pageHeight = 792
  const margin = 50
  const contentWidth = pageWidth - margin * 2

  let page = pdfDoc.addPage([pageWidth, pageHeight])
  let y = pageHeight - margin

  // Helper function to add new page when needed
  const checkPageBreak = (neededHeight: number) => {
    if (y - neededHeight < margin + 30) {
      page = pdfDoc.addPage([pageWidth, pageHeight])
      y = pageHeight - margin
      return true
    }
    return false
  }

  // Helper to draw section header
  const drawSectionHeader = (title: string) => {
    checkPageBreak(30)
    page.drawRectangle({
      x: margin,
      y: y - 18,
      width: contentWidth,
      height: 22,
      color: headerBg,
    })
    page.drawText(title, {
      x: margin + 8,
      y: y - 13,
      size: 11,
      font: helveticaBold,
      color: white,
    })
    y -= 28
  }

  // Format date safely
  let dayName = "Unknown"
  let formattedDate = workDate
  try {
    const dateObj = new Date(workDate + "T12:00:00")
    dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" })
    formattedDate = dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
  } catch (e) {
    console.error("[v0] Date formatting error:", e)
  }

  console.log("[v0] Drawing header...")
  // ========== HEADER ==========
  page.drawText("Ahern Painting Cont., Inc.", {
    x: margin,
    y,
    size: 16,
    font: helveticaBold,
    color: black,
  })
  y -= 18

  page.drawText("DAILY FIELD REPORT", {
    x: margin,
    y,
    size: 14,
    font: helveticaBold,
    color: darkGray,
  })
  y -= 20

  // Job and Date info
  page.drawText("Job: C34921R", {
    x: margin,
    y,
    size: 10,
    font: helvetica,
    color: black,
  })
  page.drawText(`Date: ${dayName}, ${formattedDate}`, {
    x: margin + 200,
    y,
    size: 10,
    font: helvetica,
    color: black,
  })
  y -= 25

  console.log("[v0] Drawing Work Performed section...")
  // ========== WORK PERFORMED ==========
  drawSectionHeader("Work Performed Today")
  
  const workLines = wrapText(fieldReport.work_performed, helvetica, 10, contentWidth - 16)
  for (const line of workLines) {
    checkPageBreak(14)
    page.drawText(line, {
      x: margin + 8,
      y,
      size: 10,
      font: helvetica,
      color: black,
    })
    y -= 14
  }
  y -= 10

  console.log("[v0] Drawing Crew Summary section...")
  // ========== CREW SUMMARY ==========
  drawSectionHeader("Crew Summary")
  
  const totalCrew = fieldReport.journeyman_count + fieldReport.apprentice_year1_count + 
                    fieldReport.apprentice_year2_count + fieldReport.apprentice_year3_count

  const crewItems = [
    { label: "Journeymen", value: fieldReport.journeyman_count },
    { label: "Apprentice Year 1", value: fieldReport.apprentice_year1_count },
    { label: "Apprentice Year 2", value: fieldReport.apprentice_year2_count },
    { label: "Apprentice Year 3", value: fieldReport.apprentice_year3_count },
  ]

  for (const item of crewItems) {
    checkPageBreak(14)
    page.drawText(`${item.label}:`, {
      x: margin + 8,
      y,
      size: 10,
      font: helvetica,
      color: black,
    })
    page.drawText(String(item.value), {
      x: margin + 150,
      y,
      size: 10,
      font: helveticaBold,
      color: black,
    })
    y -= 14
  }
  
  // Total crew
  checkPageBreak(18)
  page.drawRectangle({
    x: margin + 4,
    y: y - 2,
    width: 200,
    height: 16,
    color: lightGray,
  })
  page.drawText("Total Crew:", {
    x: margin + 8,
    y,
    size: 10,
    font: helveticaBold,
    color: black,
  })
  page.drawText(String(totalCrew), {
    x: margin + 150,
    y,
    size: 10,
    font: helveticaBold,
    color: black,
  })
  y -= 20

  console.log("[v0] Drawing Hours Summary section...")
  // ========== HOURS SUMMARY ==========
  drawSectionHeader("Hours Summary")
  
  const totalHours = totalST + totalOT + totalDT
  const hoursItems = [
    { label: "Regular Time (ST)", value: totalST.toFixed(1) },
    { label: "Overtime (OT)", value: totalOT.toFixed(1) },
    { label: "Double Time (DT)", value: totalDT.toFixed(1) },
  ]

  for (const item of hoursItems) {
    checkPageBreak(14)
    page.drawText(`${item.label}:`, {
      x: margin + 8,
      y,
      size: 10,
      font: helvetica,
      color: black,
    })
    page.drawText(item.value, {
      x: margin + 150,
      y,
      size: 10,
      font: helveticaBold,
      color: black,
    })
    y -= 14
  }
  
  // Total hours
  checkPageBreak(18)
  page.drawRectangle({
    x: margin + 4,
    y: y - 2,
    width: 200,
    height: 16,
    color: lightGray,
  })
  page.drawText("Total Hours:", {
    x: margin + 8,
    y,
    size: 10,
    font: helveticaBold,
    color: black,
  })
  page.drawText(totalHours.toFixed(1), {
    x: margin + 150,
    y,
    size: 10,
    font: helveticaBold,
    color: black,
  })
  y -= 20

  console.log("[v0] Drawing Worker Breakdown section...")
  // ========== WORKER BREAKDOWN ==========
  drawSectionHeader("Worker Breakdown")
  
  if (workers.length > 0) {
    // Table header
    checkPageBreak(20)
    page.drawRectangle({
      x: margin,
      y: y - 14,
      width: contentWidth,
      height: 18,
      color: lightGray,
    })
    
    const cols = { name: margin + 4, st: margin + 220, ot: margin + 280, dt: margin + 340, total: margin + 400, status: margin + 460 }
    
    page.drawText("Worker", { x: cols.name, y: y - 10, size: 9, font: helveticaBold, color: black })
    page.drawText("ST", { x: cols.st, y: y - 10, size: 9, font: helveticaBold, color: black })
    page.drawText("OT", { x: cols.ot, y: y - 10, size: 9, font: helveticaBold, color: black })
    page.drawText("DT", { x: cols.dt, y: y - 10, size: 9, font: helveticaBold, color: black })
    page.drawText("Total", { x: cols.total, y: y - 10, size: 9, font: helveticaBold, color: black })
    page.drawText("Status", { x: cols.status, y: y - 10, size: 9, font: helveticaBold, color: black })
    y -= 22

    // Worker rows
    for (const worker of workers) {
      checkPageBreak(16)
      
      const workerLabel = `${worker.name} (${worker.levelAbbr})`
      page.drawText(truncateText(workerLabel, helvetica, 9, 210), { x: cols.name, y, size: 9, font: helvetica, color: black })
      page.drawText(worker.st.toFixed(1), { x: cols.st, y, size: 9, font: helvetica, color: black })
      page.drawText(worker.ot.toFixed(1), { x: cols.ot, y, size: 9, font: helvetica, color: black })
      page.drawText(worker.dt.toFixed(1), { x: cols.dt, y, size: 9, font: helvetica, color: black })
      page.drawText(worker.total.toFixed(1), { x: cols.total, y, size: 9, font: helveticaBold, color: black })
      page.drawText(worker.status, { x: cols.status, y, size: 9, font: helvetica, color: black })
      y -= 14
    }
  } else {
    page.drawText("No worker data available for this day.", {
      x: margin + 8,
      y,
      size: 10,
      font: helvetica,
      color: darkGray,
    })
    y -= 14
  }
  y -= 10

  console.log("[v0] Drawing Equipment section...")
  // ========== EQUIPMENT USED ==========
  drawSectionHeader("Equipment Used")
  
  if (fieldReport.equipment.length > 0) {
    for (const item of fieldReport.equipment) {
      if (item && typeof item === "string") {
        checkPageBreak(14)
        page.drawText(`• ${item}`, {
          x: margin + 8,
          y,
          size: 10,
          font: helvetica,
          color: black,
        })
        y -= 14
      }
    }
  } else {
    page.drawText("No equipment listed.", {
      x: margin + 8,
      y,
      size: 10,
      font: helvetica,
      color: darkGray,
    })
    y -= 14
  }
  y -= 10

  console.log("[v0] Drawing Notes section...")
  // ========== PROBLEMS / NOTES ==========
  drawSectionHeader("Problems / Notes")
  
  const notesLines = wrapText(fieldReport.problems_notes, helvetica, 10, contentWidth - 16)
  for (const line of notesLines) {
    checkPageBreak(14)
    page.drawText(line, {
      x: margin + 8,
      y,
      size: 10,
      font: helvetica,
      color: black,
    })
    y -= 14
  }
  y -= 10

  // ========== PHOTOS (DISABLED) ==========
  if (photoCount > 0) {
    drawSectionHeader("Photos")
    page.drawText(`${photoCount} photo(s) available - photo embedding temporarily disabled.`, {
      x: margin + 8,
      y,
      size: 10,
      font: helvetica,
      color: darkGray,
    })
    y -= 14
  }

  console.log("[v0] Drawing footer...")
  // ========== FOOTER ==========
  checkPageBreak(30)
  y -= 20
  page.drawText(`Generated: ${new Date().toLocaleString("en-US")}`, {
    x: margin,
    y,
    size: 8,
    font: helvetica,
    color: darkGray,
  })

  // Save PDF
  console.log("[v0] Saving PDF...")
  const pdfBytes = await pdfDoc.save()
  console.log("[v0] PDF saved, size:", pdfBytes.length, "bytes")

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Daily_Field_Report_${workDate}.pdf"`,
    },
  })
}

// Helper function to wrap text
function wrapText(text: string | null | undefined, font: any, fontSize: number, maxWidth: number): string[] {
  if (!text) return [""]
  
  const words = text.split(" ")
  const lines: string[] = []
  let currentLine = ""

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word
    const width = font.widthOfTextAtSize(testLine, fontSize)
    
    if (width > maxWidth && currentLine) {
      lines.push(currentLine)
      currentLine = word
    } else {
      currentLine = testLine
    }
  }
  
  if (currentLine) {
    lines.push(currentLine)
  }
  
  return lines.length > 0 ? lines : [""]
}

// Helper function to truncate text
function truncateText(text: string | null | undefined, font: any, fontSize: number, maxWidth: number): string {
  if (!text) return ""
  
  const width = font.widthOfTextAtSize(text, fontSize)
  if (width <= maxWidth) return text
  
  let truncated = text
  while (font.widthOfTextAtSize(truncated + "...", fontSize) > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + "..."
}
