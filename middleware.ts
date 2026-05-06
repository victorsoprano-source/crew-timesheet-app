import { updateSession } from '@/lib/supabase/middleware'
import { type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, icons, manifest
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp, .ico
     * - api routes
     */
    '/((?!_next/static|_next/image|favicon.ico|icon-.*|apple-touch-icon.*|manifest.json|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
