import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Force Node.js runtime
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    // Support both daily-reports and certificate uploads
    const uploadType = formData.get('type') as string | null // 'certificate' or 'report' (default)
    const workDate = formData.get('workDate') as string | null
    const indexParam = formData.get('index') as string | null
    const index = indexParam ? parseInt(indexParam, 10) : 0
    const workerId = formData.get('workerId') as string | null
    const certType = formData.get('certType') as string | null

    console.log("[v0] UPLOAD REQUEST:", { 
      hasFile: !!file, 
      fileType: file?.type, 
      fileSize: file?.size,
      uploadType,
      workDate,
      index,
      workerId,
      certType
    })

    if (!file) {
      console.log("[v0] UPLOAD ERROR: No file provided")
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!(file instanceof File)) {
      console.log("[v0] UPLOAD ERROR: Invalid file format")
      return NextResponse.json({ error: 'Invalid file format' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      console.log("[v0] UPLOAD ERROR: Not an image file")
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
    }

    if (file.size > 10 * 1024 * 1024) {
      console.log("[v0] UPLOAD ERROR: File too large")
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.log("[v0] UPLOAD ERROR: Missing Supabase config")
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Generate storage path based on upload type
    const timestamp = Date.now()
    let storagePath: string
    
    if (uploadType === 'certificate') {
      // Certificate photo path: worker-certificates/{workerId}/{certType}/cert-{timestamp}.jpg
      const safeWorkerId = workerId || 'unknown'
      const safeCertType = (certType || 'certificate').replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase()
      storagePath = `worker-certificates/${safeWorkerId}/${safeCertType}/cert-${timestamp}.jpg`
    } else {
      // Daily report photo path: daily-reports/{date}/photo-{timestamp}-{index}.jpg
      const reportDate = workDate || new Date().toISOString().split('T')[0]
      storagePath = `daily-reports/${reportDate}/photo-${timestamp}-${index}.jpg`
    }

    console.log("[v0] UPLOAD PATH:", storagePath)

    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    console.log("[v0] UPLOADING TO SUPABASE STORAGE...")

    const { data, error } = await supabase.storage
      .from('reports')
      .upload(storagePath, buffer, {
        contentType: 'image/jpeg',
        upsert: false,
      })

    if (error) {
      console.log("[v0] SUPABASE UPLOAD ERROR:", error.message)
      return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 })
    }

    console.log("[v0] UPLOAD SUCCESS, path:", data.path)

    const { data: urlData } = supabase.storage
      .from('reports')
      .getPublicUrl(storagePath)

    const result = { 
      pathname: data.path,
      url: urlData.publicUrl,
    }
    
    console.log("[v0] UPLOAD RESULT:", result)

    return NextResponse.json(result)
  } catch (error) {
    console.log("[v0] UPLOAD EXCEPTION:", error)
    const errorMessage = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
