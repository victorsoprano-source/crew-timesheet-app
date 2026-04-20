"use client"

import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { WeeklyPDFData } from "@/app/actions/reports"

// Company and job info
const COMPANY_NAME = "Ahern Painting Cont., Inc."
const JOB_NAME = "C34921R"

// Day names for column headers (Wed-Tue work week)
const DAY_NAMES = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"]

// Check if a day is a weekend (Sat = index 3, Sun = index 4)
function isWeekend(dayIndex: number): boolean {
  return dayIndex === 3 || dayIndex === 4
}

// Format date for display
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00")
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export function generateWeeklyTimesheetPDF(data: WeeklyPDFData): void {
  // Create landscape PDF
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "letter",
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 10

  // Title / Header Section
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text(COMPANY_NAME, pageWidth / 2, 15, { align: "center" })

  doc.setFontSize(12)
  doc.setFont("helvetica", "normal")
  doc.text("Weekly Crew Timesheet", pageWidth / 2, 22, { align: "center" })

  // Job info and week dates
  doc.setFontSize(10)
  doc.text(`Job Name: ${JOB_NAME}`, margin, 32)
  doc.text(`Week: ${formatDate(data.weekStart)} - ${formatDate(data.weekEnd)}`, pageWidth - margin, 32, { align: "right" })

  // Build table columns
  // First column: Worker Name
  // Then 7 day columns (each with sub-columns for ST/OT/DT or OT/DT)
  // Last column: Total Hours

  // Build header rows
  const headerRow1: string[] = ["Worker"]
  const headerRow2: string[] = ["Name - Class"]

  // Day columns with date below
  for (let i = 0; i < 7; i++) {
    const dayName = DAY_NAMES[i]
    const dateObj = new Date(data.weekDates[i] + "T00:00:00")
    const dateStr = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
    headerRow1.push(dayName)
    headerRow2.push(dateStr)
  }

  headerRow1.push("Total")
  headerRow2.push("Hours")

  // Build table body
  const body: (string | number)[][] = []

  for (const worker of data.workers) {
    const row: (string | number)[] = []
    
    // Worker name with classification abbreviation
    row.push(`${worker.workerName} - ${worker.levelAbbr}`)

    // Daily hours for each day
    for (let i = 0; i < 7; i++) {
      const dateStr = data.weekDates[i]
      const dayHours = worker.dailyHours[dateStr] || { st: 0, ot: 0, dt: 0 }
      
      if (isWeekend(i)) {
        // Weekend: OT/DT only
        if (dayHours.ot > 0 || dayHours.dt > 0) {
          row.push(`${dayHours.ot}/${dayHours.dt}`)
        } else {
          row.push("-")
        }
      } else {
        // Weekday: ST/OT/DT
        if (dayHours.st > 0 || dayHours.ot > 0 || dayHours.dt > 0) {
          row.push(`${dayHours.st}/${dayHours.ot}/${dayHours.dt}`)
        } else {
          row.push("-")
        }
      }
    }

    // Total hours
    row.push(worker.totalHours)

    body.push(row)
  }

  // Add totals row
  const totalsRow: (string | number)[] = ["TOTALS"]
  
  // Calculate daily totals
  for (let i = 0; i < 7; i++) {
    const dateStr = data.weekDates[i]
    let dayST = 0, dayOT = 0, dayDT = 0
    
    for (const worker of data.workers) {
      const dayHours = worker.dailyHours[dateStr] || { st: 0, ot: 0, dt: 0 }
      dayST += dayHours.st
      dayOT += dayHours.ot
      dayDT += dayHours.dt
    }

    if (isWeekend(i)) {
      totalsRow.push(`${dayOT}/${dayDT}`)
    } else {
      totalsRow.push(`${dayST}/${dayOT}/${dayDT}`)
    }
  }
  
  totalsRow.push(data.totalHours)
  body.push(totalsRow)

  // Create sub-header row for hour types
  const subHeaderRow: string[] = [""]
  for (let i = 0; i < 7; i++) {
    if (isWeekend(i)) {
      subHeaderRow.push("OT/DT")
    } else {
      subHeaderRow.push("ST/OT/DT")
    }
  }
  subHeaderRow.push("")

  // Generate the table
  autoTable(doc, {
    startY: 38,
    head: [headerRow1, headerRow2, subHeaderRow],
    body: body,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 2,
      halign: "center",
      valign: "middle",
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      halign: "center",
    },
    columnStyles: {
      0: { halign: "left", cellWidth: 45 }, // Worker name column wider
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    didParseCell: function(data) {
      // Bold totals row
      if (data.row.index === body.length - 1 && data.section === "body") {
        data.cell.styles.fontStyle = "bold"
        data.cell.styles.fillColor = [230, 230, 230]
      }
    },
  })

  // Get the final Y position after the table
  const finalY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  // Add legend
  doc.setFontSize(8)
  doc.setFont("helvetica", "normal")
  const legendY = finalY + 8
  doc.text("Legend:", margin, legendY)
  doc.text("ST = Straight Time  |  OT = Overtime (1.5x)  |  DT = Double Time (2x)", margin + 15, legendY)
  doc.text("Classification: JM = Journeyman  |  APP1 = Apprentice Year 1  |  APP2 = Apprentice Year 2  |  APP3 = Apprentice Year 3", margin, legendY + 5)

  // Notes section
  const notesY = legendY + 15
  doc.setFontSize(10)
  doc.setFont("helvetica", "bold")
  doc.text("Notes:", margin, notesY)
  
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  
  if (data.notes) {
    // Split notes into lines
    const splitNotes = doc.splitTextToSize(data.notes, pageWidth - margin * 2)
    doc.text(splitNotes, margin, notesY + 6)
  } else {
    // Empty notes box
    doc.setDrawColor(200, 200, 200)
    doc.rect(margin, notesY + 3, pageWidth - margin * 2, 20)
  }

  // Footer with summary
  const footerY = pageHeight - 15
  doc.setFontSize(9)
  doc.setFont("helvetica", "bold")
  doc.text(`Week Summary: ST: ${data.totalST} hrs | OT: ${data.totalOT} hrs | DT: ${data.totalDT} hrs | Total: ${data.totalHours} hrs`, margin, footerY)
  doc.text(`Workers: ${data.workers.length}`, pageWidth - margin, footerY, { align: "right" })

  // Generation timestamp
  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, pageHeight - 8, { align: "center" })

  // Save the PDF
  const fileName = `Weekly_Timesheet_${data.weekStart}_to_${data.weekEnd}.pdf`
  doc.save(fileName)
}
