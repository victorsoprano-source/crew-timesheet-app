import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get('pathname')

    if (!pathname) {
      return NextResponse.json({ error: 'Missing pathname' }, { status: 400 })
    }

    // Create Supabase client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get public URL for the file from Supabase Storage
    const { data } = supabase.storage
      .from('reports')
      .getPublicUrl(pathname)

    if (!data?.publicUrl) {
      return new NextResponse('Not found', { status: 404 })
    }

    // Redirect to the public Supabase Storage URL
    return NextResponse.redirect(data.publicUrl)
  } catch (error) {
    console.error('Error serving file:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
