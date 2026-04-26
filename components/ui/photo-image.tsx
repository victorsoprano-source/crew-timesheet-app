"use client"

import { useState, useCallback } from "react"
import { ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface PhotoImageProps {
  src: string | null | undefined
  alt: string
  className?: string
  fallbackClassName?: string
  onLoad?: () => void
  onError?: () => void
  onClick?: () => void
}

/**
 * PhotoImage component with built-in error handling and fallback.
 * Shows a "Photo unavailable" placeholder when the image fails to load.
 */
export function PhotoImage({
  src,
  alt,
  className,
  fallbackClassName,
  onLoad,
  onError,
  onClick,
}: PhotoImageProps) {
  const [hasError, setHasError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const handleError = useCallback(() => {
    console.log("[v0] PhotoImage: Image failed to load:", src?.substring(0, 80))
    setHasError(true)
    setIsLoading(false)
    onError?.()
  }, [src, onError])

  const handleLoad = useCallback(() => {
    console.log("[v0] PhotoImage: Image loaded successfully")
    setIsLoading(false)
    onLoad?.()
  }, [onLoad])

  // If no src or error occurred, show fallback
  if (!src || hasError) {
    return (
      <div 
        className={cn(
          "flex flex-col items-center justify-center bg-muted/50 text-muted-foreground",
          fallbackClassName || className
        )}
        onClick={onClick}
      >
        <ImageOff className="h-6 w-6 mb-1 opacity-50" />
        <span className="text-[10px] text-center px-1">Photo unavailable</span>
      </div>
    )
  }

  return (
    <>
      {isLoading && (
        <div 
          className={cn(
            "flex items-center justify-center bg-muted/30 animate-pulse",
            className
          )}
        >
          <div className="h-4 w-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={cn(className, isLoading && "hidden")}
        onError={handleError}
        onLoad={handleLoad}
        onClick={onClick}
      />
    </>
  )
}

/**
 * Helper function to get photo display URL.
 * Handles full URLs, Vercel Blob paths, and Supabase Storage paths.
 */
export function getPhotoUrl(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  
  // If it's already a full URL, use it directly
  if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
    return pathname
  }
  
  // Route through our API which handles both storage systems
  return `/api/file?pathname=${encodeURIComponent(pathname)}`
}
