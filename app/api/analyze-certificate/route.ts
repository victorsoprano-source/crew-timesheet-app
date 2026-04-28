import { generateText, Output } from 'ai'
import { z } from 'zod'
import { type NextRequest, NextResponse } from 'next/server'

// Schema for extracted certificate data
const certificateDataSchema = z.object({
  certificateName: z.string().nullable().describe('Name or type of the certificate/training'),
  issueDate: z.string().nullable().describe('Issue date in YYYY-MM-DD format if found'),
  expirationDate: z.string().nullable().describe('Expiration date in YYYY-MM-DD format if found'),
  holderName: z.string().nullable().describe('Name of the certificate holder if visible'),
  confidence: z.enum(['high', 'medium', 'low']).describe('Confidence level of the extraction'),
})

export type CertificateAnalysisResult = z.infer<typeof certificateDataSchema>

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json()
    
    if (!imageUrl) {
      return NextResponse.json(
        { error: 'No image URL provided' },
        { status: 400 }
      )
    }

    // Fetch the image and convert to base64
    let imageData: string
    let mediaType: string = 'image/jpeg'
    
    try {
      // Handle both absolute URLs and relative paths
      const fullUrl = imageUrl.startsWith('http') 
        ? imageUrl 
        : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/reports/${imageUrl}`
      
      const imageResponse = await fetch(fullUrl)
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`)
      }
      
      const contentType = imageResponse.headers.get('content-type')
      if (contentType) {
        mediaType = contentType
      }
      
      const arrayBuffer = await imageResponse.arrayBuffer()
      imageData = Buffer.from(arrayBuffer).toString('base64')
    } catch (fetchError) {
      console.error('Error fetching image:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch image for analysis' },
        { status: 400 }
      )
    }

    const { output } = await generateText({
      model: 'openai/gpt-4o',
      output: Output.object({
        schema: certificateDataSchema,
      }),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Analyze this certificate/training card image and extract the following information:
              
1. Certificate Name: The type or name of the certification (e.g., "OSHA 30-Hour", "First Aid/CPR", "Forklift Certification", etc.)
2. Issue Date: When the certificate was issued (convert to YYYY-MM-DD format)
3. Expiration Date: When the certificate expires (convert to YYYY-MM-DD format)
4. Holder Name: The name of the person on the certificate

Important:
- If a date shows only month/year (e.g., "03/2025"), assume day 01 for issue dates and last day of month for expiration dates
- Return null for any field you cannot confidently identify
- Set confidence to "high" if dates are clearly visible, "medium" if partially readable, "low" if uncertain
- Common certificates include: OSHA 10/30, SST, SWAC, First Aid/CPR, Forklift, Scaffold, Lead Awareness, Track Safety, etc.`,
            },
            {
              type: 'image',
              image: `data:${mediaType};base64,${imageData}`,
            },
          ],
        },
      ],
    })

    return NextResponse.json({ 
      success: true,
      data: output 
    })
    
  } catch (error) {
    console.error('Certificate analysis error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Analysis failed' 
      },
      { status: 500 }
    )
  }
}
