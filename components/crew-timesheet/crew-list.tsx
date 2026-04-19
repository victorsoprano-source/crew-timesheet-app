"use client"

import { useState, useEffect, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Search, Phone, Award, User, Loader2, RefreshCw, Pencil, Trash2, X, Wrench, FileCheck } from "lucide-react"
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
import { getWorkers, getWorkerStats, updateWorkerStatus, updateWorker, deleteWorker, type Worker, type WorkerLevel } from "@/app/actions/workers"

const trades = ["Electrician", "Plumber", "Carpenter", "Mason", "Welder", "Laborer", "Foreman", "Heavy Equipment Operator", "HVAC Technician", "Painter"]

const workerLevels: WorkerLevel[] = ["Journeyman", "Apprentice Year 1", "Apprentice Year 2", "Apprentice Year 3"]

const certifications = [
  "OSHA 10",
  "OSHA 30",
  "First Aid/CPR",
  "Forklift Certified",
  "Crane Operator",
  "Confined Space",
  "Fall Protection",
  "Scaffold Certified",
]

interface CrewListProps {
  onNavigate?: (screen: string) => void
}

export function CrewList({ onNavigate }: CrewListProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [workers, setWorkers] = useState<Worker[]>([])
  const [stats, setStats] = useState({ active: 0, offSite: 0, onLeave: 0 })
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  
  // Edit modal state
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null)
  const [editFormData, setEditFormData] = useState({
    name: "",
    trade: "",
    phone: "",
    level: "Journeyman" as Worker["level"],
    certifications: [] as string[],
    status: "active" as Worker["status"],
  })
  const [isSaving, setIsSaving] = useState(false)
  
  // Delete confirmation state
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadData = async () => {
    setIsLoading(true)
    const [workersData, statsData] = await Promise.all([
      getWorkers(),
      getWorkerStats(),
    ])
    setWorkers(workersData)
    setStats(statsData)
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const filteredWorkers = workers.filter(
    (worker) =>
      worker.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      worker.trade.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const getStatusColor = (status: Worker["status"]) => {
    switch (status) {
      case "active":
        return "bg-accent/20 text-accent border-accent/30"
      case "off-site":
        return "bg-chart-3/20 text-chart-3 border-chart-3/30"
      case "on-leave":
        return "bg-muted text-muted-foreground border-border"
      default:
        return "bg-muted text-muted-foreground border-border"
    }
  }

  const getStatusLabel = (status: Worker["status"]) => {
    switch (status) {
      case "active":
        return "Active"
      case "off-site":
        return "Off-site"
      case "on-leave":
        return "On Leave"
      default:
        return status
    }
  }

  const handleStatusChange = (workerId: string, newStatus: Worker["status"]) => {
    startTransition(async () => {
      await updateWorkerStatus(workerId, newStatus)
      loadData()
    })
  }

  const openEditModal = (worker: Worker) => {
    setEditingWorker(worker)
    setEditFormData({
      name: worker.name,
      trade: worker.trade,
      phone: worker.phone || "",
      level: worker.level || "Journeyman",
      certifications: worker.certifications || [],
      status: worker.status,
    })
  }

  const closeEditModal = () => {
    setEditingWorker(null)
    setEditFormData({
      name: "",
      trade: "",
      phone: "",
      level: "Journeyman",
      certifications: [],
      status: "active",
    })
  }

  const toggleEditCertification = (cert: string) => {
    setEditFormData((prev) => ({
      ...prev,
      certifications: prev.certifications.includes(cert)
        ? prev.certifications.filter((c) => c !== cert)
        : [...prev.certifications, cert],
    }))
  }

  const handleSaveEdit = async () => {
    if (!editingWorker) return
    
    setIsSaving(true)
    const result = await updateWorker(editingWorker.id, editFormData)
    setIsSaving(false)
    
    if (result.success) {
      closeEditModal()
      loadData()
    }
  }

  const handleDeleteWorker = async () => {
    if (!workerToDelete) return
    
    setIsDeleting(true)
    const result = await deleteWorker(workerToDelete.id)
    setIsDeleting(false)
    
    if (result.success) {
      setWorkerToDelete(null)
      loadData()
    }
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
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search by name or trade..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-12 bg-card border-border text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 border-border"
          onClick={() => loadData()}
          disabled={isPending}
        >
          <RefreshCw className={`h-5 w-5 ${isPending ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Stats */}
      <div className="flex gap-3">
        <Card className="flex-1 p-3 bg-card border-border text-center">
          <p className="text-2xl font-bold text-foreground">{stats.active}</p>
          <p className="text-xs text-muted-foreground">Active</p>
        </Card>
        <Card className="flex-1 p-3 bg-card border-border text-center">
          <p className="text-2xl font-bold text-foreground">{stats.offSite}</p>
          <p className="text-xs text-muted-foreground">Off-site</p>
        </Card>
        <Card className="flex-1 p-3 bg-card border-border text-center">
          <p className="text-2xl font-bold text-foreground">{stats.onLeave}</p>
          <p className="text-xs text-muted-foreground">On Leave</p>
        </Card>
      </div>

      {/* Certifications Link */}
      {onNavigate && (
        <Button
          variant="outline"
          className="w-full h-12 border-border justify-start"
          onClick={() => onNavigate("certifications")}
        >
          <FileCheck className="h-5 w-5 mr-3 text-primary" />
          <div className="text-left">
            <p className="font-medium text-foreground">Manage Certifications</p>
            <p className="text-xs text-muted-foreground">Track expiration dates and upload documents</p>
          </div>
        </Button>
      )}

      {/* Worker List */}
      <div className="flex flex-col gap-3">
        {filteredWorkers.map((worker) => (
          <Card key={worker.id} className="p-4 bg-card border-border">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">{worker.name}</h3>
                  <p className="text-sm text-muted-foreground">{worker.trade} • {worker.level || "Journeyman"}</p>
                </div>
              </div>
              <Badge 
                variant="outline" 
                className={`cursor-pointer ${getStatusColor(worker.status)}`}
                onClick={() => {
                  const statuses: Worker["status"][] = ["active", "off-site", "on-leave"]
                  const currentIndex = statuses.indexOf(worker.status)
                  const nextStatus = statuses[(currentIndex + 1) % statuses.length]
                  handleStatusChange(worker.id, nextStatus)
                }}
              >
                {getStatusLabel(worker.status)}
              </Badge>
            </div>

            {worker.phone && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <Phone className="h-4 w-4" />
                <span>{worker.phone}</span>
              </div>
            )}

            {worker.certifications && worker.certifications.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mb-3">
                <Award className="h-4 w-4 text-muted-foreground" />
                {worker.certifications.map((cert) => (
                  <Badge key={cert} variant="secondary" className="bg-secondary text-secondary-foreground text-xs">
                    {cert}
                  </Badge>
                ))}
              </div>
            )}

            {/* Edit/Delete Actions */}
            <div className="flex gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-border"
                onClick={() => openEditModal(worker)}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-border text-destructive hover:bg-destructive/10"
                onClick={() => setWorkerToDelete(worker)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {filteredWorkers.length === 0 && !isLoading && (
        <Card className="p-8 bg-card border-border text-center">
          <p className="text-muted-foreground">
            {workers.length === 0 
              ? "No workers found. Add your first worker to get started."
              : "No workers found matching your search."
            }
          </p>
        </Card>
      )}

      {/* Edit Worker Modal */}
      {editingWorker && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Edit Worker</h2>
              <Button variant="ghost" size="icon" onClick={closeEditModal}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="p-4 flex flex-col gap-4">
              {/* Name Field */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Full Name
                </Label>
                <Input
                  placeholder="Enter worker name"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  className="bg-input border-border text-foreground h-11"
                  disabled={isSaving}
                />
              </div>

              {/* Trade Field */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  Trade / Role
                </Label>
                <Select 
                  value={editFormData.trade} 
                  onValueChange={(v) => setEditFormData({ ...editFormData, trade: v })}
                  disabled={isSaving}
                >
                  <SelectTrigger className="bg-input border-border text-foreground h-11">
                    <SelectValue placeholder="Select trade" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {trades.map((trade) => (
                      <SelectItem key={trade} value={trade}>{trade}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Level Field */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Award className="h-4 w-4 text-muted-foreground" />
                  Classification
                </Label>
                <Select 
                  value={editFormData.level} 
                  onValueChange={(v) => setEditFormData({ ...editFormData, level: v as WorkerLevel })}
                  disabled={isSaving}
                >
                  <SelectTrigger className="bg-input border-border text-foreground h-11">
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {workerLevels.map((level) => (
                      <SelectItem key={level} value={level}>{level}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Phone Field */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Phone Number
                </Label>
                <Input
                  placeholder="(555) 123-4567"
                  type="tel"
                  value={editFormData.phone}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  className="bg-input border-border text-foreground h-11"
                  disabled={isSaving}
                />
              </div>

              {/* Status Field */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium text-foreground">Status</Label>
                <Select 
                  value={editFormData.status} 
                  onValueChange={(v) => setEditFormData({ ...editFormData, status: v as Worker["status"] })}
                  disabled={isSaving}
                >
                  <SelectTrigger className="bg-input border-border text-foreground h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="off-site">Off-site</SelectItem>
                    <SelectItem value="on-leave">On Leave</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Certifications */}
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Award className="h-4 w-4 text-muted-foreground" />
                  Certifications
                </Label>
                <div className="grid grid-cols-2 gap-2">
                  {certifications.map((cert) => (
                    <div
                      key={cert}
                      className="flex items-center gap-2 rounded-lg bg-secondary/50 p-2 cursor-pointer hover:bg-secondary transition-colors"
                      onClick={() => !isSaving && toggleEditCertification(cert)}
                    >
                      <Checkbox
                        checked={editFormData.certifications.includes(cert)}
                        onCheckedChange={() => toggleEditCertification(cert)}
                        className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                        disabled={isSaving}
                      />
                      <span className="text-xs text-foreground">{cert}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-4 border-t border-border">
              <Button
                variant="outline"
                className="flex-1 border-border"
                onClick={closeEditModal}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground"
                onClick={handleSaveEdit}
                disabled={!editFormData.name || !editFormData.trade || isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!workerToDelete} onOpenChange={(open) => !open && setWorkerToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Worker</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{workerToDelete?.name}</strong>? 
              This action cannot be undone. Previous timesheets referencing this worker will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteWorker}
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
