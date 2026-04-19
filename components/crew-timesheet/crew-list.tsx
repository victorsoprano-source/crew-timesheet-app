"use client"

import { useState, useEffect, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Search, Phone, Award, User, Loader2, RefreshCw, Pencil, Trash2, X, Wrench, FileCheck, Camera, Images, Eye, Plus, Calendar } from "lucide-react"
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
import { getWorkers, getWorkerStats, updateWorkerStatus, updateWorker, deleteWorker, getWorkerCertifications, addWorkerCertification, updateWorkerCertification, deleteWorkerCertification, type Worker, type WorkerLevel, type WorkerCertification } from "@/app/actions/workers"

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
  
  // Edit photo state
  const [editPhotoPathname, setEditPhotoPathname] = useState<string | null>(null)
  const [editPhotoPreviewUrl, setEditPhotoPreviewUrl] = useState<string | null>(null)
  const [isUploadingEditPhoto, setIsUploadingEditPhoto] = useState(false)
  
  // Photo preview state
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; name: string } | null>(null)
  
  // Delete confirmation state
  const [workerToDelete, setWorkerToDelete] = useState<Worker | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // View Worker modal state
  const [viewingWorker, setViewingWorker] = useState<Worker | null>(null)
  const [viewWorkerCerts, setViewWorkerCerts] = useState<WorkerCertification[]>([])
  const [isLoadingViewCerts, setIsLoadingViewCerts] = useState(false)
  
  // Edit Worker certifications state
  const [editWorkerCerts, setEditWorkerCerts] = useState<WorkerCertification[]>([])
  const [isLoadingEditCerts, setIsLoadingEditCerts] = useState(false)
  const [showAddCertForm, setShowAddCertForm] = useState(false)
  const [newCertForm, setNewCertForm] = useState({
    certificationType: "",
    issueDate: "",
    expirationDate: "",
    photoPathname: "",
    photoPreviewUrl: "",
  })
  const [isUploadingCertPhoto, setIsUploadingCertPhoto] = useState(false)
  const [isSavingCert, setIsSavingCert] = useState(false)
  const [editingCertId, setEditingCertId] = useState<string | null>(null)
  const [certPhotoPreview, setCertPhotoPreview] = useState<string | null>(null)

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

  const getPhotoUrl = (pathname: string | null) => {
    if (!pathname) return null
    if (pathname.startsWith("http")) return pathname
    // Use the /api/file endpoint to retrieve Vercel Blob stored files
    return `/api/file?pathname=${encodeURIComponent(pathname)}`
  }

  const handleEditPhotoUpload = async (file: File) => {
    setIsUploadingEditPhoto(true)
    
    try {
      const formDataUpload = new FormData()
      formDataUpload.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formDataUpload,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      setEditPhotoPathname(result.pathname)
      setEditPhotoPreviewUrl(`/api/file?pathname=${encodeURIComponent(result.pathname)}`)
    } catch (err) {
      console.error("Edit photo upload error:", err)
    } finally {
      setIsUploadingEditPhoto(false)
    }
  }

  const handleEditPhotoSelect = (useCamera: boolean = false) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (useCamera) {
      input.capture = 'environment'
    }
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        handleEditPhotoUpload(file)
      }
    }
    input.click()
  }

  const removeEditPhoto = () => {
    setEditPhotoPathname(null)
    setEditPhotoPreviewUrl(null)
  }

  // View Worker modal functions
  const openViewModal = async (worker: Worker) => {
    setViewingWorker(worker)
    setIsLoadingViewCerts(true)
    try {
      const certs = await getWorkerCertifications(worker.id)
      setViewWorkerCerts(certs)
    } catch (err) {
      console.error("Error loading certifications:", err)
      setViewWorkerCerts([])
    }
    setIsLoadingViewCerts(false)
  }

  const closeViewModal = () => {
    setViewingWorker(null)
    setViewWorkerCerts([])
  }

  // Certification photo upload handlers
  const handleCertPhotoUpload = async (file: File) => {
    setIsUploadingCertPhoto(true)
    
    try {
      const formDataUpload = new FormData()
      formDataUpload.append('file', file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formDataUpload,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      setNewCertForm(prev => ({
        ...prev,
        photoPathname: result.pathname,
        photoPreviewUrl: `/api/file?pathname=${encodeURIComponent(result.pathname)}`,
      }))
    } catch (err) {
      console.error("Cert photo upload error:", err)
    } finally {
      setIsUploadingCertPhoto(false)
    }
  }

  const handleCertPhotoSelect = (useCamera: boolean = false) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (useCamera) {
      input.capture = 'environment'
    }
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        handleCertPhotoUpload(file)
      }
    }
    input.click()
  }

  const removeCertPhoto = () => {
    setNewCertForm(prev => ({
      ...prev,
      photoPathname: "",
      photoPreviewUrl: "",
    }))
  }

  // Add certification handler
  const handleAddCertification = async () => {
    if (!editingWorker || !newCertForm.certificationType || !newCertForm.expirationDate) return
    
    setIsSavingCert(true)
    try {
      const result = await addWorkerCertification({
        workerId: editingWorker.id,
        certificationType: newCertForm.certificationType,
        photoPathname: newCertForm.photoPathname || undefined,
        issueDate: newCertForm.issueDate || new Date().toISOString().split('T')[0],
        expirationDate: newCertForm.expirationDate,
      })
      
      if (result.success) {
        // Refresh certifications list
        const certs = await getWorkerCertifications(editingWorker.id)
        setEditWorkerCerts(certs)
        // Reset form
        setNewCertForm({
          certificationType: "",
          issueDate: "",
          expirationDate: "",
          photoPathname: "",
          photoPreviewUrl: "",
        })
        setShowAddCertForm(false)
      }
    } catch (err) {
      console.error("Error adding certification:", err)
    } finally {
      setIsSavingCert(false)
    }
  }

  // Delete certification handler
  const handleDeleteCertification = async (certId: string) => {
    if (!editingWorker) return
    
    try {
      const result = await deleteWorkerCertification(certId)
      if (result.success) {
        const certs = await getWorkerCertifications(editingWorker.id)
        setEditWorkerCerts(certs)
      }
    } catch (err) {
      console.error("Error deleting certification:", err)
    }
  }

  const handleStatusChange = (workerId: string, newStatus: Worker["status"]) => {
    startTransition(async () => {
      await updateWorkerStatus(workerId, newStatus)
      loadData()
    })
  }

  const openEditModal = async (worker: Worker) => {
    setEditingWorker(worker)
    setEditFormData({
      name: worker.name,
      trade: worker.trade,
      phone: worker.phone || "",
      level: worker.level || "Journeyman",
      certifications: worker.certifications || [],
      status: worker.status,
    })
    // Initialize photo state from worker
    setEditPhotoPathname(worker.photo_pathname || null)
    if (worker.photo_pathname) {
      setEditPhotoPreviewUrl(`/api/file?pathname=${encodeURIComponent(worker.photo_pathname)}`)
    } else {
      setEditPhotoPreviewUrl(null)
    }
    // Load certifications
    setIsLoadingEditCerts(true)
    try {
      const certs = await getWorkerCertifications(worker.id)
      setEditWorkerCerts(certs)
    } catch (err) {
      console.error("Error loading certifications:", err)
      setEditWorkerCerts([])
    }
    setIsLoadingEditCerts(false)
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
    setEditPhotoPathname(null)
    setEditPhotoPreviewUrl(null)
    setEditWorkerCerts([])
    setShowAddCertForm(false)
    setNewCertForm({
      certificationType: "",
      issueDate: "",
      expirationDate: "",
      photoPathname: "",
      photoPreviewUrl: "",
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
    const result = await updateWorker(editingWorker.id, {
      ...editFormData,
      photo_pathname: editPhotoPathname,
    })
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
                {worker.photo_pathname ? (
                  <button
                    type="button"
                    onClick={() => setPreviewPhoto({ url: getPhotoUrl(worker.photo_pathname)!, name: worker.name })}
                    className="relative h-10 w-10 rounded-full overflow-hidden ring-2 ring-primary/30 hover:ring-primary/60 transition-all cursor-pointer flex-shrink-0"
                  >
                    <img
                      src={getPhotoUrl(worker.photo_pathname)!}
                      alt={worker.name}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        // Hide the broken image and show fallback
                        const target = e.currentTarget
                        target.style.display = 'none'
                        const fallback = target.nextElementSibling as HTMLElement
                        if (fallback) fallback.style.display = 'flex'
                      }}
                    />
                    {/* Fallback icon - hidden by default, shown on image error */}
                    <div 
                      className="absolute inset-0 items-center justify-center bg-primary/20 hidden"
                      style={{ display: 'none' }}
                    >
                      <User className="h-5 w-5 text-primary" />
                    </div>
                  </button>
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 flex-shrink-0">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                )}
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

            {/* View/Edit/Delete Actions */}
            <div className="flex gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-border"
                onClick={() => openViewModal(worker)}
              >
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-border"
                onClick={() => openEditModal(worker)}
              >
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-border text-destructive hover:bg-destructive/10"
                onClick={() => setWorkerToDelete(worker)}
              >
                <Trash2 className="h-4 w-4 mr-1" />
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
              {/* Profile Photo Section */}
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  Profile Photo
                </Label>
                
                <div className="flex items-center gap-4">
                  {/* Photo Preview */}
                  <div className="relative">
                    {editPhotoPreviewUrl ? (
                      <div className="h-20 w-20 rounded-full overflow-hidden ring-2 ring-primary/30">
                        <img
                          src={editPhotoPreviewUrl}
                          alt="Profile preview"
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    {isUploadingEditPhoto && (
                      <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-full">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    )}
                  </div>

                  {/* Photo Action Buttons */}
                  <div className="flex flex-col gap-2 flex-1">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditPhotoSelect(true)}
                        disabled={isSaving || isUploadingEditPhoto}
                        className="flex-1 border-border text-foreground hover:bg-secondary"
                      >
                        <Camera className="h-4 w-4 mr-1" />
                        Camera
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditPhotoSelect(false)}
                        disabled={isSaving || isUploadingEditPhoto}
                        className="flex-1 border-border text-foreground hover:bg-secondary"
                      >
                        <Images className="h-4 w-4 mr-1" />
                        Gallery
                      </Button>
                    </div>
                    {editPhotoPathname && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={removeEditPhoto}
                        disabled={isSaving || isUploadingEditPhoto}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        Remove Photo
                      </Button>
                    )}
                  </div>
                </div>
              </div>

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

              {/* Quick Certifications Checkboxes */}
              <div className="flex flex-col gap-3">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <Award className="h-4 w-4 text-muted-foreground" />
                  Quick Certifications
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

              {/* Documented Certifications with Photos */}
              <div className="flex flex-col gap-3 pt-3 border-t border-border">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-muted-foreground" />
                    Documented Certifications
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowAddCertForm(true)}
                    disabled={isSaving || showAddCertForm}
                    className="border-border"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>

                {/* Loading State */}
                {isLoadingEditCerts && (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}

                {/* Existing Certifications List */}
                {!isLoadingEditCerts && editWorkerCerts.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {editWorkerCerts.map((cert) => (
                      <div key={cert.id} className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
                        {cert.photo_pathname ? (
                          <button
                            type="button"
                            onClick={() => setCertPhotoPreview(`/api/file?pathname=${encodeURIComponent(cert.photo_pathname!)}`)}
                            className="h-12 w-12 rounded-lg overflow-hidden ring-1 ring-border hover:ring-primary/50 transition-all flex-shrink-0"
                          >
                            <img
                              src={`/api/file?pathname=${encodeURIComponent(cert.photo_pathname)}`}
                              alt={cert.certification_type}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            <FileCheck className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{cert.certification_type}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Expires: {new Date(cert.expiration_date).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteCertification(cert.id)}
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {!isLoadingEditCerts && editWorkerCerts.length === 0 && !showAddCertForm && (
                  <p className="text-sm text-muted-foreground text-center py-2">No documented certifications</p>
                )}

                {/* Add Certification Form */}
                {showAddCertForm && (
                  <div className="flex flex-col gap-3 p-3 bg-secondary/30 rounded-lg">
                    <div className="flex flex-col gap-2">
                      <Label className="text-xs text-muted-foreground">Certification Type</Label>
                      <Select 
                        value={newCertForm.certificationType} 
                        onValueChange={(v) => setNewCertForm(prev => ({ ...prev, certificationType: v }))}
                        disabled={isSavingCert}
                      >
                        <SelectTrigger className="bg-input border-border text-foreground h-10">
                          <SelectValue placeholder="Select certification" />
                        </SelectTrigger>
                        <SelectContent className="bg-popover border-border">
                          {certifications.map((cert) => (
                            <SelectItem key={cert} value={cert}>{cert}</SelectItem>
                          ))}
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Issue Date</Label>
                        <Input
                          type="date"
                          value={newCertForm.issueDate}
                          onChange={(e) => setNewCertForm(prev => ({ ...prev, issueDate: e.target.value }))}
                          className="bg-input border-border text-foreground h-10"
                          disabled={isSavingCert}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs text-muted-foreground">Expiration Date</Label>
                        <Input
                          type="date"
                          value={newCertForm.expirationDate}
                          onChange={(e) => setNewCertForm(prev => ({ ...prev, expirationDate: e.target.value }))}
                          className="bg-input border-border text-foreground h-10"
                          disabled={isSavingCert}
                        />
                      </div>
                    </div>

                    {/* Certificate Photo */}
                    <div className="flex flex-col gap-2">
                      <Label className="text-xs text-muted-foreground">Certificate Photo (Optional)</Label>
                      <div className="flex items-center gap-3">
                        {newCertForm.photoPreviewUrl ? (
                          <div className="relative h-16 w-16 rounded-lg overflow-hidden ring-1 ring-border">
                            <img
                              src={newCertForm.photoPreviewUrl}
                              alt="Certificate"
                              className="h-full w-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={removeCertPhoto}
                              className="absolute top-0 right-0 p-1 bg-destructive text-destructive-foreground rounded-bl-lg"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleCertPhotoSelect(true)}
                              disabled={isSavingCert || isUploadingCertPhoto}
                              className="border-border"
                            >
                              {isUploadingCertPhoto ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Camera className="h-4 w-4 mr-1" />
                                  Camera
                                </>
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleCertPhotoSelect(false)}
                              disabled={isSavingCert || isUploadingCertPhoto}
                              className="border-border"
                            >
                              <Images className="h-4 w-4 mr-1" />
                              Gallery
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddCertForm(false)
                          setNewCertForm({
                            certificationType: "",
                            issueDate: "",
                            expirationDate: "",
                            photoPathname: "",
                            photoPreviewUrl: "",
                          })
                        }}
                        disabled={isSavingCert}
                        className="flex-1 border-border"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleAddCertification}
                        disabled={!newCertForm.certificationType || !newCertForm.expirationDate || isSavingCert}
                        className="flex-1 bg-primary text-primary-foreground"
                      >
                        {isSavingCert ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Add Certification"
                        )}
                      </Button>
                    </div>
                  </div>
                )}
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

      {/* View Worker Modal (Read-Only) */}
      {viewingWorker && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Worker Profile</h2>
              <Button variant="ghost" size="icon" onClick={closeViewModal}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            
            <div className="p-4 flex flex-col gap-4">
              {/* Profile Header */}
              <div className="flex flex-col items-center gap-3 pb-4 border-b border-border">
                {viewingWorker.photo_pathname ? (
                  <div className="h-24 w-24 rounded-full overflow-hidden ring-2 ring-primary/30">
                    <img
                      src={getPhotoUrl(viewingWorker.photo_pathname)!}
                      alt={viewingWorker.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-24 w-24 rounded-full bg-primary/20 flex items-center justify-center">
                    <User className="h-10 w-10 text-primary" />
                  </div>
                )}
                <div className="text-center">
                  <h3 className="text-xl font-semibold text-foreground">{viewingWorker.name}</h3>
                  <p className="text-sm text-muted-foreground">{viewingWorker.trade} • {viewingWorker.level || "Journeyman"}</p>
                </div>
                <Badge 
                  variant="outline" 
                  className={getStatusColor(viewingWorker.status)}
                >
                  {getStatusLabel(viewingWorker.status)}
                </Badge>
              </div>

              {/* Contact Info */}
              {viewingWorker.phone && (
                <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium text-foreground">{viewingWorker.phone}</p>
                  </div>
                </div>
              )}

              {/* Quick Certifications */}
              {viewingWorker.certifications && viewingWorker.certifications.length > 0 && (
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Award className="h-4 w-4 text-muted-foreground" />
                    Certifications
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {viewingWorker.certifications.map((cert) => (
                      <Badge key={cert} variant="secondary" className="bg-secondary text-secondary-foreground">
                        {cert}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Documented Certifications */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-muted-foreground" />
                  Documented Certifications
                </Label>
                
                {isLoadingViewCerts ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : viewWorkerCerts.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    {viewWorkerCerts.map((cert) => (
                      <div key={cert.id} className="flex items-center gap-3 p-3 bg-secondary/30 rounded-lg">
                        {cert.photo_pathname ? (
                          <button
                            type="button"
                            onClick={() => setCertPhotoPreview(`/api/file?pathname=${encodeURIComponent(cert.photo_pathname!)}`)}
                            className="h-12 w-12 rounded-lg overflow-hidden ring-1 ring-border hover:ring-primary/50 transition-all flex-shrink-0"
                          >
                            <img
                              src={`/api/file?pathname=${encodeURIComponent(cert.photo_pathname)}`}
                              alt={cert.certification_type}
                              className="h-full w-full object-cover"
                            />
                          </button>
                        ) : (
                          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                            <FileCheck className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{cert.certification_type}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Expires: {new Date(cert.expiration_date).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-2">No documented certifications</p>
                )}
              </div>
            </div>

            <div className="flex gap-3 p-4 border-t border-border">
              <Button
                variant="outline"
                className="flex-1 border-border"
                onClick={closeViewModal}
              >
                Close
              </Button>
              <Button
                className="flex-1 bg-primary text-primary-foreground"
                onClick={() => {
                  closeViewModal()
                  openEditModal(viewingWorker)
                }}
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit Worker
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cert Photo Preview Modal */}
      {certPhotoPreview && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setCertPhotoPreview(null)}
        >
          <div className="relative max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setCertPhotoPreview(null)}
              className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="bg-card rounded-xl overflow-hidden border border-border shadow-2xl">
              <img
                src={certPhotoPreview}
                alt="Certificate"
                className="w-full h-auto"
              />
            </div>
          </div>
        </div>
      )}

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="relative max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute -top-12 right-0 p-2 text-white/80 hover:text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
            <div className="bg-card rounded-xl overflow-hidden border border-border shadow-2xl">
              <div className="aspect-square relative">
                <img
                  src={previewPhoto.url}
                  alt={previewPhoto.name}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-4 text-center">
                <p className="font-medium text-foreground">{previewPhoto.name}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
