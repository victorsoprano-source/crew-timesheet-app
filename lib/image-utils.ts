/**
 * Image utilities for photo upload
 * Handles conversion to JPEG, EXIF stripping, and normalization
 */

/**
 * Maximum dimensions for uploaded images
 * Larger images will be scaled down proportionally
 */
const MAX_WIDTH = 1280
const MAX_HEIGHT = 1280
const JPEG_QUALITY = 0.85

/**
 * Convert any image file to JPEG format
 * - Strips EXIF metadata by redrawing to canvas
 * - Normalizes orientation
 * - Scales down large images
 * - Returns a new File object with image/jpeg type
 */
export function convertToJpeg(
  file: File,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
    filename?: string
  } = {}
): Promise<File> {
  const {
    maxWidth = MAX_WIDTH,
    maxHeight = MAX_HEIGHT,
    quality = JPEG_QUALITY,
    filename,
  } = options

  return new Promise((resolve, reject) => {
    // Create image element to load the file
    const img = new Image()
    
    // Create object URL for the file
    const objectUrl = URL.createObjectURL(file)
    
    // Handle load errors
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image. The file may be corrupted or in an unsupported format.'))
    }

    img.onload = () => {
      // Clean up object URL
      URL.revokeObjectURL(objectUrl)
      
      try {
        // Calculate scaled dimensions
        let width = img.naturalWidth || img.width
        let height = img.naturalHeight || img.height
        
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        // Create canvas and draw image
        // This strips EXIF data since canvas doesn't preserve it
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Failed to create canvas context'))
          return
        }

        // Fill with white background (for transparent images)
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, width, height)

        // Draw image (this normalizes orientation and strips EXIF)
        ctx.drawImage(img, 0, 0, width, height)

        // Convert to JPEG blob
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to convert image to JPEG'))
              return
            }

            // Generate normalized filename
            const timestamp = Date.now()
            const normalizedFilename = filename || `photo_${timestamp}.jpg`

            // Create new File object with JPEG type
            const jpegFile = new File([blob], normalizedFilename, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            })

            resolve(jpegFile)
          },
          'image/jpeg',
          quality
        )
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Image conversion failed'))
      }
    }

    // Load image from object URL
    img.src = objectUrl
  })
}

/**
 * Check if a file is an image based on type or extension
 */
export function isImageFile(file: File): boolean {
  // Check MIME type
  if (file.type.startsWith('image/')) {
    return true
  }
  // Check common image extensions as fallback
  const ext = file.name.toLowerCase().split('.').pop()
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tiff', 'tif']
  return imageExtensions.includes(ext || '')
}

/**
 * Get a display-friendly error message for image conversion failures
 */
export function getImageErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes('corrupted')) {
      return 'This image appears to be corrupted. Please try another photo.'
    }
    if (error.message.includes('unsupported')) {
      return 'This image format is not supported. Please use a JPEG or PNG photo.'
    }
    return error.message
  }
  return 'Failed to process image. Please try another photo.'
}

/**
 * Prepare a file for upload by converting to JPEG
 * Returns the converted file and any error message
 */
export async function prepareImageForUpload(
  file: File,
  index: number
): Promise<{ file: File | null; error: string | null }> {
  try {
    // Check if it's an image
    if (!isImageFile(file)) {
      return { file: null, error: 'Only image files are allowed' }
    }

    // Check file size before processing (50MB limit for raw files)
    if (file.size > 50 * 1024 * 1024) {
      return { file: null, error: 'Image is too large. Please use a smaller photo.' }
    }

    // Convert to JPEG
    const jpegFile = await convertToJpeg(file, {
      filename: `photo_${Date.now()}_${index}.jpg`,
    })

    // Verify the converted file isn't too large
    if (jpegFile.size > 10 * 1024 * 1024) {
      return { file: null, error: 'Image is too large even after compression. Please use a smaller photo.' }
    }

    return { file: jpegFile, error: null }
  } catch (err) {
    return { file: null, error: getImageErrorMessage(err) }
  }
}
