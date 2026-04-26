import { put } from '@vercel/blob'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Sanitize filename for Vercel Blob storage
 * - Removes spaces and special characters
 * - Only allows: a-z, A-Z, 0-9, dash (-), underscore (_), period (.)
 */
function sanitizeFilename(filename: string): string {
  // Get the file extension
  const lastDotIndex = filename.lastIndexOf('.')
  const extension = lastDotIndex > 0 ? filename.substring(lastDotIndex).toLowerCase() : '.jpg'
  
  // Sanitize the name part (everything before extension)
  const namePart = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename
  
  // Replace spaces with underscores, remove special chars
  const sanitized = namePart
    .replace(/\s+/g, '_')           // Replace spaces with underscore
    .replace(/[^a-zA-Z0-9_-]/g, '') // Remove special chars
    .substring(0, 50)               // Limit length
  
  // If nothing left after sanitization, use generic name
  return (sanitized || 'photo') + extension
}

/**
 * Get file extension from MIME type as fallback
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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const workDate = formData.get('workDate') as string | null

    if (!file) {
      console.error('UPLOAD ERROR: No file provided')
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate that we have a proper File object
    if (!(file instanceof File)) {
      console.error('UPLOAD ERROR: Invalid file type - not a File object')
      return NextResponse.json({ error: 'Invalid file format' }, { status: 400 })
    }

    // Validate file type (images only)
    if (!file.type.startsWith('image/')) {
      console.error('UPLOAD ERROR: Not an image file, type:', file.type)
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
    }

    // Validate file size (max 10MB to accommodate phone photos)
    if (file.size > 10 * 1024 * 1024) {
      console.error('UPLOAD ERROR: File too large:', file.size)
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 })
    }

    // Generate safe filename
    // Pattern: reports/{date}/photo_{timestamp}.{ext}
    const timestamp = Date.now()
    const date = workDate || new Date().toISOString().split('T')[0]
    
    // Get extension from original filename or MIME type
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
    
    // Create safe filename: reports/2026-04-25/photo_1714012345678.jpg
    const safeFilename = `reports/${date}/photo_${timestamp}${extension}`

    console.log('Uploading file:', {
      originalName: file.name,
      safeFilename,
      type: file.type,
      size: file.size
    })

    // Upload to Vercel Blob storage
    const blob = await put(safeFilename, file, {
      access: 'public', // Use public for easier access
      addRandomSuffix: false, // We already have timestamp for uniqueness
    })

    console.log('Upload successful:', blob.pathname)

    // Return the pathname for blob access
    return NextResponse.json({ 
      pathname: blob.pathname,
      url: blob.url,
    })
  } catch (error) {
    console.error('UPLOAD ERROR:', error)
    const errorMessage = error instanceof Error ? error.message : 'Upload failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
