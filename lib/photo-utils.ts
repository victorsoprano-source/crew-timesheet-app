/**
 * Photo URL utilities for handling both old (Vercel Blob) and new (Supabase Storage) photos.
 * 
 * Old photos have pathnames like: "timesheet-photos/1234567890-filename.jpg"
 * New photos have pathnames like: "2026-04-25/photo_1234567890.jpg"
 */

/**
 * Detects if a pathname is from the old Vercel Blob storage system.
 * Old paths start with "timesheet-photos/" prefix.
 */
export function isVercelBlobPath(pathname: string): boolean {
  return pathname.startsWith('timesheet-photos/')
}

/**
 * Detects if a pathname is from the new Supabase Storage system.
 * New paths follow the pattern: "YYYY-MM-DD/photo_timestamp.ext" or "reports/YYYY-MM-DD/..."
 */
export function isSupabaseStoragePath(pathname: string): boolean {
  // New Supabase paths: "2026-04-25/photo_xxx.jpg" or similar date-based structure
  return /^\d{4}-\d{2}-\d{2}\//.test(pathname) || pathname.startsWith('reports/')
}

/**
 * Detects if a string is already a full URL.
 */
export function isFullUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://')
}

/**
 * Gets the display URL for a photo.
 * Handles all storage formats: Vercel Blob, Supabase Storage, and full URLs.
 * 
 * @param pathname - The photo pathname or URL from the database
 * @returns The URL to use for displaying the image
 */
export function getPhotoDisplayUrl(pathname: string | null | undefined): string | null {
  if (!pathname) {
    console.log('[v0] getPhotoDisplayUrl: No pathname provided')
    return null
  }

  // If it's already a full URL, use it directly
  if (isFullUrl(pathname)) {
    console.log('[v0] getPhotoDisplayUrl: Using full URL directly:', pathname.substring(0, 50) + '...')
    return pathname
  }

  // Route through our API which handles both storage systems
  const url = `/api/file?pathname=${encodeURIComponent(pathname)}`
  console.log('[v0] getPhotoDisplayUrl: Routing through API:', { pathname, url })
  return url
}

/**
 * Determines the storage type for a given pathname.
 */
export function getStorageType(pathname: string): 'vercel-blob' | 'supabase' | 'url' | 'unknown' {
  if (isFullUrl(pathname)) return 'url'
  if (isVercelBlobPath(pathname)) return 'vercel-blob'
  if (isSupabaseStoragePath(pathname)) return 'supabase'
  return 'unknown'
}
