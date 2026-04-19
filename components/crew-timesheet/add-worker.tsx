"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { UserPlus, User, Wrench, Phone, Award, Loader2, CheckCircle, Plus, Camera, Images, Trash2, Calendar, X, FileCheck } from "lucide-react"
import { createWorker, type CertificationInput } from "@/app/actions/workers"

const trades = ["Electrician", "Plumber", "Carpenter", "Mason", "Welder", "Laborer", "Foreman", "Heavy Equipment Operator", "HVAC Technician", "Painter"]

const certificationTypes = [
  "OSHA 10",
  "OSHA 30",
  "First Aid/CPR",
  "Forklift Certified",
  "Crane Operator",
  "Confined Space",
  "Fall Protection",
  "Scaffold Certified",
  "CDL License",
  "Electrical License",
  "Plumbing License",
  "Other",
]

interface PendingCertification extends CertificationInput {
  id: string
  photoPreviewUrl?: string
}

interface AddWorkerProps {
  onSuccess?: () => void
}

export function AddWorker({ onSuccess }: AddWorkerProps) {
  const [isPending, startTransition] = useTransition()
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: "",
    trade: "",
    phone: "",
  })

  // Certification state
  const [pendingCerts, setPendingCerts] = useState<PendingCertification[]>([])
  const [showCertForm, setShowCertForm] = useState(false)
  const [certForm, setCertForm] = useState({
    certificationType: "",
    issueDate: "",
    expirationDate: "",
    photoPathname: "",
    photoPreviewUrl: "",
  })
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false)

  const handlePhotoUpload = async (file: File) => {
    setIsUploadingPhoto(true)
    
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

      setCertForm(prev => ({
        ...prev,
        photoPathname: result.pathname,
        photoPreviewUrl: `/api/file?pathname=${encodeURIComponent(result.pathname)}`,
      }))
    } catch (err) {
      console.error("Upload error:", err)
    } finally {
      setIsUploadingPhoto(false)
    }
  }

  const handleFileSelect = (useCamera: boolean = false) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    if (useCamera) {
      input.capture = 'environment'
    }
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        handlePhotoUpload(file)
      }
    }
    input.click()
  }

  const addCertification = () => {
    if (!certForm.certificationType || !certForm.issueDate || !certForm.expirationDate) return

    const newCert: PendingCertification = {
      id: `temp-${Date.now()}`,
      certificationType: certForm.certificationType,
      issueDate: certForm.issueDate,
      expirationDate: certForm.expirationDate,
      photoPathname: certForm.photoPathname || undefined,
      photoPreviewUrl: certForm.photoPreviewUrl || undefined,
    }

    setPendingCerts([...pendingCerts, newCert])
    setCertForm({
      certificationType: "",
      issueDate: "",
      expirationDate: "",
      photoPathname: "",
      photoPreviewUrl: "",
    })
    setShowCertForm(false)
  }

  const removeCertification = (id: string) => {
    setPendingCerts(pendingCerts.filter(c => c.id !== id))
  }

  const handleSubmit = () => {
    setError(null)
    setSuccess(false)

    startTransition(async () => {
      const result = await createWorker({
        ...formData,
        certifications: [], // Legacy field - now using documentedCertifications
        documentedCertifications: pendingCerts.map(c => ({
          certificationType: c.certificationType,
          photoPathname: c.photoPathname,
          issueDate: c.issueDate,
          expirationDate: c.expirationDate,
        })),
      })
      
      if (result.success) {
        setSuccess(true)
        setFormData({ name: "", trade: "", phone: "" })
        setPendingCerts([])
        onSuccess?.()
        
        setTimeout(() => setSuccess(false), 3000)
      } else {
        setError(result.error || "Failed to add worker")
      }
    })
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-24">
      {/* Header Card */}
      <Card className="flex items-center gap-3 p-4 bg-card border-border">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/20">
          <UserPlus className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Add New Worker</h2>
          <p className="text-sm text-muted-foreground">Enter worker details below</p>
        </div>
      </Card>

      {/* Success Message */}
      {success && (
        <Card className="flex items-center gap-3 p-4 bg-accent/10 border-accent/30">
          <CheckCircle className="h-5 w-5 text-accent" />
          <span className="text-sm text-accent">Worker added successfully!</span>
        </Card>
      )}

      {/* Error Message */}
      {error && (
        <Card className="flex items-center gap-3 p-4 bg-destructive/10 border-destructive/30">
          <span className="text-sm text-destructive">{error}</span>
        </Card>
      )}

      {/* Form */}
      <Card className="p-4 bg-card border-border">
        <div className="flex flex-col gap-5">
          {/* Name Field */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-foreground flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              Full Name
            </Label>
            <Input
              placeholder="Enter worker name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="bg-input border-border text-foreground placeholder:text-muted-foreground h-11"
              disabled={isPending}
            />
          </div>

          {/* Trade Field */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              Trade / Role
            </Label>
            <Select 
              value={formData.trade} 
              onValueChange={(v) => setFormData({ ...formData, trade: v })}
              disabled={isPending}
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

          {/* Phone Field */}
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              Phone Number
            </Label>
            <Input
              placeholder="(555) 123-4567"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="bg-input border-border text-foreground placeholder:text-muted-foreground h-11"
              disabled={isPending}
            />
          </div>

          {/* Certifications Section */}
          <div className="flex flex-col gap-3">
            <Label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Award className="h-4 w-4 text-muted-foreground" />
              Certifications
            </Label>

            {/* Pending Certifications List */}
            {pendingCerts.length > 0 && (
              <div className="flex flex-col gap-2">
                {pendingCerts.map((cert) => (
                  <div
                    key={cert.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border"
                  >
                    {cert.photoPreviewUrl ? (
                      <img
                        src={cert.photoPreviewUrl}
                        alt={cert.certificationType}
                        className="w-12 h-12 rounded object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                        <FileCheck className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm truncate">{cert.certificationType}</p>
                      <p className="text-xs text-muted-foreground">
                        Expires: {new Date(cert.expirationDate + "T00:00:00").toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => removeCertification(cert.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Certification Form */}
            {showCertForm ? (
              <Card className="p-4 bg-secondary/30 border-border">
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-foreground">Add Certification</h4>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowCertForm(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Certification Type */}
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs text-muted-foreground">Certification Type</Label>
                    <Select
                      value={certForm.certificationType}
                      onValueChange={(v) => setCertForm({ ...certForm, certificationType: v })}
                    >
                      <SelectTrigger className="bg-input border-border h-10">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {certificationTypes.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Issue Date */}
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Issue Date
                    </Label>
                    <Input
                      type="date"
                      value={certForm.issueDate}
                      onChange={(e) => setCertForm({ ...certForm, issueDate: e.target.value })}
                      className="bg-input border-border h-10"
                    />
                  </div>

                  {/* Expiration Date */}
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Expiration Date
                    </Label>
                    <Input
                      type="date"
                      value={certForm.expirationDate}
                      onChange={(e) => setCertForm({ ...certForm, expirationDate: e.target.value })}
                      className="bg-input border-border h-10"
                    />
                  </div>

                  {/* Photo Upload */}
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs text-muted-foreground">Photo / Document (Optional)</Label>
                    {certForm.photoPreviewUrl ? (
                      <div className="relative">
                        <img
                          src={certForm.photoPreviewUrl}
                          alt="Certificate preview"
                          className="w-full h-32 object-cover rounded-lg border border-border"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2 h-7 w-7"
                          onClick={() => setCertForm({ ...certForm, photoPathname: "", photoPreviewUrl: "" })}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-border"
                          onClick={() => handleFileSelect(true)}
                          disabled={isUploadingPhoto}
                        >
                          {isUploadingPhoto ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Camera className="h-4 w-4 mr-2" />
                              Camera
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 border-border"
                          onClick={() => handleFileSelect(false)}
                          disabled={isUploadingPhoto}
                        >
                          {isUploadingPhoto ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Images className="h-4 w-4 mr-2" />
                              Gallery
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Add Button */}
                  <Button
                    variant="default"
                    className="w-full"
                    onClick={addCertification}
                    disabled={!certForm.certificationType || !certForm.issueDate || !certForm.expirationDate}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Certification
                  </Button>
                </div>
              </Card>
            ) : (
              <Button
                variant="outline"
                className="w-full h-11 border-dashed border-border"
                onClick={() => setShowCertForm(true)}
                disabled={isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Certification
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Submit Button */}
      <Button
        className="h-12 bg-primary text-primary-foreground hover:bg-primary/90 font-medium"
        onClick={handleSubmit}
        disabled={!formData.name || !formData.trade || isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Adding Worker...
          </>
        ) : (
          <>
            <UserPlus className="h-5 w-5 mr-2" />
            Add Worker
          </>
        )}
      </Button>
    </div>
  )
}
