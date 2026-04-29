import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { head } from '@vercel/blob'

// Force Node.js runtime
export const runtime = 'nodejs'

/**
 * File serving API that handles both old (Vercel Blob) and new (Supabase Storage) photos.
 * 
 * Old photos: pathname starts with "timesheet-photos/"
 * New photos: pathname is a date-based path like "2026-04-25/photo_xxx.jpg"
 */
export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get('pathname')

  if (!pathname) {
    return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
  }

  console.log('[v0] PHOTO PATH:', pathname)

  // Detect storage type based on pathname pattern
  const isOldVercelBlob = pathname.startsWith('timesheet-photos/')
  const isNewSupabase = /^\d{4}-\d{2}-\d{2}\//.test(pathname) || 
    pathname.startsWith('reports/') || 
    pathname.startsWith('daily-reports/') ||
    pathname.startsWith('worker-certificates/')

  try {
    // Try Vercel Blob first for old photos
    if (isOldVercelBlob) {
      console.log('[v0] File API: Attempting Vercel Blob lookup for:', pathname)
      try {
        const blobInfo = await head(pathname)
        if (blobInfo?.url) {
          console.log('[v0] File API: Found in Vercel Blob, redirecting to:', blobInfo.url.substring(0, 50) + '...')
          return NextResponse.redirect(blobInfo.url)
        }
      } catch (blobError) {
        console.log('[v0] File API: Not found in Vercel Blob, trying Supabase...')
      }
    }

    // Try Supabase Storage
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('[v0] File API: Missing Supabase configuration')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Try the 'reports' bucket first (where new photos are stored)
    const { data: reportsData } = supabase.storage
      .from('reports')
      .getPublicUrl(pathname)

    if (reportsData?.publicUrl) {
      // Verify the file exists by making a HEAD request
      try {
        const checkResponse = await fetch(reportsData.publicUrl, { method: 'HEAD' })
        if (checkResponse.ok) {
          console.log('[v0] File API: Found in Supabase reports bucket, redirecting')
          return NextResponse.redirect(reportsData.publicUrl)
        }
      } catch {
        // File doesn't exist in reports bucket
      }
    }

    // If not in reports bucket and it's an old path, it might have been uploaded
    // to Supabase with a different structure - try without the old prefix
    if (isOldVercelBlob) {
      // Try extracting just the filename and looking in reports
      const filename = pathname.split('/').pop()
      if (filename) {
        const { data: altData } = supabase.storage
          .from('reports')
          .getPublicUrl(filename)
        
        if (altData?.publicUrl) {
          try {
            const checkResponse = await fetch(altData.publicUrl, { method: 'HEAD' })
            if (checkResponse.ok) {
              console.log('[v0] File API: Found alternate path in Supabase')
              return NextResponse.redirect(altData.publicUrl)
            }
          } catch {
            // Not found
          }
        }
      }
    }

    // File not found in any storage
    console.log('[v0] File API: File not found in any storage:', pathname)
    
    // Return a placeholder/fallback response instead of 404
    // This allows the UI to show a fallback image
    return new NextResponse(null, { 
      status: 404,
      headers: {
        'X-Photo-Status': 'not-found',
        'X-Photo-Pathname': pathname
      }
    })

  } catch (error) {
    console.error('[v0] File API: Error serving file:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
