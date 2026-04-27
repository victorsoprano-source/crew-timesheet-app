import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Force Node.js runtime
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const workDate = formData.get('workDate') as string | null
    const indexParam = formData.get('index') as string | null
    const index = indexParam ? parseInt(indexParam, 10) : 0

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate that we have a proper File object
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Invalid file format' }, { status: 400 })
    }

    // Validate file type - client-side conversion should always send JPEG
    // But we also accept PNG/GIF/WebP as fallback
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
    }

    // Validate file size (max 10MB - already compressed on client)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
    }

    // Create Supabase client with service role for storage access
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Generate storage path: daily-reports/{date}/photo-{timestamp}-{index}.jpg
    const timestamp = Date.now()
    const reportDate = workDate || new Date().toISOString().split('T')[0]
    
    // Always use .jpg extension since client converts to JPEG
    const storagePath = `daily-reports/${reportDate}/photo-${timestamp}-${index}.jpg`

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    // Upload to Supabase Storage (public bucket)
    const { data, error } = await supabase.storage
      .from('reports')
      .upload(storagePath, buffer, {
        contentType: 'image/jpeg',
        upsert: false,
      })

    if (error) {
      console.error('Supabase upload error:', error)
      return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 })
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('reports')
      .getPublicUrl(storagePath)

    // Return the pathname (for database) and public URL
    return NextResponse.json({ 
      pathname: data.path,
      url: urlData.publicUrl,
    })
  } catch (error) {
    console.error('Upload error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
