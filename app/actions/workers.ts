"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export type WorkerLevel = "Journeyman" | "Apprentice Year 1" | "Apprentice Year 2" | "Apprentice Year 3"

export interface Worker {
  id: string
  name: string
  trade: string
  phone: string | null
  photo_pathname: string | null
  level: WorkerLevel
  status: "active" | "off-site" | "on-leave"
  certifications: string[]
  created_at: string
  updated_at: string
}

export interface WorkerCertification {
  id: string
  worker_id: string
  certification_type: string
  photo_pathname: string | null
  issue_date: string
  expiration_date: string
  created_at: string
  updated_at: string
  // Joined fields
  worker_name?: string
}

export async function getWorkers(): Promise<Worker[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .order("name", { ascending: true })

  if (error) {
    console.error("Error fetching workers:", error)
    return []
  }

  return data || []
}

export async function getActiveWorkers(): Promise<Worker[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workers")
    .select("*")
    .eq("status", "active")
    .order("name", { ascending: true })

  if (error) {
    console.error("Error fetching active workers:", error)
    return []
  }

  return data || []
}

export async function getWorkerStats() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("workers")
    .select("status")

  if (error) {
    console.error("Error fetching worker stats:", error)
    return { active: 0, offSite: 0, onLeave: 0 }
  }

  const stats = {
    active: data?.filter(w => w.status === "active").length || 0,
    offSite: data?.filter(w => w.status === "off-site").length || 0,
    onLeave: data?.filter(w => w.status === "on-leave").length || 0,
  }

  return stats
}

export interface CertificationInput {
  certificationType: string
  photoPathname?: string
  issueDate: string
  expirationDate: string
}

export async function createWorker(formData: {
  name: string
  trade: string
  phone: string
  level: WorkerLevel
  photo_pathname?: string
  certifications: string[]
  documentedCertifications?: CertificationInput[]
}): Promise<{ success: boolean; workerId?: string; error?: string }> {
  const supabase = await createClient()

  const { data: worker, error } = await supabase.from("workers").insert({
    name: formData.name,
    trade: formData.trade,
    phone: formData.phone || null,
    level: formData.level,
    photo_pathname: formData.photo_pathname || null,
    certifications: formData.certifications,
    status: "active",
  }).select("id").single()

  if (error) {
    console.error("Error creating worker:", error)
    return { success: false, error: error.message }
  }

  // Save documented certifications if any
  if (formData.documentedCertifications && formData.documentedCertifications.length > 0 && worker?.id) {
    const certRecords = formData.documentedCertifications.map(cert => ({
      worker_id: worker.id,
      certification_type: cert.certificationType,
      photo_pathname: cert.photoPathname || null,
      issue_date: cert.issueDate,
      expiration_date: cert.expirationDate,
    }))

    const { error: certError } = await supabase
      .from("worker_certifications")
      .insert(certRecords)

    if (certError) {
      console.error("Error saving certifications:", certError)
      // Worker was created but certs failed - still return success with warning
    }
  }

  // Log activity
  await supabase.from("activity_log").insert({
    action: "worker_added",
    description: `New worker added: ${formData.name}`,
  })

  revalidatePath("/")
  return { success: true, workerId: worker?.id }
}

export async function updateWorkerStatus(
  workerId: string,
  status: "active" | "off-site" | "on-leave"
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from("workers")
    .update({ status })
    .eq("id", workerId)

  if (error) {
    console.error("Error updating worker status:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

export async function updateWorker(
  workerId: string,
  formData: {
    name: string
    trade: string
    phone: string
    level: WorkerLevel
    photo_pathname?: string | null
    certifications: string[]
    status: "active" | "off-site" | "on-leave"
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from("workers")
    .update({
      name: formData.name,
      trade: formData.trade,
      phone: formData.phone || null,
      level: formData.level,
      photo_pathname: formData.photo_pathname ?? undefined,
      certifications: formData.certifications,
      status: formData.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workerId)

  if (error) {
    console.error("Error updating worker:", error)
    return { success: false, error: error.message }
  }

  // Log activity
  await supabase.from("activity_log").insert({
    action: "worker_updated",
    description: `Worker updated: ${formData.name}`,
  })

  revalidatePath("/")
  return { success: true }
}

export async function deleteWorker(
  workerId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase
    .from("workers")
    .delete()
    .eq("id", workerId)

  if (error) {
    console.error("Error deleting worker:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

// Worker Certifications functions
export async function getWorkerCertifications(workerId?: string): Promise<WorkerCertification[]> {
  const supabase = await createClient()

  let query = supabase
    .from("worker_certifications")
    .select(`
      *,
      workers(name)
    `)
    .order("expiration_date", { ascending: true })

  if (workerId) {
    query = query.eq("worker_id", workerId)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching certifications:", error)
    return []
  }

  return (data || []).map((cert: { workers?: { name: string } | null }) => ({
    ...cert,
    worker_name: cert.workers?.name || "Unknown",
  })) as WorkerCertification[]
}

export async function getExpiringCertifications(daysAhead: number = 30): Promise<WorkerCertification[]> {
  const supabase = await createClient()
  
  const futureDate = new Date()
  futureDate.setDate(futureDate.getDate() + daysAhead)

  const { data, error } = await supabase
    .from("worker_certifications")
    .select(`
      *,
      workers(name)
    `)
    .lte("expiration_date", futureDate.toISOString().split("T")[0])
    .order("expiration_date", { ascending: true })

  if (error) {
    console.error("Error fetching expiring certifications:", error)
    return []
  }

  return (data || []).map((cert: { workers?: { name: string } | null }) => ({
    ...cert,
    worker_name: cert.workers?.name || "Unknown",
  })) as WorkerCertification[]
}

export async function addWorkerCertification(data: {
  workerId: string
  certificationType: string
  photoPathname?: string
  issueDate: string
  expirationDate: string
}): Promise<{ success: boolean; certification?: WorkerCertification; error?: string }> {
  const supabase = await createClient()

  const { data: cert, error } = await supabase
    .from("worker_certifications")
    .insert({
      worker_id: data.workerId,
      certification_type: data.certificationType,
      photo_pathname: data.photoPathname || null,
      issue_date: data.issueDate,
      expiration_date: data.expirationDate,
    })
    .select()
    .single()

  if (error) {
    console.error("Error adding certification:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true, certification: cert }
}

export async function updateWorkerCertification(
  certId: string,
  data: {
    certificationType?: string
    photoPathname?: string
    issueDate?: string
    expirationDate?: string
  }
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.certificationType) updateData.certification_type = data.certificationType
  if (data.photoPathname) updateData.photo_pathname = data.photoPathname
  if (data.issueDate) updateData.issue_date = data.issueDate
  if (data.expirationDate) updateData.expiration_date = data.expirationDate

  const { error } = await supabase
    .from("worker_certifications")
    .update(updateData)
    .eq("id", certId)

  if (error) {
    console.error("Error updating certification:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/")
  return { success: true }
}

export async function deleteWorkerCertification(certId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()

  // Get the photo pathname before deleting
  const { data: cert } = await supabase
    .from("worker_certifications")
    .select("photo_pathname")
    .eq("id", certId)
    .single()

  const { error } = await supabase
    .from("worker_certifications")
    .delete()
    .eq("id", certId)

  if (error) {
    console.error("Error deleting certification:", error)
    return { success: false, error: error.message }
  }

  // Delete photo from blob if exists
  if (cert?.photo_pathname) {
    try {
      const { del } = await import("@vercel/blob")
      await del(cert.photo_pathname)
    } catch (blobError) {
      console.error("Error deleting cert photo from blob:", blobError)
    }
  }

  revalidatePath("/")
  return { success: true }
}
