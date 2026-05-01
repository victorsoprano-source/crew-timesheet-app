"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
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
import { 
  Award, 
  Plus, 
  Loader2, 
  Calendar, 
  AlertTriangle, 
  X, 
  Trash2, 
  Camera, 
  Images, 
  User,
  Clock,
  CheckCircle2,
  FileWarning
} from "lucide-react"
import { 
  getWorkers, 
  getWorkerCertifications, 
  getExpiringCertifications,
  addWorkerCertification, 
  deleteWorkerCertification,
  type Worker,
  type WorkerCertification
} from "@/app/actions/workers"
import {
  getCertificationNames,
  getCertificationShortLabel,
  getCertificationStatus,
  getStatusBadgeClass,
  getStatusLabel,
  type CertificationStatus
} from "@/lib/certification-types"

const certificationTypes = getCertificationNames()

export function Certifications() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [certifications, setCertifications] = useState<WorkerCertification[]>([])
  const [expiringCerts, setExpiringCerts] = useState<WorkerCertification[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedWorkerFilter, setSelectedWorkerFilter] = useState<string>("all")
  
  // Add form state
  const [formData, setFormData] = useState({
    workerId: "",
    certificationType: "",
    customType: "",
    issueDate: "",
    expirationDate: "",
  })
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  // Delete state
  const [certToDelete, setCertToDelete] = useState<WorkerCertification | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  
  // Preview state
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [workersData, certsData, expiringData] = await Promise.all([
        getWorkers(),
        getWorkerCertifications(),
        getExpiringCertifications(30),
      ])
      setWorkers(workersData)
      setCertifications(certsData)
      setExpiringCerts(expiringData)
    } catch (err) {
      console.error("Error loading certifications:", err)
    }
    setIsLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const getPhotoUrl = (pathname: string | null | undefined) => {
    if (!pathname) return null
    if (pathname.startsWith("http")) return pathname
    // Route through API which handles both Vercel Blob and Supabase Storage
    return `/api/file?pathname=${encodeURIComponent(pathname)}`
  }

  const handlePhotoSelect = (useCamera: boolean = false) => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*"
    if (useCamera) {
      input.capture = "environment"
    }
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        setPhotoFile(file)
        // Create preview
        const reader = new FileReader()
        reader.onload = (e) => {
          setPhotoPreview(e.target?.result as string)
        }
        reader.readAsDataURL(file)
      }
    }
    input.click()
  }

  const handleAddCertification = async () => {
    if (!formData.workerId || !formData.certificationType || !formData.issueDate || !formData.expirationDate) {
      return
    }

    setIsSaving(true)
    let photoPathname: string | undefined

    // Upload photo if selected
    if (photoFile) {
      setIsUploading(true)
      try {
        const uploadFormData = new FormData()
        uploadFormData.append("file", photoFile)

        const response = await fetch("/api/upload", {
          method: "POST",
          body: uploadFormData,
        })

        const result = await response.json()
        if (response.ok) {
          photoPathname = result.pathname
        }
      } catch (err) {
        console.error("Upload error:", err)
      }
      setIsUploading(false)
    }

    const certType = formData.certificationType === "Other" 
      ? formData.customType 
      : formData.certificationType

    const { success } = await addWorkerCertification({
      workerId: formData.workerId,
      certificationType: certType,
      photoPathname,
      issueDate: formData.issueDate,
      expirationDate: formData.expirationDate,
    })

    setIsSaving(false)

    if (success) {
      setShowAddModal(false)
      resetForm()
      loadData()
    }
  }

  const handleDeleteCertification = async () => {
    if (!certToDelete) return

    setIsDeleting(true)
    const { success } = await deleteWorkerCertification(certToDelete.id)
    setIsDeleting(false)

    if (success) {
      setCertToDelete(null)
      loadData()
    }
  }

  const resetForm = () => {
    setFormData({
      workerId: "",
      certificationType: "",
      customType: "",
      issueDate: "",
      expirationDate: "",
    })
    setPhotoFile(null)
    setPhotoPreview(null)
  }

  const getExpirationStatus = (expirationDate: string) => {
    const today = new Date()
    const expDate = new Date(expirationDate + "T00:00:00")
    const daysUntil = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntil < 0) {
      return { status: "expired", label: "Expired", color: "bg-destructive text-destructive-foreground" }
    } else if (daysUntil <= 30) {
      return { status: "expiring", label: `${daysUntil}d left`, color: "bg-chart-3 text-white" }
    } else {
      return { status: "valid", label: "Valid", color: "bg-accent text-white" }
    }
  }

  const filteredCertifications = selectedWorkerFilter === "all"
    ? certifications
    : certifications.filter(c => c.worker_id === selectedWorkerFilter)

  const expiredCount = certifications.filter(c => getExpirationStatus(c.expiration_date).status === "expired").length
  const expiringCount = expiringCerts.filter(c => getExpirationStatus(c.expiration_date).status === "expiring").length

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Loading certifications...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Certifications</h2>
        </div>
        <Button onClick={() => setShowAddModal(true)} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 bg-card border-border flex flex-col items-center">
          <CheckCircle2 className="h-5 w-5 text-accent mb-1" />
          <span className="text-xl font-bold text-foreground">{certifications.length}</span>
          <span className="text-xs text-muted-foreground">Total</span>
        </Card>
        <Card className="p-3 bg-card border-border flex flex-col items-center">
          <Clock className="h-5 w-5 text-chart-3 mb-1" />
          <span className="text-xl font-bold text-foreground">{expiringCount}</span>
          <span className="text-xs text-muted-foreground">Expiring</span>
        </Card>
        <Card className="p-3 bg-card border-border flex flex-col items-center">
          <FileWarning className="h-5 w-5 text-destructive mb-1" />
          <span className="text-xl font-bold text-foreground">{expiredCount}</span>
          <span className="text-xs text-muted-foreground">Expired</span>
        </Card>
      </div>

      {/* Expiring Soon Alert */}
      {expiringCerts.length > 0 && (
        <Card className="p-4 bg-chart-3/10 border-chart-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-5 w-5 text-chart-3" />
            <span className="font-medium text-foreground">Expiring Within 30 Days</span>
          </div>
          <div className="flex flex-col gap-2">
            {expiringCerts.slice(0, 3).map((cert) => (
              <div key={cert.id} className="flex items-center justify-between text-sm">
                <span className="text-foreground">{cert.worker_name} - {cert.certification_type}</span>
                <Badge className={getExpirationStatus(cert.expiration_date).color}>
                  {new Date(cert.expiration_date + "T00:00:00").toLocaleDateString()}
                </Badge>
              </div>
            ))}
            {expiringCerts.length > 3 && (
              <span className="text-xs text-muted-foreground">
                +{expiringCerts.length - 3} more
              </span>
            )}
          </div>
        </Card>
      )}

      {/* Filter */}
      <Select value={selectedWorkerFilter} onValueChange={setSelectedWorkerFilter}>
        <SelectTrigger className="bg-input border-border">
          <SelectValue placeholder="Filter by worker" />
        </SelectTrigger>
        <SelectContent className="bg-popover border-border">
          <SelectItem value="all">All Workers</SelectItem>
          {workers.map((worker) => (
            <SelectItem key={worker.id} value={worker.id}>{worker.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Certifications List */}
      {filteredCertifications.length === 0 ? (
        <Card className="p-8 bg-card border-border text-center">
          <Award className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No certifications found</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowAddModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Certification
          </Button>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredCertifications.map((cert) => {
            const expStatus = getExpirationStatus(cert.expiration_date)
            return (
              <Card key={cert.id} className="p-4 bg-card border-border">
                <div className="flex gap-3">
                  {/* Photo */}
                  {cert.photo_pathname ? (
                    <button
                      type="button"
                      onClick={() => setPreviewImage(getPhotoUrl(cert.photo_pathname!))}
                      className="shrink-0 w-16 h-16 rounded-lg overflow-hidden border border-border hover:opacity-90"
                    >
                      <img
                        src={getPhotoUrl(cert.photo_pathname)}
                        alt={cert.certification_type}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="shrink-0 w-16 h-16 rounded-lg bg-secondary flex items-center justify-center">
                      <Award className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium text-foreground truncate" title={cert.certification_type}>
                          {getCertificationShortLabel(cert.certification_type)}
                        </h3>
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {cert.worker_name}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded border ${getStatusBadgeClass(getCertificationStatus(cert.expiration_date))}`}>
                        {getStatusLabel(getCertificationStatus(cert.expiration_date))}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Issued: {new Date(cert.issue_date + "T00:00:00").toLocaleDateString()}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Expires: {new Date(cert.expiration_date + "T00:00:00").toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Delete */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-destructive hover:bg-destructive/10"
                    onClick={() => setCertToDelete(cert)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Add Certification</h2>
              <Button variant="ghost" size="icon" onClick={() => { setShowAddModal(false); resetForm(); }}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="p-4 flex flex-col gap-4">
              {/* Worker Select */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium text-foreground">Worker</Label>
                <Select 
                  value={formData.workerId} 
                  onValueChange={(v) => setFormData({ ...formData, workerId: v })}
                >
                  <SelectTrigger className="bg-input border-border h-11">
                    <SelectValue placeholder="Select worker" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {workers.map((worker) => (
                      <SelectItem key={worker.id} value={worker.id}>{worker.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Certification Type */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium text-foreground">Certification Type</Label>
                <Select 
                  value={formData.certificationType} 
                  onValueChange={(v) => setFormData({ ...formData, certificationType: v })}
                >
                  <SelectTrigger className="bg-input border-border h-11">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {certificationTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Type */}
              {formData.certificationType === "Other" && (
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-foreground">Custom Type</Label>
                  <Input
                    value={formData.customType}
                    onChange={(e) => setFormData({ ...formData, customType: e.target.value })}
                    placeholder="Enter certification name"
                    className="bg-input border-border h-11"
                  />
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-foreground">Issue Date</Label>
                  <Input
                    type="date"
                    value={formData.issueDate}
                    onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                    className="bg-input border-border h-11"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-sm font-medium text-foreground">Expiration</Label>
                  <Input
                    type="date"
                    value={formData.expirationDate}
                    onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                    className="bg-input border-border h-11"
                  />
                </div>
              </div>

              {/* Photo Upload */}
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium text-foreground">Certificate Photo (Optional)</Label>
                {photoPreview ? (
                  <div className="relative">
                    <img
                      src={photoPreview}
                      alt="Preview"
                      className="w-full h-40 object-cover rounded-lg border border-border"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-7 w-7"
                      onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 border-border"
                      onClick={() => handlePhotoSelect(true)}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Camera
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-border"
                      onClick={() => handlePhotoSelect(false)}
                    >
                      <Images className="h-4 w-4 mr-2" />
                      Gallery
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 p-4 border-t border-border">
              <Button
                variant="outline"
                className="flex-1 border-border"
                onClick={() => { setShowAddModal(false); resetForm(); }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleAddCertification}
                disabled={!formData.workerId || !formData.certificationType || !formData.issueDate || !formData.expirationDate || isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isUploading ? "Uploading..." : "Saving..."}
                  </>
                ) : (
                  "Add Certification"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

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

      {/* Delete Confirmation */}
      <AlertDialog open={!!certToDelete} onOpenChange={(open) => !open && setCertToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Certification</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the <strong>{certToDelete?.certification_type}</strong> certification 
              for <strong>{certToDelete?.worker_name}</strong>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCertification}
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
