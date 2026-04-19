"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeft, ChevronRight, Save, Plus, Trash2, Loader2, CheckCircle, Camera, X, ImageIcon } from "lucide-react"
import { getWorkers, type Worker } from "@/app/actions/workers"
import { 
  getOrCreateTimesheet, 
  getTimesheetEntriesForDay, 
  saveDailyTimesheet,
  type Timesheet as TimesheetType 
} from "@/app/actions/timesheets"

// Local utility function for week days (can't be in server actions file)
function getWeekDays(weekStart: string): { date: string; dayName: string; dayNum: number; isWeekend: boolean }[] {
  const days = []
  const startDate = new Date(weekStart + "T00:00:00")
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate)
    d.setDate(d.getDate() + i)
    const dayOfWeek = d.getDay()
    days.push({
      date: d.toISOString().split("T")[0],
      dayName: dayNames[dayOfWeek],
      dayNum: d.getDate(),
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6
    })
  }
  
  return days
}

// Mock worker for fallback testing when database is empty
const MOCK_WORKER = {
  id: "mock-worker-1",
  name: "Sample Worker",
  trade: "Laborer",
  phone: "",
  status: "active" as const,
  certifications: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

interface TimesheetEntry {
  id: string
  worker_id: string
  name: string
  trade: string
  regular: string
  overtime: string
  doubleTime: string
  status: "Present" | "Absent" | "Late"
  jobCode: string
  photoRefId: string
  notes: string
}

const trades = ["Electrician", "Plumber", "Carpenter", "Mason", "Welder", "Laborer", "Foreman", "Operator", "HVAC Technician", "Painter", "Heavy Equipment Operator"]
const statuses: ("Present" | "Absent" | "Late")[] = ["Present", "Absent", "Late"]

export function Timesheet() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDayIndex, setSelectedDayIndex] = useState(0)
  const [entries, setEntries] = useState<TimesheetEntry[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [currentTimesheet, setCurrentTimesheet] = useState<TimesheetType | null>(null)
  const [weekDays, setWeekDays] = useState<{ date: string; dayName: string; dayNum: number; isWeekend: boolean }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadingEntryId, setUploadingEntryId] = useState<string | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

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

  const weekStart = getWeekStart(weekOffset)
  const weekStartStr = weekStart.toISOString().split("T")[0]

  // Get selected day info
  const selectedDay = weekDays[selectedDayIndex]
  const isWeekend = selectedDay?.isWeekend || false

  const loadWeekData = async () => {
    setIsLoading(true)
    setError(null)

    // Always generate week days first using local date
    const weekStartStr = weekStart.toISOString().split("T")[0]
    const days = getWeekDays(weekStartStr)
    setWeekDays(days)

    try {
      // Load workers - fallback to mock if empty or error
      let workersData = await getWorkers()
      if (!workersData || workersData.length === 0) {
        workersData = [MOCK_WORKER]
      }
      setWorkers(workersData)

      // Get or create timesheet for this week
      const timesheet = await getOrCreateTimesheet(weekStart)
      setCurrentTimesheet(timesheet)
    } catch (err) {
      // Don't show blocking error - just use fallback data
      console.error("Error loading data:", err)
      setWorkers([MOCK_WORKER])
      setCurrentTimesheet(null)
    }

    setIsLoading(false)
  }

  const loadDayEntries = async () => {
    if (!selectedDay) {
      setEntries([])
      return
    }

    // If no timesheet (database unavailable), just show empty entries
    if (!currentTimesheet) {
      setEntries([])
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const dayEntries = await getTimesheetEntriesForDay(currentTimesheet.id, selectedDay.date)
      
      if (dayEntries.length > 0) {
        const mappedEntries: TimesheetEntry[] = dayEntries.map((e) => ({
          id: e.id,
          worker_id: e.worker_id,
          name: e.worker?.name || "",
          trade: e.worker?.trade || "",
          regular: String(e.regular_hours),
          overtime: String(e.overtime_hours),
          doubleTime: String(e.double_time_hours),
          status: e.attendance_status,
          jobCode: e.job_code || "",
          photoRefId: e.photo_ref_id || "",
          notes: e.notes || "",
        }))
        setEntries(mappedEntries)
      } else {
        setEntries([])
      }
    } catch (err) {
      // Don't show error - just show empty entries
      console.error("Error loading day entries:", err)
      setEntries([])
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadWeekData()
    setSelectedDayIndex(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset])

  useEffect(() => {
    if (currentTimesheet && selectedDay) {
      loadDayEntries()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTimesheet, selectedDayIndex])

  const updateEntry = (id: string, field: keyof TimesheetEntry, value: string) => {
    setEntries(entries.map(e => {
      if (e.id !== id) return e
      
      if (field === "worker_id") {
        const worker = workers.find(w => w.id === value)
        return {
          ...e,
          worker_id: value,
          name: worker?.name || "",
          trade: worker?.trade || "",
        }
      }
      
      // If status changes to Absent, auto-clear all hours
      if (field === "status" && value === "Absent") {
        return {
          ...e,
          status: "Absent" as const,
          regular: "0",
          overtime: "0",
          doubleTime: "0",
        }
      }
      
return { ...e, [field]: value }
    }))
  }

  const handlePhotoUpload = async (entryId: string, file: File) => {
    setUploadingEntryId(entryId)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      // Store the pathname in photoRefId
      setEntries(entries.map(e => 
        e.id === entryId ? { ...e, photoRefId: result.pathname } : e
      ))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo')
    } finally {
      setUploadingEntryId(null)
    }
  }

  // Mobile-friendly file select - omitting capture allows iOS/Android to show camera OR gallery
  const handleFileSelect = (entryId: string) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    // Don't set capture - this allows mobile devices to show both camera and gallery options
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        handlePhotoUpload(entryId, file)
      }
    }
    input.click()
  }

  const getPhotoUrl = (pathname: string) => {
    return `/api/file?pathname=${encodeURIComponent(pathname)}`
  }

  const addEntry = () => {
    const newEntry: TimesheetEntry = {
      id: `temp-${Date.now()}`,
      worker_id: "",
      name: "",
      trade: "",
      regular: "0",
      overtime: "0",
      doubleTime: "0",
      status: "Present",
      jobCode: "",
      photoRefId: "",
      notes: "",
    }
    setEntries([...entries, newEntry])
  }

  const removeEntry = (id: string) => {
    setEntries(entries.filter(e => e.id !== id))
  }

  const handleSave = async () => {
    if (!selectedDay) return

    // If no timesheet exists (database unavailable), show friendly message
    if (!currentTimesheet) {
      setError("Database unavailable. Please try again later or check your connection.")
      return
    }

    console.log("[v0] Save started for date:", selectedDay.date)
    setError(null)
    setSuccess(false)
    setIsSaving(true)

    const entriesToSave = entries
      .filter(e => e.worker_id)
      .map(e => ({
        worker_id: e.worker_id,
        attendance_status: e.status,
        regular_hours: parseFloat(e.regular) || 0,
        overtime_hours: parseFloat(e.overtime) || 0,
        double_time_hours: parseFloat(e.doubleTime) || 0,
        job_code: e.jobCode,
        photo_ref_id: e.photoRefId,
        notes: e.notes,
      }))

    console.log("[v0] Payload to save:", entriesToSave)

    try {
      const result = await saveDailyTimesheet(currentTimesheet.id, selectedDay.date, entriesToSave)
      
      console.log("[v0] Save result:", result)

      if (result.success) {
        console.log("[v0] Save success!")
        setSuccess(true)
        setTimeout(() => setSuccess(false), 3000)
        loadDayEntries()
      } else {
        console.log("[v0] Save error:", result.error)
        setError(result.error || "Failed to save timesheet")
      }
    } catch (err) {
      console.error("[v0] Save exception:", err)
      setError(err instanceof Error ? err.message : "Failed to save timesheet. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Present": return "bg-accent/20 text-accent"
      case "Absent": return "bg-destructive/20 text-destructive"
      case "Late": return "bg-chart-3/20 text-chart-3"
      default: return "bg-muted text-muted-foreground"
    }
  }

  const availableWorkers = workers.filter(w => 
    !entries.some(e => e.worker_id === w.id)
  )

  const formatWeekRange = () => {
    if (weekDays.length === 0) return ""
    const start = new Date(weekDays[0].date + "T00:00:00")
    const end = new Date(weekDays[6].date + "T00:00:00")
    return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
  }

  // Only show full-page loading on very first load
  if (isLoading && weekDays.length === 0 && workers.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
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

      {/* Day Selector */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {weekDays.map((day, index) => (
          <Button
            key={day.date}
            variant={selectedDayIndex === index ? "default" : "outline"}
            className={`flex-shrink-0 flex flex-col items-center py-2 px-3 h-auto min-w-[60px] ${
              selectedDayIndex === index 
                ? "bg-primary text-primary-foreground" 
                : day.isWeekend 
                  ? "border-chart-3/50 text-chart-3 hover:bg-chart-3/10" 
                  : "border-border text-foreground hover:bg-secondary"
            }`}
            onClick={() => setSelectedDayIndex(index)}
          >
            <span className="text-xs font-medium">{day.dayName}</span>
            <span className="text-lg font-bold">{day.dayNum}</span>
          </Button>
        ))}
      </div>

      {/* Weekend Notice */}
      {isWeekend && (
        <Card className="p-3 bg-chart-3/10 border-chart-3/30">
          <p className="text-sm text-chart-3 text-center">
            Weekend: Only OT and DT hours allowed (no regular hours)
          </p>
        </Card>
      )}

      {/* Success Message */}
      {success && (
        <Card className="flex items-center gap-3 p-4 bg-accent/10 border-accent/30">
          <CheckCircle className="h-5 w-5 text-accent" />
          <span className="text-sm text-accent">Timesheet saved successfully!</span>
        </Card>
      )}

      {/* Error Message - only shown for save errors, not load errors */}
      {error && (
        <Card className="flex items-center gap-3 p-4 bg-destructive/10 border-destructive/30">
          <span className="text-sm text-destructive">{error}</span>
          <Button 
            variant="ghost" 
            size="sm" 
            className="ml-auto text-destructive hover:bg-destructive/10"
            onClick={() => setError(null)}
          >
            Dismiss
          </Button>
        </Card>
      )}

      {/* Loading indicator for day entries */}
      {isLoading && weekDays.length > 0 && (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {/* Entries */}
      {!isLoading && (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <Card key={entry.id} className="p-4 bg-card border-border">
              <div className="flex items-start justify-between mb-3">
                <Select 
                  value={entry.worker_id} 
                  onValueChange={(v) => updateEntry(entry.id, "worker_id", v)}
                >
                  <SelectTrigger className="flex-1 bg-input border-border text-foreground h-9">
                    <SelectValue placeholder="Select Worker" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {entry.worker_id && workers.find(w => w.id === entry.worker_id) && (
                      <SelectItem value={entry.worker_id}>
                        {workers.find(w => w.id === entry.worker_id)?.name}
                      </SelectItem>
                    )}
                    {availableWorkers.map((worker) => (
                      <SelectItem key={worker.id} value={worker.id}>
                        {worker.name} - {worker.trade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-2 text-destructive hover:bg-destructive/10"
                  onClick={() => removeEntry(entry.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <Select value={entry.trade} onValueChange={(v) => updateEntry(entry.id, "trade", v)}>
                  <SelectTrigger className="bg-input border-border text-foreground h-9">
                    <SelectValue placeholder="Trade/Role" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {trades.map((trade) => (
                      <SelectItem key={trade} value={trade}>{trade}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={entry.status} onValueChange={(v) => updateEntry(entry.id, "status", v)}>
                  <SelectTrigger className={`h-9 border-0 ${getStatusColor(entry.status)}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {statuses.map((status) => (
                      <SelectItem key={status} value={status}>{status}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Hours - ST hidden on weekends, all disabled if Absent */}
              <div className={`grid gap-2 mb-3 ${isWeekend ? "grid-cols-2" : "grid-cols-3"}`}>
                {!isWeekend && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">ST</label>
                    <Input
                      type="number"
                      value={entry.status === "Absent" ? 0 : parseFloat(entry.regular) || 0}
                      onChange={(e) => updateEntry(entry.id, "regular", e.target.value)}
                      className={`bg-input border-border text-foreground text-center h-9 ${entry.status === "Absent" ? "opacity-50 cursor-not-allowed" : ""}`}
                      min="0"
                      step="0.5"
                      disabled={entry.status === "Absent"}
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">OT</label>
                  <Input
                    type="number"
                    value={entry.status === "Absent" ? 0 : parseFloat(entry.overtime) || 0}
                    onChange={(e) => updateEntry(entry.id, "overtime", e.target.value)}
                    className={`bg-input border-border text-foreground text-center h-9 ${entry.status === "Absent" ? "opacity-50 cursor-not-allowed" : ""}`}
                    min="0"
                    step="0.5"
                    disabled={entry.status === "Absent"}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">DT</label>
                  <Input
                    type="number"
                    value={entry.status === "Absent" ? 0 : parseFloat(entry.doubleTime) || 0}
                    onChange={(e) => updateEntry(entry.id, "doubleTime", e.target.value)}
                    className={`bg-input border-border text-foreground text-center h-9 ${entry.status === "Absent" ? "opacity-50 cursor-not-allowed" : ""}`}
                    min="0"
                    step="0.5"
                    disabled={entry.status === "Absent"}
                  />
                </div>
              </div>

              {/* Job Code and Photo */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Job Code</label>
                  <Input
                    placeholder="e.g., JOB-001"
                    value={entry.jobCode}
                    onChange={(e) => updateEntry(entry.id, "jobCode", e.target.value)}
                    className="bg-input border-border text-foreground placeholder:text-muted-foreground h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Photo</label>
                  <div className="flex items-center gap-2">
                    {entry.photoRefId ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setPreviewImage(getPhotoUrl(entry.photoRefId))}
                          className="relative w-9 h-9 rounded border border-border overflow-hidden hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={getPhotoUrl(entry.photoRefId)}
                            alt="Entry photo"
                            className="w-full h-full object-cover"
                          />
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:bg-destructive/10"
                          onClick={() => updateEntry(entry.id, "photoRefId", "")}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 flex-1 border-border text-foreground hover:bg-secondary"
                        onClick={() => handleFileSelect(entry.id)}
                        disabled={uploadingEntryId === entry.id}
                      >
                        {uploadingEntryId === entry.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Camera className="h-4 w-4 mr-2" />
                            Add Photo
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <Input
                placeholder="Notes (optional)"
                value={entry.notes}
                onChange={(e) => updateEntry(entry.id, "notes", e.target.value)}
                className="bg-input border-border text-foreground placeholder:text-muted-foreground h-9"
              />
            </Card>
          ))}

          {entries.length === 0 && (
            <Card className="p-8 bg-card border-border text-center">
              <p className="text-muted-foreground mb-4">No entries for {selectedDay?.dayName} yet.</p>
              <Button 
                variant="outline" 
                className="border-border text-foreground hover:bg-secondary"
                onClick={addEntry}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add First Entry
              </Button>
            </Card>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button 
          variant="outline" 
          className="flex-1 border-border text-foreground hover:bg-secondary" 
          onClick={addEntry}
          disabled={availableWorkers.length === 0}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Worker
        </Button>
        <Button 
          className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={handleSave}
          disabled={isSaving || entries.length === 0}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Day
            </>
          )}
        </Button>
      </div>

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
    </div>
  )
}
