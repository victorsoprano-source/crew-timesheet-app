"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText, Download, Clock, Users, TrendingUp, Loader2, ChevronLeft, ChevronRight, Camera, X, Plus, ImageIcon, Wrench, AlertTriangle, Save, HardHat, Images, Trash2, Calendar, CalendarDays, CheckCircle, XCircle } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AutocompleteInput } from "@/components/ui/autocomplete-input"
import { useInputMemory } from "@/hooks/use-input-memory"
import { getWeeklyTotalsFromTimesheets, getDailyWorkerTotals, getReportPhotos, addReportPhoto, updatePhotoCaption, deleteReportPhoto, getDailyFieldReport, saveDailyFieldReport, type WeeklyTotalsReport, type DailyWorkerTotals, type ReportPhoto, type DailyFieldReport } from "@/app/actions/reports"

// Calculate current day index within Wed-Tue week (0=Wed, 1=Thu, ..., 6=Tue)
const getCurrentDayIndex = () => {
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  // Map to Wed-Tue week: Wed=0, Thu=1, Fri=2, Sat=3, Sun=4, Mon=5, Tue=6
  const dayMap: Record<number, number> = { 3: 0, 4: 1, 5: 2, 6: 3, 0: 4, 1: 5, 2: 6 }
  return dayMap[dayOfWeek] ?? 0
}

export function DailyReports() {
  const [viewMode, setViewMode] = useState<"daily" | "weekly">("daily")
  const [weeklyReport, setWeeklyReport] = useState<WeeklyTotalsReport | null>(null)
  const [dailyTotals, setDailyTotals] = useState<DailyWorkerTotals | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDayIndex, setSelectedDayIndex] = useState(getCurrentDayIndex) // Default to current day
  const [photos, setPhotos] = useState<ReportPhoto[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadQueue, setUploadQueue] = useState<{ id: string; name: string; status: "pending" | "uploading" | "success" | "error"; error?: string }[]>([])
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [photoToDelete, setPhotoToDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [photoNotes, setPhotoNotes] = useState<Record<string, string>>({})
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null)
  
  // Field Report state
  const [fieldReport, setFieldReport] = useState<DailyFieldReport | null>(null)
  const [workPerformed, setWorkPerformed] = useState("")
  const [journeymanCount, setJourneymanCount] = useState(0)
  const [apprenticeYear1Count, setApprenticeYear1Count] = useState(0)
  const [apprenticeYear2Count, setApprenticeYear2Count] = useState(0)
  const [apprenticeYear3Count, setApprenticeYear3Count] = useState(0)
  const [equipment, setEquipment] = useState<string[]>([])
  const [newEquipment, setNewEquipment] = useState("")
  const [problemsNotes, setProblemsNotes] = useState("")
  const [isSavingReport, setIsSavingReport] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [exportingType, setExportingType] = useState<"master" | "summary" | "daily" | null>(null)
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null)
  const [pdfType, setPdfType] = useState<"master" | "summary" | "daily" | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)
  const [isSharing, setIsSharing] = useState(false)

  // Autocomplete memory for equipment
  const equipmentMemory = useInputMemory({ fieldType: "equipment" })

  const getWeekDays = (weekStart: Date) => {
    const days = []
    const dayNames = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"]
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      days.push({
        date: d.toISOString().split("T")[0],
        dayName: dayNames[i],
        dayNum: d.getDate(),
      })
    }
    return days
  }

  const weekDays = weeklyReport ? getWeekDays(new Date(weeklyReport.weekStart + "T00:00:00")) : []
  const selectedDay = weekDays[selectedDayIndex]
  const workersToday = dailyTotals?.workerCount || 0

  const getWeekStart = (offset: number) => {
    const today = new Date()
    const dayOfWeek = today.getDay()
    const wednesday = new Date(today)
    // Wednesday = 3
    const diff = dayOfWeek >= 3 ? dayOfWeek - 3 : dayOfWeek + 4
    wednesday.setDate(today.getDate() - diff + (offset * 7))
    wednesday.setHours(0, 0, 0, 0)
    return wednesday
  }

  const loadData = async () => {
    setIsLoading(true)
    
    try {
      const weekStart = getWeekStart(weekOffset)
      const report = await getWeeklyTotalsFromTimesheets(weekStart)
      setWeeklyReport(report)
      
      // Load photos for the week
      if (report) {
        const weekPhotos = await getReportPhotos(report.weekStart)
        setPhotos(weekPhotos)
        // Initialize photo notes from loaded data
        const notesMap: Record<string, string> = {}
        weekPhotos.forEach(p => {
          notesMap[p.id] = p.caption || ""
        })
        setPhotoNotes(notesMap)
        
        // Load daily totals for the current selected day
        const weekDaysNow = getWeekDays(new Date(report.weekStart + "T00:00:00"))
        const selectedDayNow = weekDaysNow[selectedDayIndex]
        if (selectedDayNow) {
          const daily = await getDailyWorkerTotals(report.weekStart, selectedDayNow.date)
          setDailyTotals(daily)
        }
      }
    } catch (err) {
      console.error("Error loading report data:", err)
      setWeeklyReport(null)
      setDailyTotals(null)
    }
    
    setIsLoading(false)
  }

  // Load daily totals when selected day changes
  const loadDailyTotals = async () => {
    if (!weeklyReport || !selectedDay) {
      console.log("[v0] loadDailyTotals: skipping - weeklyReport or selectedDay missing")
      setDailyTotals(null)
      return
    }
    
    console.log("[v0] loadDailyTotals: fetching for", selectedDay.date)
    
    try {
      const daily = await getDailyWorkerTotals(weeklyReport.weekStart, selectedDay.date)
      console.log("[v0] loadDailyTotals: result", {
        date: daily.date,
        totalST: daily.totalST,
        totalOT: daily.totalOT,
        totalDT: daily.totalDT,
        totalHours: daily.totalHours,
        workerCount: daily.workers.length
      })
      setDailyTotals(daily)
    } catch (err) {
      console.error("[v0] Error loading daily totals:", err)
      setDailyTotals(null)
    }
  }

  const getPhotoUrl = (pathname: string) => {
    return `/api/file?pathname=${encodeURIComponent(pathname)}`
  }

  // Upload a single file and return result
  const uploadSingleFile = async (file: File, queueId: string): Promise<{ success: boolean; photo?: ReportPhoto; error?: string }> => {
    if (!weeklyReport || !selectedDay) {
      return { success: false, error: "No week or day selected" }
    }
    
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        return { success: false, error: result.error || 'Upload failed' }
      }

      // Save to database
      const { success, photo, error } = await addReportPhoto({
        weekStart: weeklyReport.weekStart,
        workDate: selectedDay.date,
        photoPathname: result.pathname,
      })

      if (success && photo) {
        return { success: true, photo }
      } else {
        return { success: false, error: error || "Failed to save photo" }
      }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Upload failed" }
    }
  }

  // Handle multiple file uploads with progress tracking
  const handleMultiplePhotoUpload = async (files: File[]) => {
    if (!weeklyReport || !selectedDay || files.length === 0) return
    
    setIsUploading(true)
    setUploadSuccess(null)
    
    // Create queue entries for all files
    const queueEntries = files.map((file, index) => ({
      id: `upload-${Date.now()}-${index}`,
      name: file.name,
      status: "pending" as const,
    }))
    
    setUploadQueue(queueEntries)
    
    let successCount = 0
    let errorCount = 0
    const newPhotos: ReportPhoto[] = []
    
    // Process uploads one at a time to avoid overwhelming the server
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const queueId = queueEntries[i].id
      
      // Update status to uploading
      setUploadQueue(prev => prev.map(item => 
        item.id === queueId ? { ...item, status: "uploading" as const } : item
      ))
      
      const result = await uploadSingleFile(file, queueId)
      
      if (result.success && result.photo) {
        successCount++
        newPhotos.push(result.photo)
        setUploadQueue(prev => prev.map(item => 
          item.id === queueId ? { ...item, status: "success" as const } : item
        ))
      } else {
        errorCount++
        setUploadQueue(prev => prev.map(item => 
          item.id === queueId ? { ...item, status: "error" as const, error: result.error } : item
        ))
      }
    }
    
    // Add all successful photos to state at once
    if (newPhotos.length > 0) {
      setPhotos(prev => [...newPhotos, ...prev])
      // Initialize empty notes for new photos
      const newNotes: Record<string, string> = {}
      newPhotos.forEach(p => { newNotes[p.id] = "" })
      setPhotoNotes(prev => ({ ...prev, ...newNotes }))
    }
    
    // Show success message
    if (successCount > 0) {
      setUploadSuccess(`${successCount} photo${successCount > 1 ? 's' : ''} uploaded successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`)
      // Clear success message after 3 seconds
      setTimeout(() => setUploadSuccess(null), 3000)
    }
    
    // Clear queue after a short delay to show final status
    setTimeout(() => {
      setUploadQueue([])
      setIsUploading(false)
    }, errorCount > 0 ? 5000 : 1500) // Keep longer if there were errors
  }

  // Mobile-friendly file select - allows camera or gallery
  const handleFileSelect = (useCamera: boolean = false) => {
    if (isUploading) return // Prevent double-tap while uploading
    
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    // Only set capture when explicitly using camera
    // Omitting capture allows iOS/Android to show camera OR gallery option
    if (useCamera) {
      input.capture = 'environment'
    }
    // Allow multiple file selection for gallery
    input.multiple = !useCamera
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files
      if (files && files.length > 0) {
        await handleMultiplePhotoUpload(Array.from(files))
      }
    }
    input.click()
  }

  const confirmDeletePhoto = async () => {
    if (!photoToDelete) return
    
    setIsDeleting(true)
    const { success } = await deleteReportPhoto(photoToDelete)
    if (success) {
      setPhotos(photos.filter(p => p.id !== photoToDelete))
    }
    setIsDeleting(false)
    setPhotoToDelete(null)
  }

  const handleSavePhotoNote = async (photoId: string) => {
    setSavingNoteId(photoId)
    const note = photoNotes[photoId] || ""
    const { success } = await updatePhotoCaption(photoId, note)
    if (success) {
      setPhotos(photos.map(p => 
        p.id === photoId ? { ...p, caption: note } : p
      ))
    }
    setSavingNoteId(null)
  }

  const updatePhotoNote = (photoId: string, note: string) => {
    setPhotoNotes(prev => ({ ...prev, [photoId]: note }))
  }

  // Filter photos for selected day
  const dayPhotos = photos.filter(p => p.work_date === selectedDay?.date)

  // Load field report when day changes
  const loadFieldReport = async () => {
    if (!weeklyReport || !selectedDay) return
    
    const report = await getDailyFieldReport(weeklyReport.weekStart, selectedDay.date)
    setFieldReport(report)
    
    if (report) {
      setWorkPerformed(report.work_performed || "")
      setJourneymanCount(report.journeyman_count || 0)
      setApprenticeYear1Count(report.apprentice_year1_count || 0)
      setApprenticeYear2Count(report.apprentice_year2_count || 0)
      setApprenticeYear3Count(report.apprentice_year3_count || 0)
      setEquipment(report.equipment || [])
      setProblemsNotes(report.problems_notes || "")
    } else {
      // Reset form for new day
      setWorkPerformed("")
      setJourneymanCount(0)
      setApprenticeYear1Count(0)
      setApprenticeYear2Count(0)
      setApprenticeYear3Count(0)
      setEquipment([])
      setProblemsNotes("")
    }
  }

  const handleSaveFieldReport = async () => {
    if (!weeklyReport || !selectedDay) return
    
    setIsSavingReport(true)
    setSaveStatus("saving")
    
    const payload = {
      weekStart: weeklyReport.weekStart,
      workDate: selectedDay.date,
      workPerformed,
      journeymanCount,
      apprenticeYear1Count,
      apprenticeYear2Count,
      apprenticeYear3Count,
      equipment,
      problemsNotes,
    }
    
    try {
      await saveDailyFieldReport(payload)
      setSaveStatus("saved")
      // Reset to idle after 2 seconds
      setTimeout(() => setSaveStatus("idle"), 2000)
    } catch (err) {
      console.error("Error saving field report:", err)
      setSaveStatus("error")
      // Reset to idle after 3 seconds
      setTimeout(() => setSaveStatus("idle"), 3000)
    } finally {
      setIsSavingReport(false)
    }
  }

  const addEquipmentItem = () => {
    if (newEquipment.trim()) {
      const trimmedValue = newEquipment.trim()
      setEquipment([...equipment, trimmedValue])
      equipmentMemory.saveValue(trimmedValue) // Save to autocomplete memory
      setNewEquipment("")
    }
  }

  const removeEquipmentItem = (index: number) => {
    setEquipment(equipment.filter((_, i) => i !== index))
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset])

  // Load field report and daily totals when selected day changes
  useEffect(() => {
    loadFieldReport()
    loadDailyTotals()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayIndex, weeklyReport?.weekStart])

  const formatWeekRange = () => {
    if (!weeklyReport) return ""
    const start = new Date(weeklyReport.weekStart + "T00:00:00")
    const end = new Date(weeklyReport.weekEnd + "T00:00:00")
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      {/* View Mode Toggle */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={viewMode === "daily" ? "default" : "outline"}
          onClick={() => setViewMode("daily")}
          className={viewMode === "daily" ? "bg-primary text-primary-foreground h-14" : "border-border h-14"}
        >
          <div className="flex flex-col items-center gap-0.5">
            <Calendar className="h-5 w-5" />
            <span className="text-xs font-semibold">Daily Reports</span>
          </div>
        </Button>
        <Button
          variant={viewMode === "weekly" ? "default" : "outline"}
          onClick={() => setViewMode("weekly")}
          className={viewMode === "weekly" ? "bg-primary text-primary-foreground h-14" : "border-border h-14"}
        >
          <div className="flex flex-col items-center gap-0.5">
            <CalendarDays className="h-5 w-5" />
            <span className="text-xs font-semibold">Weekly Reports</span>
          </div>
        </Button>
      </div>

      {/* Week Navigation */}
      <Card className="flex items-center justify-between p-3 bg-card border-border">
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(weekOffset - 1)}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Week of</p>
          <p className="font-semibold text-foreground">{formatWeekRange()}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setWeekOffset(weekOffset + 1)}>
          <ChevronRight className="h-5 w-5" />
        </Button>
      </Card>

      {/* ==================== WEEKLY REPORTS ==================== */}
      {viewMode === "weekly" && (
        <>
          {/* Weekly Reports Header */}
          <Card className="flex items-center gap-3 p-4 bg-card border-border">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-chart-3/20">
              <CalendarDays className="h-6 w-6 text-chart-3" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-foreground">Weekly Reports</h2>
              <p className="text-sm text-muted-foreground">
                {weeklyReport?.isWeekComplete ? "Final totals for the week" : "Week-to-date accumulated totals"}
              </p>
            </div>
          </Card>

          {/* Export PDF Buttons */}
          <Card className="p-4 bg-card border-border">
            <p className="text-sm font-semibold text-foreground mb-3">Export Weekly Reports</p>
            <div className="flex flex-col gap-2">
              {/* Master Timesheet Button */}
              <Button
                variant="outline"
                onClick={async () => {
                  if (exportingType || !weeklyReport) return
                  setExportingType("master")
                  setPdfBlobUrl(null)
                  setPdfType(null)
                  
                  const weekStartStr = weeklyReport.weekStart
                  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
                  const controller = new AbortController()
                  const timeoutId = setTimeout(() => controller.abort(), 30000)
                  
                  try {
                    const response = await fetch(`/api/export-pdf/master?weekStart=${weekStartStr}`, {
                      signal: controller.signal
                    })
                    clearTimeout(timeoutId)
                    
                    if (!response.ok) {
                      let errorMsg = "PDF generation failed"
                      try {
                        const errorData = await response.json()
                        errorMsg = errorData.error || errorMsg
                      } catch {}
                      alert(errorMsg)
                      return
                    }
                    
                    const blob = await response.blob()
                    if (blob.size === 0) {
                      alert("Error: Empty PDF received")
                      return
                    }
                    
                    const url = window.URL.createObjectURL(blob)
                    setPdfBlobUrl(url)
                    setPdfType("master")
                    
                    if (isMobile) {
                      window.open(url, "_blank")
                    } else {
                      const a = document.createElement("a")
                      a.href = url
                      a.download = `Weekly_Timesheet_Master_${weekStartStr}.pdf`
                      a.style.display = "none"
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                    }
                  } catch (err) {
                    clearTimeout(timeoutId)
                    if (err instanceof Error && err.name === "AbortError") {
                      alert("Export timed out. Please try again.")
                    } else {
                      alert("Error generating PDF: " + (err instanceof Error ? err.message : "Unknown error"))
                    }
                  } finally {
                    setExportingType(null)
                  }
                }}
                disabled={!!exportingType || !weeklyReport || weeklyReport.workerCount === 0}
                className="w-full justify-start border-border h-12"
              >
                {exportingType === "master" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                <div className="text-left">
                  <div className="font-medium">Weekly Timesheet Master</div>
                  <div className="text-xs text-muted-foreground">Official crew sheet with daily breakdown</div>
                </div>
              </Button>
              
              {/* Summary Report Button */}
              <Button
                variant="outline"
                onClick={async () => {
                  if (exportingType || !weeklyReport) return
                  setExportingType("summary")
                  setPdfBlobUrl(null)
                  setPdfType(null)
                  
                  const weekStartStr = weeklyReport.weekStart
                  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
                  const controller = new AbortController()
                  const timeoutId = setTimeout(() => controller.abort(), 30000)
                  
                  try {
                    const response = await fetch(`/api/export-pdf/summary?weekStart=${weekStartStr}`, {
                      signal: controller.signal
                    })
                    clearTimeout(timeoutId)
                    
                    if (!response.ok) {
                      let errorMsg = "PDF generation failed"
                      try {
                        const errorData = await response.json()
                        errorMsg = errorData.error || errorMsg
                      } catch {}
                      alert(errorMsg)
                      return
                    }
                    
                    const blob = await response.blob()
                    if (blob.size === 0) {
                      alert("Error: Empty PDF received")
                      return
                    }
                    
                    const url = window.URL.createObjectURL(blob)
                    setPdfBlobUrl(url)
                    setPdfType("summary")
                    
                    if (isMobile) {
                      window.open(url, "_blank")
                    } else {
                      const a = document.createElement("a")
                      a.href = url
                      a.download = `Weekly_Summary_${weekStartStr}.pdf`
                      a.style.display = "none"
                      document.body.appendChild(a)
                      a.click()
                      document.body.removeChild(a)
                    }
                  } catch (err) {
                    clearTimeout(timeoutId)
                    if (err instanceof Error && err.name === "AbortError") {
                      alert("Export timed out. Please try again.")
                    } else {
                      alert("Error generating PDF: " + (err instanceof Error ? err.message : "Unknown error"))
                    }
                  } finally {
                    setExportingType(null)
                  }
                }}
                disabled={!!exportingType || !weeklyReport || weeklyReport.workerCount === 0}
                className="w-full justify-start border-border h-12"
              >
                {exportingType === "summary" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                <div className="text-left">
                  <div className="font-medium">Weekly Summary Report</div>
                  <div className="text-xs text-muted-foreground">Quick overview for email/sharing</div>
                </div>
              </Button>
            </div>
          </Card>

          {/* PDF Actions - shown when blob URL exists (for weekly exports only) */}
          {pdfBlobUrl && (pdfType === "master" || pdfType === "summary") && (
            <Card className="p-4 bg-chart-3/10 border-chart-3/30">
              <p className="text-sm text-chart-3 font-semibold mb-3">
                {pdfType === "master" ? "Timesheet Master" : "Summary Report"} Ready!
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => window.open(pdfBlobUrl, "_blank")}
                  className="w-full bg-chart-3 hover:bg-chart-3/90 text-primary-foreground"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Open PDF
                </Button>
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const a = document.createElement("a")
                      a.href = pdfBlobUrl
                      a.download = pdfType === "master" 
                        ? `Weekly_Timesheet_Master_${weeklyReport?.weekStart || "export"}.pdf`
                        : `Weekly_Summary_${weeklyReport?.weekStart || "export"}.pdf`
                      a.click()
                    }}
                    className="flex-1 border-chart-3/50 text-chart-3 hover:bg-chart-3/20"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                  
                  {typeof navigator !== "undefined" && navigator.share && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const response = await fetch(pdfBlobUrl)
                          const blob = await response.blob()
                          const filename = pdfType === "master" 
                            ? `Weekly_Timesheet_Master_${weeklyReport?.weekStart || "export"}.pdf`
                            : `Weekly_Summary_${weeklyReport?.weekStart || "export"}.pdf`
                          const file = new File([blob], filename, { type: "application/pdf" })
                          await navigator.share({
                            files: [file],
                            title: pdfType === "master" ? "Weekly Timesheet Master" : "Weekly Summary Report",
                          })
                        } catch {}
                      }}
                      className="flex-1 border-chart-3/50 text-chart-3 hover:bg-chart-3/20"
                    >
                      Share
                    </Button>
                  )}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      window.URL.revokeObjectURL(pdfBlobUrl)
                      setPdfBlobUrl(null)
                      setPdfType(null)
                    }}
                    className="text-muted-foreground px-2"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Week Status Badge */}
          <div className={`border rounded-lg p-3 text-center ${
            weeklyReport?.isWeekComplete 
              ? "bg-chart-3/10 border-chart-3/30" 
              : "bg-amber-500/10 border-amber-500/30"
          }`}>
            <p className={`text-sm font-semibold ${
              weeklyReport?.isWeekComplete ? "text-chart-3" : "text-amber-500"
            }`}>
              {weeklyReport?.isWeekComplete ? "Week Complete - Final Totals" : "Week In Progress - To Date"}
            </p>
            {!weeklyReport?.isWeekComplete && weeklyReport?.daysWithData !== undefined && (
              <p className="text-xs text-muted-foreground mt-1">
                {weeklyReport.daysWithData} day{weeklyReport.daysWithData !== 1 ? "s" : ""} of data so far
              </p>
            )}
          </div>

          {/* Weekly Summary Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4 bg-card border-border">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{weeklyReport?.totalST || 0}</p>
                  <p className="text-xs text-muted-foreground">Weekly ST</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-card border-border">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-3/20">
                  <Clock className="h-5 w-5 text-chart-3" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{weeklyReport?.totalOT || 0}</p>
                  <p className="text-xs text-muted-foreground">Weekly OT</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-card border-border">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/20">
                  <Clock className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{weeklyReport?.totalDT || 0}</p>
                  <p className="text-xs text-muted-foreground">Weekly DT</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-card border-border">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20">
                  <TrendingUp className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{weeklyReport?.totalHours || 0}</p>
                  <p className="text-xs text-muted-foreground">Total Hours</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Weekly Worker Count */}
          <Card className="p-4 bg-card border-border">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{weeklyReport?.workerCount || 0}</p>
                <p className="text-xs text-muted-foreground">
                  Workers This Week
                </p>
              </div>
            </div>
          </Card>

          {/* Weekly Worker Breakdown (Accumulated) */}
          {weeklyReport && weeklyReport.workerTotals.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 px-1">
                <h3 className="text-sm font-semibold text-foreground">
                  Weekly Worker Hours
                </h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  weeklyReport.isWeekComplete 
                    ? "bg-chart-3/10 text-chart-3" 
                    : "bg-amber-500/10 text-amber-500"
                }`}>
                  {weeklyReport.isWeekComplete ? "Final Totals" : "Accumulated"}
                </span>
              </div>
              {weeklyReport.workerTotals
                .filter(worker => worker.weeklyTotal > 0)
                .map((worker) => (
                <Card key={worker.workerId} className="p-4 bg-card border-border">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-medium text-foreground">{worker.workerName}</p>
                      <p className="text-sm text-muted-foreground">{worker.workerTrade}</p>
                    </div>
                    <span className="text-lg font-bold text-foreground">{worker.weeklyTotal} hrs</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-primary/10 rounded-lg p-2">
                      <p className="text-lg font-semibold text-primary">{worker.weeklyST}</p>
                      <p className="text-xs text-muted-foreground">ST</p>
                    </div>
                    <div className="bg-chart-3/10 rounded-lg p-2">
                      <p className="text-lg font-semibold text-chart-3">{worker.weeklyOT}</p>
                      <p className="text-xs text-muted-foreground">OT</p>
                    </div>
                    <div className="bg-destructive/10 rounded-lg p-2">
                      <p className="text-lg font-semibold text-destructive">{worker.weeklyDT}</p>
                      <p className="text-xs text-muted-foreground">DT</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {/* Weekly Empty State */}
          {(!weeklyReport || weeklyReport.workerTotals.filter(w => w.weeklyTotal > 0).length === 0) && !isLoading && (
            <Card className="p-8 bg-card border-border text-center">
              <p className="text-muted-foreground">No timesheet data for this week. Add entries in the Timesheet tab.</p>
            </Card>
          )}
        </>
      )}

      {/* ==================== DAILY REPORTS ==================== */}
      {viewMode === "daily" && (
        <>
          {/* Daily Reports Header */}
          <Card className="flex items-center gap-3 p-4 bg-card border-border">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
              <Calendar className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-foreground">Daily Reports</h2>
              <p className="text-sm text-muted-foreground">
                Showing {selectedDay?.dayName} {selectedDay?.dayNum} only
              </p>
            </div>
          </Card>

          {/* Summary Stats - Daily ST, OT, DT breakdown */}
          <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{dailyTotals?.totalST || 0}</p>
              <p className="text-xs text-muted-foreground">Daily ST</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-3/20">
              <Clock className="h-5 w-5 text-chart-3" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{dailyTotals?.totalOT || 0}</p>
              <p className="text-xs text-muted-foreground">Daily OT</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/20">
              <Clock className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{dailyTotals?.totalDT || 0}</p>
              <p className="text-xs text-muted-foreground">Daily DT</p>
            </div>
          </div>
        </Card>
        <Card className="p-4 bg-card border-border">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent/20">
              <TrendingUp className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-2xl font-bold text-foreground">{dailyTotals?.totalHours || 0}</p>
              <p className="text-xs text-muted-foreground">Daily Hours</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Day Selector */}
      {weekDays.length > 0 && (
        <Card className="p-3 bg-card border-border">
          <p className="text-xs text-muted-foreground mb-2 text-center">Select Day</p>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day, index) => (
              <Button
                key={day.date}
                variant={selectedDayIndex === index ? "default" : "ghost"}
                size="sm"
                className={`flex flex-col items-center p-2 h-auto ${
                  selectedDayIndex === index ? "bg-primary text-primary-foreground" : ""
                }`}
                onClick={() => setSelectedDayIndex(index)}
              >
                <span className="text-xs">{day.dayName}</span>
                <span className="text-sm font-bold">{day.dayNum}</span>
              </Button>
            ))}
          </div>
        </Card>
      )}

      {/* Export Daily PDF Button */}
      <Button
        variant="outline"
        onClick={async () => {
          if (exportingType || !weeklyReport || !selectedDay) {
            console.log("[v0] Export blocked - missing data:", { 
              exportingType, 
              hasWeeklyReport: !!weeklyReport, 
              hasSelectedDay: !!selectedDay 
            })
            return
          }
          setExportingType("daily")
          setPdfBlobUrl(null)
          setPdfType(null)
          
          const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), 60000) // 60s timeout
          
          // Build URL - use relative path which works in both preview and production
          const apiUrl = `/api/export-pdf/daily?workDate=${encodeURIComponent(selectedDay.date)}&weekStart=${encodeURIComponent(weeklyReport.weekStart)}`
          console.log("[v0] Fetching PDF from:", apiUrl)
          
          try {
            const response = await fetch(apiUrl, { 
              signal: controller.signal,
              credentials: "same-origin", // Include cookies for auth
              cache: "no-store" // Don't cache PDF requests
            })
            clearTimeout(timeoutId)
            
            console.log("[v0] PDF response status:", response.status, response.statusText)
            
            if (!response.ok) {
              let errorMsg = `PDF generation failed (${response.status})`
              try {
                const contentType = response.headers.get("content-type")
                if (contentType?.includes("application/json")) {
                  const errorData = await response.json()
                  errorMsg = errorData.error || errorMsg
                }
              } catch (e) {
                console.error("[v0] Error parsing error response:", e)
              }
              alert(errorMsg)
              return
            }
            
            const blob = await response.blob()
            console.log("[v0] PDF blob received, size:", blob.size, "type:", blob.type)
            
            if (blob.size === 0) {
              alert("Error: Empty PDF received. Please try again.")
              return
            }
            
            const url = window.URL.createObjectURL(blob)
            setPdfBlobUrl(url)
            setPdfType("daily")
            
            if (isMobile) {
              // On mobile, open in new tab for better compatibility
              window.open(url, "_blank")
            } else {
              // On desktop, trigger download
              const a = document.createElement("a")
              a.href = url
              a.download = `Daily_Field_Report_${selectedDay.date}.pdf`
              a.style.display = "none"
              document.body.appendChild(a)
              a.click()
              document.body.removeChild(a)
            }
          } catch (err) {
            clearTimeout(timeoutId)
            console.error("[v0] PDF export error:", err)
            if (err instanceof Error && err.name === "AbortError") {
              alert("Export timed out after 60 seconds. Please try again.")
            } else {
              alert("Error generating PDF: " + (err instanceof Error ? err.message : "Unknown error"))
            }
          } finally {
            setExportingType(null)
          }
        }}
        disabled={!!exportingType || !weeklyReport || !selectedDay}
        className="w-full justify-center border-border h-12"
      >
        {exportingType === "daily" ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <FileText className="h-4 w-4 mr-2" />
        )}
        <span className="font-medium">Export Daily PDF</span>
      </Button>

      {/* Daily PDF Actions - shown when daily blob URL exists */}
      {pdfBlobUrl && pdfType === "daily" && (
        <Card className="p-4 bg-chart-3/10 border-chart-3/30">
          <p className="text-sm text-chart-3 font-semibold mb-3">Daily Field Report Ready!</p>
          <div className="flex flex-col gap-2">
            <Button
              onClick={() => window.open(pdfBlobUrl, "_blank")}
              className="w-full bg-chart-3 hover:bg-chart-3/90 text-primary-foreground"
            >
              <FileText className="h-4 w-4 mr-2" />
              Open PDF
            </Button>
            
            <div className="flex gap-2">
              {/* Download Button */}
              <Button
                variant="outline"
                size="sm"
                disabled={isDownloading}
                onClick={async () => {
                  if (!pdfBlobUrl) return
                  setIsDownloading(true)
                  
                  const filename = `Daily-Field-Report-C34921R-${selectedDay?.date || "export"}.pdf`
                  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
                  
                  try {
                    // Try anchor download first
                    const a = document.createElement("a")
                    a.href = pdfBlobUrl
                    a.download = filename
                    a.style.display = "none"
                    document.body.appendChild(a)
                    a.click()
                    document.body.removeChild(a)
                    
                    // On mobile, also open in new tab as fallback
                    if (isMobile) {
                      // Small delay then open in new tab as backup
                      setTimeout(() => {
                        window.open(pdfBlobUrl, "_blank")
                      }, 500)
                    }
                  } catch (err) {
                    // Fallback: open in new tab
                    window.open(pdfBlobUrl, "_blank")
                  } finally {
                    setIsDownloading(false)
                  }
                }}
                className="flex-1 border-chart-3/50 text-chart-3 hover:bg-chart-3/20"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </>
                )}
              </Button>
              
              {/* Share Button */}
              <Button
                variant="outline"
                size="sm"
                disabled={isSharing}
                onClick={async () => {
                  if (!pdfBlobUrl) return
                  setIsSharing(true)
                  
                  const filename = `Daily-Field-Report-C34921R-${selectedDay?.date || "export"}.pdf`
                  
                  try {
                    // Check if navigator.share is available
                    if (!navigator.share) {
                      alert("Sharing is not supported on this device. Use Download or Open PDF.")
                      return
                    }
                    
                    // Fetch the blob from the URL
                    const response = await fetch(pdfBlobUrl)
                    const blob = await response.blob()
                    
                    // Check if file sharing is supported
                    const file = new File([blob], filename, { type: "application/pdf" })
                    const canShareFiles = navigator.canShare && navigator.canShare({ files: [file] })
                    
                    if (canShareFiles) {
                      // Share the file directly
                      await navigator.share({
                        files: [file],
                        title: "Daily Field Report",
                      })
                    } else {
                      // File sharing not supported, try sharing just text/url
                      // Since blob URLs don't work externally, inform user
                      alert("File sharing is not supported on this device. Use Download or Open PDF to save the file first.")
                    }
                  } catch (err) {
                    // User cancelled share or error occurred
                    if (err instanceof Error && err.name !== "AbortError") {
                      alert("Sharing failed. Use Download or Open PDF instead.")
                    }
                  } finally {
                    setIsSharing(false)
                  }
                }}
                className="flex-1 border-chart-3/50 text-chart-3 hover:bg-chart-3/20"
              >
                {isSharing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    Sharing...
                  </>
                ) : (
                  <>
                    Share
                  </>
                )}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  window.URL.revokeObjectURL(pdfBlobUrl)
                  setPdfBlobUrl(null)
                  setPdfType(null)
                }}
                className="text-muted-foreground px-2"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Worker Count - Today */}
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{workersToday}</p>
            <p className="text-xs text-muted-foreground">
              Workers on {selectedDay?.dayName || "Selected Day"} (Present/Late)
            </p>
          </div>
        </div>
      </Card>

      {/* Daily Photos */}
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">
              Photos - {selectedDay?.dayName} {selectedDay?.dayNum}
            </h3>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFileSelect(true)}
              disabled={isUploading}
              className="border-border"
              title="Take photo with camera"
            >
              <Camera className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Camera</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleFileSelect(false)}
              disabled={isUploading}
              className="border-border relative"
              title="Choose multiple photos from gallery"
            >
              <Images className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Gallery</span>
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] px-1 rounded-full">
                +
              </span>
            </Button>
          </div>
        </div>

        {/* Upload Progress Queue */}
        {uploadQueue.length > 0 && (
          <div className="mb-4 p-3 bg-secondary/30 rounded-lg border border-border">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Uploading {uploadQueue.filter(u => u.status === "success").length}/{uploadQueue.length} photos...
            </p>
            <div className="flex flex-col gap-2">
              {uploadQueue.map((item) => (
                <div key={item.id} className="flex items-center gap-2 text-sm">
                  {item.status === "pending" && (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  )}
                  {item.status === "uploading" && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}
                  {item.status === "success" && (
                    <CheckCircle className="h-4 w-4 text-chart-3" />
                  )}
                  {item.status === "error" && (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span className={`truncate flex-1 ${item.status === "error" ? "text-destructive" : "text-foreground"}`}>
                    {item.name.length > 25 ? `${item.name.slice(0, 25)}...` : item.name}
                  </span>
                  {item.status === "error" && item.error && (
                    <span className="text-xs text-destructive">{item.error}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Success Message */}
        {uploadSuccess && (
          <div className="mb-4 p-3 bg-chart-3/10 border border-chart-3/30 rounded-lg flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-chart-3 flex-shrink-0" />
            <p className="text-sm font-medium text-chart-3">{uploadSuccess}</p>
          </div>
        )}

        {dayPhotos.length === 0 && !isUploading ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No photos for this day</p>
            <p className="text-xs text-muted-foreground mt-1">Select multiple photos from gallery at once</p>
            <div className="flex gap-2 mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFileSelect(true)}
                disabled={isUploading}
              >
                <Camera className="h-4 w-4 mr-2" />
                Take Photo
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={() => handleFileSelect(false)}
                disabled={isUploading}
              >
                <Images className="h-4 w-4 mr-2" />
                Add Photos
              </Button>
            </div>
          </div>
        ) : dayPhotos.length > 0 ? (
          <div className="flex flex-col gap-4 max-h-[60vh] overflow-y-auto pr-1">
            {dayPhotos.map((photo, index) => (
              <div key={photo.id} className="bg-secondary/30 rounded-lg p-3 border border-border">
                {/* Photo Entry Header */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Entry #{index + 1}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-destructive hover:bg-destructive/10"
                    onClick={() => setPhotoToDelete(photo.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete
                  </Button>
                </div>
                
                {/* Photo + Notes Layout */}
                <div className="flex gap-3">
                  {/* Photo Preview */}
                  <button
                    type="button"
                    onClick={() => setPreviewImage(getPhotoUrl(photo.photo_pathname))}
                    className="shrink-0 w-24 h-24 rounded-lg overflow-hidden border border-border hover:opacity-90 transition-opacity"
                  >
                    <img
                      src={getPhotoUrl(photo.photo_pathname)}
                      alt={`Field entry ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                  
                  {/* Notes Section */}
                  <div className="flex-1 flex flex-col gap-2">
                    <Textarea
                      value={photoNotes[photo.id] || ""}
                      onChange={(e) => updatePhotoNote(photo.id, e.target.value)}
                      placeholder="Add detailed notes for this photo..."
                      className="flex-1 min-h-[80px] bg-input border-border text-sm resize-none"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSavePhotoNote(photo.id)}
                      disabled={savingNoteId === photo.id}
                      className="self-end"
                    >
                      {savingNoteId === photo.id ? (
                        <>
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-3 w-3 mr-1" />
                          Save Note
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      {/* Daily Field Report */}
      <Card className="p-4 bg-card border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <h3 className="font-semibold text-foreground">
              Field Report - {selectedDay?.dayName} {selectedDay?.dayNum}
            </h3>
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={handleSaveFieldReport}
            disabled={isSavingReport}
          >
            {isSavingReport ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </div>

        {/* Work Performed */}
        <div className="mb-4">
          <label className="text-sm font-medium text-foreground mb-2 block">Work Performed Today</label>
          <Textarea
            placeholder="Describe work completed..."
            value={workPerformed}
            onChange={(e) => setWorkPerformed(e.target.value)}
            className="min-h-[80px] bg-input border-border"
          />
        </div>

        {/* Crew Summary */}
        <div className="mb-4">
          <label className="text-sm font-medium text-foreground mb-2 block flex items-center gap-2">
            <HardHat className="h-4 w-4" />
            Crew Summary
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Journeymen</label>
              <Input
                type="number"
                min="0"
                value={journeymanCount || ""}
                onChange={(e) => setJourneymanCount(e.target.value === "" ? 0 : parseInt(e.target.value, 10) || 0)}
                onBlur={(e) => { if (e.target.value === "") setJourneymanCount(0) }}
                className="bg-input border-border text-center"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Apprentice Yr 1</label>
              <Input
                type="number"
                min="0"
                value={apprenticeYear1Count || ""}
                onChange={(e) => setApprenticeYear1Count(e.target.value === "" ? 0 : parseInt(e.target.value, 10) || 0)}
                onBlur={(e) => { if (e.target.value === "") setApprenticeYear1Count(0) }}
                className="bg-input border-border text-center"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Apprentice Yr 2</label>
              <Input
                type="number"
                min="0"
                value={apprenticeYear2Count || ""}
                onChange={(e) => setApprenticeYear2Count(e.target.value === "" ? 0 : parseInt(e.target.value, 10) || 0)}
                onBlur={(e) => { if (e.target.value === "") setApprenticeYear2Count(0) }}
                className="bg-input border-border text-center"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Apprentice Yr 3</label>
              <Input
                type="number"
                min="0"
                value={apprenticeYear3Count || ""}
                onChange={(e) => setApprenticeYear3Count(e.target.value === "" ? 0 : parseInt(e.target.value, 10) || 0)}
                onBlur={(e) => { if (e.target.value === "") setApprenticeYear3Count(0) }}
                className="bg-input border-border text-center"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        {/* Equipment Used */}
        <div className="mb-4">
          <label className="text-sm font-medium text-foreground mb-2 block flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Equipment Used
          </label>
          <div className="flex gap-2 mb-2">
            <AutocompleteInput
              fieldType="equipment"
              placeholder="Add equipment..."
              value={newEquipment}
              onChange={(value) => setNewEquipment(value)}
              autoSaveOnBlur={false}
              className="bg-input border-border"
            />
            <Button variant="outline" size="sm" onClick={addEquipmentItem} className="shrink-0">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {equipment.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {equipment.map((item, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-secondary rounded-md text-sm"
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => removeEquipmentItem(index)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Problems / Notes */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Problems / Notes
          </label>
          <Textarea
            placeholder="Any issues, delays, or notes..."
            value={problemsNotes}
            onChange={(e) => setProblemsNotes(e.target.value)}
            className="min-h-[60px] bg-input border-border"
          />
        </div>
      </Card>

      {/* Worker Breakdown - Daily (Selected Day Only) */}
      {dailyTotals && dailyTotals.workers.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <h3 className="text-sm font-semibold text-foreground">
              Daily Worker Hours
            </h3>
            <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded-full">
              {selectedDay?.dayName} {selectedDay?.dayNum} only
            </span>
          </div>
          {dailyTotals.workers
            .filter(worker => worker.status !== "Absent")
            .map((worker) => (
            <Card key={worker.workerId} className="p-4 bg-card border-border">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-medium text-foreground">{worker.workerName}</p>
                  <p className="text-sm text-muted-foreground">{worker.workerTrade}</p>
                </div>
                <span className="text-lg font-bold text-foreground">{worker.dailyTotal} hrs</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-primary/10 rounded-lg p-2">
                  <p className="text-lg font-semibold text-primary">{worker.dailyST}</p>
                  <p className="text-xs text-muted-foreground">ST</p>
                </div>
                <div className="bg-chart-3/10 rounded-lg p-2">
                  <p className="text-lg font-semibold text-chart-3">{worker.dailyOT}</p>
                  <p className="text-xs text-muted-foreground">OT</p>
                </div>
                <div className="bg-destructive/10 rounded-lg p-2">
                  <p className="text-lg font-semibold text-destructive">{worker.dailyDT}</p>
                  <p className="text-xs text-muted-foreground">DT</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Daily Empty State */}
          {(!dailyTotals || dailyTotals.workers.filter(w => w.status !== "Absent").length === 0) && !isLoading && (
            <Card className="p-8 bg-card border-border text-center">
              <p className="text-muted-foreground">
                No timesheet entries for {selectedDay?.dayName || "this day"}. Add entries in the Timesheet tab.
              </p>
            </Card>
          )}

          {/* Save Changes Button */}
          <Button 
            className={`h-14 font-semibold text-base ${
              saveStatus === "saved" 
                ? "bg-chart-3 hover:bg-chart-3/90 text-primary-foreground" 
                : saveStatus === "error"
                ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
            }`}
            onClick={handleSaveFieldReport}
            disabled={isSavingReport}
          >
            {saveStatus === "saving" ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Saving...
              </>
            ) : saveStatus === "saved" ? (
              <>
                <Save className="h-5 w-5 mr-2" />
                Saved!
              </>
            ) : saveStatus === "error" ? (
              <>
                <AlertTriangle className="h-5 w-5 mr-2" />
                Error Saving
              </>
            ) : (
              <>
                <Save className="h-5 w-5 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </>
      )}

      {/* Refresh Button */}
      <Button 
        variant="outline"
        className="h-12 border-border text-foreground hover:bg-secondary font-medium"
        onClick={loadData}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Refreshing...
          </>
        ) : (
          <>
            <Download className="h-5 w-5 mr-2" />
            Refresh Report
          </>
        )}
      </Button>

      {/* Image Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-full max-h-full">
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-12 right-0 text-white hover:bg-white/20"
              onClick={() => setPreviewImage(null)}
            >
              <X className="h-6 w-6" />
            </Button>
            <img
              src={previewImage}
              alt="Full size preview"
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Delete Photo Confirmation Dialog */}
      <AlertDialog open={!!photoToDelete} onOpenChange={(open) => !open && setPhotoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Photo</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this photo? This action cannot be undone and will permanently remove the photo from this report.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeletePhoto}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
