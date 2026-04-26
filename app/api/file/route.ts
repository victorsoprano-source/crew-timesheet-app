import { type NextRequest, NextResponse } from 'next/server'
import { get, head } from '@vercel/blob'

export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get('pathname')

    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    // First try to get blob metadata to check if it exists and get URL
    const blobInfo = await head(pathname)
    
    if (!blobInfo) {
      return new NextResponse('Not found', { status: 404 })
    }

    // For public blobs, redirect to the blob URL
    // This is more efficient than streaming through our server
    return NextResponse.redirect(blobInfo.url)
  } catch (error) {
    // If head() fails, try the legacy private blob approach
    try {
      const result = await get(pathname, {
        access: 'private',
        ifNoneMatch: request.headers.get('if-none-match') ?? undefined,
      })

      if (!result) {
        return new NextResponse('Not found', { status: 404 })
      }

      // Blob hasn't changed — tell the browser to use its cached copy
      if (result.statusCode === 304) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            ETag: result.blob.etag,
            'Cache-Control': 'private, no-cache',
          },
        })
      }

      return new NextResponse(result.stream, {
        headers: {
          'Content-Type': result.blob.contentType,
          ETag: result.blob.etag,
          'Cache-Control': 'private, no-cache',
        },
      })
    } catch (privateError) {
      console.error('Error serving file:', error, privateError)
      return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
    }
  }
}
