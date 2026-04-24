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
  work_performed: string | null
  journeyman_count: number
  apprentice_year1_count: number
  apprentice_year2_count: number
  apprentice_year3_count: number
  equipment: string[]
  problems_notes: string | null
}

interface Photo {
  id: string
  photo_pathname: string
  caption: string | null
  created_at: string
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const workDate = searchParams.get("workDate")
    const weekStart = searchParams.get("weekStart")

    if (!workDate || !/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
      return NextResponse.json({ error: "Invalid workDate parameter" }, { status: 400 })
    }
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: "Invalid weekStart parameter" }, { status: 400 })
    }

    const supabase = await withTimeout(createClient(), 5000, "Supabase client creation")

    // Find timesheet
    const timesheetResult = await withTimeout(
      supabase.from("timesheets").select("id").eq("week_start", weekStart).single(),
      10000,
      "Timesheet query"
    )

    let workers: WorkerEntry[] = []
    let totalST = 0
    let totalOT = 0
    let totalDT = 0

    if (timesheetResult.data) {
      // Get entries for this day with worker info
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
          .eq("timesheet_id", timesheetResult.data.id)
          .eq("work_date", workDate),
        10000,
        "Entries query"
      )

      if (entriesResult.data) {
        for (const entry of entriesResult.data) {
          const worker = entry.worker as { id: string; name: string; level: string } | null
          const status = entry.attendance_status || "Present"
          const isAbsent = status === "Absent"
          
          const st = isAbsent ? 0 : (Number(entry.regular_hours) || 0)
          const ot = isAbsent ? 0 : (Number(entry.overtime_hours) || 0)
          const dt = isAbsent ? 0 : (Number(entry.double_time_hours) || 0)
          
          totalST += st
          totalOT += ot
          totalDT += dt

          workers.push({
            name: worker?.name || "Unknown",
            level: worker?.level || "Journeyman",
            levelAbbr: getLevelAbbr(worker?.level || "Journeyman"),
            st,
            ot,
            dt,
            total: st + ot + dt,
            status,
          })
        }
      }
    }

    // Sort workers by name
    workers.sort((a, b) => a.name.localeCompare(b.name))

    // Get field report data
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

    const fieldReport: FieldReport = fieldReportResult.data || {
      work_performed: null,
      journeyman_count: 0,
      apprentice_year1_count: 0,
      apprentice_year2_count: 0,
      apprentice_year3_count: 0,
      equipment: [],
      problems_notes: null,
    }

    // Get photos for this day
    const photosResult = await withTimeout(
      supabase
        .from("report_photos")
        .select("id, photo_pathname, caption, created_at")
        .eq("week_start", weekStart)
        .eq("work_date", workDate)
        .order("created_at", { ascending: true }),
      10000,
      "Photos query"
    )

    const photos: Photo[] = photosResult.data || []

    // Generate PDF
    return generateDailyPDF(workDate, workers, totalST, totalOT, totalDT, fieldReport, photos)
  } catch (error) {
    console.error("Daily PDF export error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to generate PDF" },
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
  photos: Photo[]
): Promise<NextResponse> {
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

  // Format date
  const dateObj = new Date(workDate + "T12:00:00")
  const dayName = dateObj.toLocaleDateString("en-US", { weekday: "long" })
  const formattedDate = dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })

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
  page.drawText(`Job: C34921R`, {
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

  // ========== WORK PERFORMED ==========
  drawSectionHeader("Work Performed Today")
  
  const workText = fieldReport.work_performed || "No work recorded for this day."
  const workLines = wrapText(workText, helvetica, 10, contentWidth - 16)
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

  // ========== WORKER BREAKDOWN ==========
  if (workers.length > 0) {
    drawSectionHeader("Worker Breakdown")
    
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
    y -= 10
  }

  // ========== EQUIPMENT USED ==========
  drawSectionHeader("Equipment Used")
  
  if (fieldReport.equipment && fieldReport.equipment.length > 0) {
    for (const item of fieldReport.equipment) {
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
  } else {
    page.drawText("No equipment recorded.", {
      x: margin + 8,
      y,
      size: 10,
      font: helvetica,
      color: darkGray,
    })
    y -= 14
  }
  y -= 10

  // ========== PROBLEMS / NOTES ==========
  drawSectionHeader("Problems / Notes")
  
  const notesText = fieldReport.problems_notes || "No issues or notes recorded."
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

  // ========== PHOTOS ==========
  if (photos.length > 0) {
    drawSectionHeader(`Photos (${photos.length})`)
    
    for (const photo of photos) {
      try {
        // Fetch photo from blob storage
        const photoUrl = `${process.env.BLOB_URL || ""}/${photo.photo_pathname}`
        const response = await fetch(photoUrl)
        
        if (response.ok) {
          const imageBytes = await response.arrayBuffer()
          const contentType = response.headers.get("content-type") || ""
          
          let image
          if (contentType.includes("jpeg") || contentType.includes("jpg")) {
            image = await pdfDoc.embedJpg(imageBytes)
          } else if (contentType.includes("png")) {
            image = await pdfDoc.embedPng(imageBytes)
          }
          
          if (image) {
            // Calculate image dimensions to fit
            const maxWidth = 200
            const maxHeight = 150
            const aspectRatio = image.width / image.height
            let imgWidth = maxWidth
            let imgHeight = imgWidth / aspectRatio
            if (imgHeight > maxHeight) {
              imgHeight = maxHeight
              imgWidth = imgHeight * aspectRatio
            }
            
            checkPageBreak(imgHeight + 40)
            
            page.drawImage(image, {
              x: margin + 8,
              y: y - imgHeight,
              width: imgWidth,
              height: imgHeight,
            })
            
            // Draw caption next to image
            const captionX = margin + imgWidth + 20
            const captionWidth = contentWidth - imgWidth - 28
            
            if (photo.caption) {
              const captionLines = wrapText(photo.caption, helvetica, 9, captionWidth)
              let captionY = y - 10
              for (const line of captionLines) {
                page.drawText(line, {
                  x: captionX,
                  y: captionY,
                  size: 9,
                  font: helvetica,
                  color: black,
                })
                captionY -= 12
              }
            }
            
            // Photo date
            const photoDate = new Date(photo.created_at).toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
            page.drawText(photoDate, {
              x: captionX,
              y: y - imgHeight + 10,
              size: 8,
              font: helvetica,
              color: darkGray,
            })
            
            y -= imgHeight + 15
          }
        }
      } catch (photoError) {
        // Skip photo if fetch fails
        console.error("Failed to embed photo:", photoError)
      }
    }
    y -= 10
  }

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
  const pdfBytes = await pdfDoc.save()

  return new NextResponse(pdfBytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Daily_Field_Report_${workDate}.pdf"`,
    },
  })
}

// Helper function to wrap text
function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
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
function truncateText(text: string, font: any, fontSize: number, maxWidth: number): string {
  const width = font.widthOfTextAtSize(text, fontSize)
  if (width <= maxWidth) return text
  
  let truncated = text
  while (font.widthOfTextAtSize(truncated + "...", fontSize) > maxWidth && truncated.length > 0) {
    truncated = truncated.slice(0, -1)
  }
  return truncated + "..."
}
