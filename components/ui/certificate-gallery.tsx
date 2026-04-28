"use client"

import { useState, useEffect, useCallback } from "react"
import { X, ChevronLeft, ChevronRight, Calendar, Award, ImageOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getCertificationShortLabel, getCertificationStatus, getStatusLabel } from "@/lib/certification-types"

export interface CertificatePhoto {
  id: string
  certification_type: string
  photo_pathname: string
  expiration_date: string
  issue_date?: string
  worker_name?: string
}

interface CertificateGalleryProps {
  photos: CertificatePhoto[]
  initialPhotoId?: string
  onClose: () => void
  workerName?: string
}

export function CertificateGallery({ 
  photos, 
  initialPhotoId, 
  onClose,
  workerName 
}: CertificateGalleryProps) {
  // Find initial index
  const initialIndex = initialPhotoId 
    ? photos.findIndex(p => p.id === initialPhotoId)
    : 0
  
  const [currentIndex, setCurrentIndex] = useState(Math.max(0, initialIndex))
  const [imageError, setImageError] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  
  const currentPhoto = photos[currentIndex]
  
  // Group photos by certification type for display
  const photosByType = photos.reduce((acc, photo) => {
    const type = photo.certification_type
    if (!acc[type]) acc[type] = []
    acc[type].push(photo)
    return acc
  }, {} as Record<string, CertificatePhoto[]>)
  
  // Get position info
  const currentTypePhotos = photosByType[currentPhoto?.certification_type] || []
  const currentTypeIndex = currentTypePhotos.findIndex(p => p.id === currentPhoto?.id) + 1
  
  const goToPrevious = useCallback(() => {
    setImageError(false)
    setIsLoading(true)
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1))
  }, [photos.length])
  
  const goToNext = useCallback(() => {
    setImageError(false)
    setIsLoading(true)
    setCurrentIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0))
  }, [photos.length])
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft") goToPrevious()
      else if (e.key === "ArrowRight") goToNext()
    }
    
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [onClose, goToPrevious, goToNext])
  
  // Prevent body scroll when gallery is open
  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])
  
  if (!currentPhoto) return null
  
  const photoUrl = currentPhoto.photo_pathname.startsWith("http") 
    ? currentPhoto.photo_pathname 
    : `/api/file?pathname=${encodeURIComponent(currentPhoto.photo_pathname)}`
  
  const status = getCertificationStatus(currentPhoto.expiration_date)
  
  return (
    <div 
      className="fixed inset-0 z-[100] flex flex-col bg-black/95"
      onClick={onClose}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 min-w-0">
          {workerName && (
            <p className="text-sm text-white/60 truncate">{workerName}</p>
          )}
          <h2 className="text-lg font-semibold text-white truncate flex items-center gap-2">
            <Award className="h-4 w-4 text-primary shrink-0" />
            {getCertificationShortLabel(currentPhoto.certification_type)}
          </h2>
          <p className="text-xs text-white/60" title={currentPhoto.certification_type}>
            {currentPhoto.certification_type}
          </p>
        </div>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-white/20 shrink-0"
        >
          <X className="h-6 w-6" />
        </Button>
      </div>
      
      {/* Main Image Area */}
      <div 
        className="flex-1 flex items-center justify-center relative px-4 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Previous Button */}
        {photos.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={goToPrevious}
            className="absolute left-2 z-10 text-white hover:bg-white/20 h-12 w-12 rounded-full"
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
        )}
        
        {/* Image Container */}
        <div className="relative max-w-full max-h-full flex items-center justify-center">
          {isLoading && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-10 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </div>
          )}
          
          {imageError ? (
            <div className="flex flex-col items-center justify-center text-white/60 bg-card/20 rounded-xl p-8">
              <ImageOff className="h-16 w-16 mb-4 opacity-50" />
              <p className="text-lg font-medium">Photo unavailable</p>
              <p className="text-sm mt-1">Unable to load this certificate photo</p>
            </div>
          ) : (
            <img
              src={photoUrl}
              alt={currentPhoto.certification_type}
              className={`max-w-full max-h-[60vh] object-contain rounded-lg transition-opacity duration-200 ${
                isLoading ? "opacity-0" : "opacity-100"
              }`}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setImageError(true)
                setIsLoading(false)
              }}
            />
          )}
        </div>
        
        {/* Next Button */}
        {photos.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            onClick={goToNext}
            className="absolute right-2 z-10 text-white hover:bg-white/20 h-12 w-12 rounded-full"
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        )}
      </div>
      
      {/* Footer - Photo Info */}
      <div 
        className="p-4 bg-gradient-to-t from-black/80 to-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between max-w-lg mx-auto">
          {/* Expiration Info */}
          <div className="flex items-center gap-2 text-white/80">
            <Calendar className="h-4 w-4" />
            <div>
              <p className="text-xs text-white/60">Expires</p>
              <p className="text-sm font-medium">
                {new Date(currentPhoto.expiration_date).toLocaleDateString()}
              </p>
            </div>
            <span className={`ml-2 text-xs px-2 py-0.5 rounded ${
              status === "valid" ? "bg-green-500/20 text-green-400" :
              status === "expiring" ? "bg-yellow-500/20 text-yellow-400" :
              status === "expired" ? "bg-red-500/20 text-red-400" :
              "bg-gray-500/20 text-gray-400"
            }`}>
              {getStatusLabel(status)}
            </span>
          </div>
          
          {/* Photo Counter */}
          {photos.length > 1 && (
            <div className="text-white/60 text-sm">
              <span className="text-white font-medium">{currentIndex + 1}</span>
              <span> / {photos.length}</span>
              {currentTypePhotos.length > 1 && (
                <span className="ml-2 text-xs">
                  ({currentTypeIndex}/{currentTypePhotos.length} in {getCertificationShortLabel(currentPhoto.certification_type)})
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Thumbnail Strip (for multiple photos) */}
      {photos.length > 1 && (
        <div 
          className="px-4 pb-4 overflow-x-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex gap-2 justify-center">
            {photos.map((photo, index) => {
              const thumbUrl = photo.photo_pathname.startsWith("http")
                ? photo.photo_pathname
                : `/api/file?pathname=${encodeURIComponent(photo.photo_pathname)}`
              
              return (
                <button
                  key={photo.id}
                  onClick={() => {
                    setImageError(false)
                    setIsLoading(true)
                    setCurrentIndex(index)
                  }}
                  className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                    index === currentIndex 
                      ? "border-primary ring-2 ring-primary/50" 
                      : "border-white/20 hover:border-white/40"
                  }`}
                >
                  <ThumbnailImage src={thumbUrl} alt={photo.certification_type} />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Thumbnail with error handling
function ThumbnailImage({ src, alt }: { src: string; alt: string }) {
  const [error, setError] = useState(false)
  
  if (error) {
    return (
      <div className="w-full h-full bg-muted flex items-center justify-center">
        <ImageOff className="h-4 w-4 text-muted-foreground" />
      </div>
    )
  }
  
  return (
    <img
      src={src}
      alt={alt}
      className="w-full h-full object-cover"
      onError={() => setError(true)}
    />
  )
}
