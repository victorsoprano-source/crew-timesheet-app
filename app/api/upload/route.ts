import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Get file extension from MIME type
 */
function getExtensionFromMime(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/heic': '.heic',
    'image/heif': '.heif',
  }
  return mimeToExt[mimeType] || '.jpg'
}

// Force Node.js runtime
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const workDate = formData.get('workDate') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate that we have a proper File object
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Invalid file format' }, { status: 400 })
    }

    // Validate file type (images only)
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
    }

    // Create Supabase client with service role for storage access
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Generate safe filename
    const timestamp = Date.now()
    const date = workDate || new Date().toISOString().split('T')[0]
    
    // Get extension from MIME type
    let extension = getExtensionFromMime(file.type)
    if (file.name) {
      const lastDot = file.name.lastIndexOf('.')
      if (lastDot > 0) {
        const originalExt = file.name.substring(lastDot).toLowerCase()
        if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif'].includes(originalExt)) {
          extension = originalExt === '.jpeg' ? '.jpg' : originalExt
        }
      }
    }
    
    // Create safe path: {date}/photo_{timestamp}.jpg
    const storagePath = `${date}/photo_${timestamp}${extension}`

    // Convert File to ArrayBuffer for upload
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('reports')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

    if (error) {
      console.error('Supabase storage error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
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
