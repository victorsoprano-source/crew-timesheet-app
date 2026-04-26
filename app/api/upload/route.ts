import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Force Node.js runtime
export const runtime = 'nodejs'

/**
 * Check if MIME type is a supported image format
 */
function isSupportedImageType(mimeType: string): boolean {
  const supported = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
  ]
  return supported.includes(mimeType.toLowerCase())
}

/**
 * Check if MIME type is HEIC/HEIF (not directly supported)
 */
function isHeicFormat(mimeType: string, filename: string): boolean {
  const heicMimes = ['image/heic', 'image/heif']
  if (heicMimes.includes(mimeType.toLowerCase())) return true
  // Also check filename extension since HEIC sometimes has wrong MIME type
  const ext = filename.toLowerCase().split('.').pop()
  return ext === 'heic' || ext === 'heif'
}

/**
 * Get file extension for storage (always use .jpg for compatibility)
 */
function getStorageExtension(mimeType: string): string {
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/gif') return '.gif'
  if (mimeType === 'image/webp') return '.webp'
  // Default to .jpg for jpeg and any other format
  return '.jpg'
}

export async function POST(request: NextRequest) {
  console.log('[UPLOAD] === Starting photo upload ===')
  
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const workDate = formData.get('workDate') as string | null
    const indexParam = formData.get('index') as string | null
    const index = indexParam ? parseInt(indexParam, 10) : 0

    // Log received file details
    console.log('[UPLOAD] File received:', {
      name: file?.name || 'unknown',
      type: file?.type || 'unknown',
      size: file?.size || 0,
      workDate: workDate || 'not provided',
      index
    })

    if (!file) {
      console.log('[UPLOAD] ERROR: No file provided')
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate that we have a proper File object
    if (!(file instanceof File)) {
      console.log('[UPLOAD] ERROR: Not a File instance')
      return NextResponse.json({ error: 'Invalid file format' }, { status: 400 })
    }

    // Check for HEIC/HEIF format (not supported)
    if (isHeicFormat(file.type, file.name)) {
      console.log('[UPLOAD] ERROR: HEIC/HEIF format not supported')
      return NextResponse.json({ 
        error: 'This photo format is not supported. Please use camera or select a JPEG/PNG image.' 
      }, { status: 400 })
    }

    // Validate file type (images only)
    if (!file.type.startsWith('image/')) {
      console.log('[UPLOAD] ERROR: Not an image file, type:', file.type)
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
    }

    // Check if it's a supported image type
    if (!isSupportedImageType(file.type)) {
      console.log('[UPLOAD] ERROR: Unsupported image type:', file.type)
      return NextResponse.json({ 
        error: 'This photo format is not supported. Please use camera or select a JPEG/PNG image.' 
      }, { status: 400 })
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      console.log('[UPLOAD] ERROR: File too large:', file.size)
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
    }

    // Create Supabase client with service role for storage access
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.log('[UPLOAD] ERROR: Missing Supabase environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Generate safe filename using exact format requested:
    // daily-reports/{reportDate}/photo-{timestamp}-{index}.jpg
    const timestamp = Date.now()
    const reportDate = workDate || new Date().toISOString().split('T')[0]
    const extension = getStorageExtension(file.type)
    
    // Path format: daily-reports/2026-04-26/photo-1714123456789-0.jpg
    const storagePath = `daily-reports/${reportDate}/photo-${timestamp}-${index}${extension}`
    
    console.log('[UPLOAD] Generated storage path:', storagePath)

    // Convert File to ArrayBuffer for upload
    console.log('[UPLOAD] Converting file to buffer...')
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)
    console.log('[UPLOAD] Buffer size:', buffer.length)

    // Upload to Supabase Storage
    console.log('[UPLOAD] Uploading to Supabase Storage...')
    const { data, error } = await supabase.storage
      .from('reports')
      .upload(storagePath, buffer, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })

    if (error) {
      console.log('[UPLOAD] Supabase upload ERROR:', {
        message: error.message,
        name: error.name,
        details: JSON.stringify(error)
      })
      return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 })
    }

    console.log('[UPLOAD] Supabase upload SUCCESS:', {
      path: data.path,
      id: data.id,
      fullPath: data.fullPath
    })

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('reports')
      .getPublicUrl(storagePath)

    console.log('[UPLOAD] Public URL generated:', urlData.publicUrl)

    // Return the pathname (for database) and public URL
    const response = { 
      pathname: data.path,
      url: urlData.publicUrl,
    }
    
    console.log('[UPLOAD] === Upload complete ===', response)
    
    return NextResponse.json(response)
  } catch (error) {
    console.log('[UPLOAD] EXCEPTION:', error)
    const errorMessage = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
