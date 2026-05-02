import { NextRequest, NextResponse } from "next/server"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// Force Node.js runtime for PDF generation (not Edge)
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30 // 30 seconds max for Vercel Pro, 10s for Hobby

// Create Supabase client directly in API route for better reliability
async function createApiClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  if (!supabaseUrl || !supabaseKey) {
    console.error("[v0] Missing Supabase environment variables:", {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey
    })
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
            // Ignore - API routes may not be able to set cookies
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

/**
 * Sanitize text for PDF rendering - removes/replaces unsupported characters
 * WinAnsi encoding only supports ASCII and some extended Latin characters
 * CRITICAL: Must remove ALL newlines, tabs, and non-printable characters
 */
function sanitizeText(text: string | null | undefined): string {
  if (!text) return ""
  
  let result = String(text)
  
  // Replace all whitespace characters (including \n, \r, \t) with spaces
  // Using character codes to be absolutely explicit
  result = result.split("").map(char => {
    const code = char.charCodeAt(0)
    // Replace newline (10), carriage return (13), tab (9) with space
    if (code === 10 || code === 13 || code === 9) return " "
    // Remove any character outside printable ASCII range (32-126) and extended Latin (160-255)
    if (code < 32 || (code > 126 && code < 160) || code > 255) return ""
    return char
  }).join("")
  
  // Collapse multiple spaces into one
  result = result.replace(/  +/g, " ")
  
  // Trim whitespace
  result = result.trim()
  
  return result || ""
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
      supabase = await withTimeout(createApiClient(), 5000, "Supabase client creation")
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
        (async () => supabase.from("timesheets").select("id").eq("week_start", weekStart).single())(),
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
          (async () => supabase
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
            .eq("work_date", workDate))(),
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
            const workerRaw = Array.isArray(entry.worker) ? entry.worker[0] : entry.worker
            const workerData = workerRaw as { id?: string; name?: string; level?: string } | null
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
        (async () => supabase
          .from("daily_field_reports")
          .select("work_performed, journeyman_count, apprentice_year1_count, apprentice_year2_count, apprentice_year3_count, equipment, problems_notes")
          .eq("week_start", weekStart)
          .eq("work_date", workDate)
          .single())(),
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
  page.drawText("AHERN PAINTING CONT., INC.", {
    x: margin,
    y,
    size: 18,
    font: helveticaBold,
    color: black,
  })
  y -= 22

  page.drawText("DAILY FIELD REPORT", {
    x: margin,
    y,
    size: 14,
    font: helveticaBold,
    color: black,
  })
  y -= 20

  // Divider line under header
  page.drawLine({
    start: { x: margin, y: y + 5 },
    end: { x: pageWidth - margin, y: y + 5 },
    thickness: 1.5,
    color: black,
  })
  y -= 8

  // Job and Date info - aligned
  page.drawText("Job:", {
    x: margin,
    y,
    size: 10,
    font: helveticaBold,
    color: black,
  })
  page.drawText("C34921R", {
    x: margin + 30,
    y,
    size: 10,
    font: helvetica,
    color: black,
  })
  
  page.drawText("Date:", {
    x: margin + 280,
    y,
    size: 10,
    font: helveticaBold,
    color: black,
  })
  page.drawText(`${dayName}, ${formattedDate}`, {
    x: margin + 315,
    y,
    size: 10,
    font: helvetica,
    color: black,
  })
  y -= 25

  console.log("[v0] Drawing Work Performed section...")
  // ========== WORK PERFORMED ==========
  drawSectionHeader("WORK PERFORMED")
  
  // Split work performed into bullet points (by periods or newlines)
  const workText = sanitizeText(fieldReport.work_performed) || "No work description provided."
  // Split by common separators and filter empty items
  const workItems = workText
    .split(/[.;]/)
    .map(item => item.trim())
    .filter(item => item.length > 0 && item !== "No work description provided")
  
  if (workItems.length > 0) {
    for (const item of workItems) {
      const bulletLines = wrapText(item, helvetica, 10, contentWidth - 30)
      for (let i = 0; i < bulletLines.length; i++) {
        checkPageBreak(14)
        if (i === 0) {
          // First line gets bullet
          page.drawText("\u2022", {
            x: margin + 8,
            y,
            size: 10,
            font: helvetica,
            color: black,
          })
        }
        page.drawText(bulletLines[i], {
          x: margin + 22,
          y,
          size: 10,
          font: helvetica,
          color: black,
        })
        y -= 14
      }
    }
  } else {
    // Single line if no separators found
    const workLines = wrapText(workText, helvetica, 10, contentWidth - 30)
    for (let i = 0; i < workLines.length; i++) {
      checkPageBreak(14)
      if (i === 0) {
        page.drawText("\u2022", {
          x: margin + 8,
          y,
          size: 10,
          font: helvetica,
          color: black,
        })
      }
      page.drawText(workLines[i], {
        x: margin + 22,
        y,
        size: 10,
        font: helvetica,
        color: black,
      })
      y -= 14
    }
  }
  y -= 10

  console.log("[v0] Drawing Crew Summary section...")
  // ========== CREW SUMMARY ==========
  drawSectionHeader("CREW SUMMARY")
  
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
  drawSectionHeader("HOURS SUMMARY")
  
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
  drawSectionHeader("WORKER BREAKDOWN")
  
  if (workers.length > 0) {
    // Define fixed column positions for perfect alignment
    const colName = margin + 4
    const colST = margin + 250
    const colOT = margin + 310
    const colDT = margin + 370
    const colTotal = margin + 430
    const colStatus = margin + 490
    
    // Table header row
    checkPageBreak(20)
    page.drawRectangle({
      x: margin,
      y: y - 14,
      width: contentWidth,
      height: 18,
      color: lightGray,
    })
    
    // Header labels - bold and centered where needed
    page.drawText("NAME", { x: colName, y: y - 10, size: 9, font: helveticaBold, color: black })
    page.drawText("ST", { x: colST + 5, y: y - 10, size: 9, font: helveticaBold, color: black })
    page.drawText("OT", { x: colOT + 5, y: y - 10, size: 9, font: helveticaBold, color: black })
    page.drawText("DT", { x: colDT + 5, y: y - 10, size: 9, font: helveticaBold, color: black })
    page.drawText("TOTAL", { x: colTotal, y: y - 10, size: 9, font: helveticaBold, color: black })
    page.drawText("STATUS", { x: colStatus, y: y - 10, size: 9, font: helveticaBold, color: black })
    y -= 22

    // Draw separator line under header
    page.drawLine({
      start: { x: margin, y: y + 6 },
      end: { x: pageWidth - margin, y: y + 6 },
      thickness: 0.5,
      color: darkGray,
    })

    // Worker rows with alternating subtle background
    let rowIndex = 0
    for (const worker of workers) {
      checkPageBreak(18)
      
      // Alternate row shading for readability
      if (rowIndex % 2 === 1) {
        page.drawRectangle({
          x: margin,
          y: y - 4,
          width: contentWidth,
          height: 16,
          color: rgb(0.95, 0.95, 0.95),
        })
      }
      
      // Worker name with classification
      const workerLabel = sanitizeText(`${worker.name} (${worker.levelAbbr})`)
      page.drawText(truncateText(workerLabel, helvetica, 9, 240), { x: colName, y, size: 9, font: helvetica, color: black })
      
      // Hours - right-aligned for numbers
      const stText = worker.st.toFixed(1)
      const otText = worker.ot.toFixed(1)
      const dtText = worker.dt.toFixed(1)
      const totalText = worker.total.toFixed(1)
      
      page.drawText(stText, { x: colST + 10 - helvetica.widthOfTextAtSize(stText, 9) / 2, y, size: 9, font: helvetica, color: black })
      page.drawText(otText, { x: colOT + 10 - helvetica.widthOfTextAtSize(otText, 9) / 2, y, size: 9, font: helvetica, color: black })
      page.drawText(dtText, { x: colDT + 10 - helvetica.widthOfTextAtSize(dtText, 9) / 2, y, size: 9, font: helvetica, color: black })
      page.drawText(totalText, { x: colTotal + 10 - helveticaBold.widthOfTextAtSize(totalText, 9) / 2, y, size: 9, font: helveticaBold, color: black })
      
      // Status
      page.drawText(worker.status, { x: colStatus, y, size: 9, font: helvetica, color: black })
      
      y -= 16
      rowIndex++
    }
    
    // Draw bottom border line
    page.drawLine({
      start: { x: margin, y: y + 10 },
      end: { x: pageWidth - margin, y: y + 10 },
      thickness: 0.5,
      color: darkGray,
    })
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
  y -= 15

  console.log("[v0] Drawing Equipment section...")
  // ========== EQUIPMENT USED ==========
  drawSectionHeader("EQUIPMENT USED")
  
  if (fieldReport.equipment.length > 0) {
    for (const item of fieldReport.equipment) {
      if (item && typeof item === "string") {
        checkPageBreak(14)
        // Format: Equipment Name - ID: XXXXX (if item contains ID info)
        const sanitizedItem = sanitizeText(item)
        // Check if item has ID pattern, format nicely
        let displayItem = sanitizedItem
        const idMatch = sanitizedItem.match(/^(.+?)\s*[-–]\s*(?:ID:?\s*)?(\d+)$/i)
        if (idMatch) {
          displayItem = `${idMatch[1]} - ID: ${idMatch[2]}`
        }
        page.drawText(`\u2022  ${displayItem}`, {
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
  drawSectionHeader("NOTES / ISSUES")
  
  // Replace default "No notes recorded" with professional message
  let notesText = sanitizeText(fieldReport.problems_notes) || ""
  if (notesText === "No notes recorded." || notesText === "No notes recorded" || notesText === "") {
    notesText = "No issues reported for this day."
  }
  
  const notesLines = wrapText(notesText, helvetica, 10, contentWidth - 16)
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
    drawSectionHeader("PHOTOS")
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
  checkPageBreak(60)
  y -= 25
  
  // Signature line
  page.drawLine({
    start: { x: margin, y: y },
    end: { x: margin + 200, y: y },
    thickness: 0.5,
    color: black,
  })
  y -= 12
  page.drawText("Foreman / Supervisor Signature", {
    x: margin,
    y,
    size: 8,
    font: helvetica,
    color: darkGray,
  })
  
  // Date line next to signature
  page.drawLine({
    start: { x: margin + 300, y: y + 12 },
    end: { x: margin + 420, y: y + 12 },
    thickness: 0.5,
    color: black,
  })
  page.drawText("Date", {
    x: margin + 300,
    y,
    size: 8,
    font: helvetica,
    color: darkGray,
  })
  
  y -= 25
  
  // Generated timestamp
  page.drawText(`Generated: ${new Date().toLocaleString("en-US")}`, {
    x: margin,
    y,
    size: 8,
    font: helvetica,
    color: darkGray,
  })
  
  // Page indicator
  page.drawText("Page 1 of 1", {
    x: pageWidth - margin - 50,
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
      "Content-Length": String(pdfBytes.length),
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  })
}

// Helper function to wrap text (sanitizes input)
function wrapText(text: string | null | undefined, font: any, fontSize: number, maxWidth: number): string[] {
  const sanitized = sanitizeText(text)
  if (!sanitized) return [""]
  
  const words = sanitized.split(" ")
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

// Helper function to truncate text (sanitizes input)
function truncateText(text: string | null | undefined, font: any, fontSize: number, maxWidth: number): string {
  const sanitized = sanitizeText(text)
  if (!sanitized) return ""
  
  const width = font.widthOfTextAtSize(sanitized, fontSize)
  if (width <= maxWidth) return sanitized
  
  let truncated = sanitized
  while (font.widthOfTextAtSize(truncated + "...", fontSize) > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + "..."
}
