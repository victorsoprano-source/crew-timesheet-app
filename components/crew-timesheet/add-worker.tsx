"use client"

import { useState, useTransition } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { UserPlus, User, Wrench, Phone, Award, Loader2, CheckCircle } from "lucide-react"
import { createWorker } from "@/app/actions/workers"

const trades = ["Electrician", "Plumber", "Carpenter", "Mason", "Welder", "Laborer", "Foreman", "Heavy Equipment Operator", "HVAC Technician", "Painter"]

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
    certifications: [] as string[],
  })

  const toggleCertification = (cert: string) => {
    setFormData((prev) => ({
      ...prev,
      certifications: prev.certifications.includes(cert)
        ? prev.certifications.filter((c) => c !== cert)
        : [...prev.certifications, cert],
    }))
  }

  const handleSubmit = () => {
    setError(null)
    setSuccess(false)

    startTransition(async () => {
      const result = await createWorker(formData)
      
      if (result.success) {
        setSuccess(true)
        setFormData({ name: "", trade: "", phone: "", certifications: [] })
        onSuccess?.()
        
        // Reset success message after 3 seconds
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

          {/* Certifications */}
          <div className="flex flex-col gap-3">
            <Label className="text-sm font-medium text-foreground flex items-center gap-2">
              <Award className="h-4 w-4 text-muted-foreground" />
              Certifications
            </Label>
            <div className="grid grid-cols-2 gap-3">
              {certifications.map((cert) => (
                <div
                  key={cert}
                  className="flex items-center gap-2 rounded-lg bg-secondary/50 p-3 cursor-pointer hover:bg-secondary transition-colors"
                  onClick={() => !isPending && toggleCertification(cert)}
                >
                  <Checkbox
                    checked={formData.certifications.includes(cert)}
                    onCheckedChange={() => toggleCertification(cert)}
                    className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                    disabled={isPending}
                  />
                  <span className="text-sm text-foreground">{cert}</span>
                </div>
              ))}
            </div>
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
