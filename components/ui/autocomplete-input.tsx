"use client"

import { useState, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { useInputMemory } from "@/hooks/use-input-memory"
import { Clock, TrendingUp } from "lucide-react"

interface AutocompleteInputProps {
  fieldType: string // e.g., "jobCode", "equipment", "notes"
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
  disabled?: boolean
  autoSaveOnBlur?: boolean // Automatically save value when input loses focus
}

export function AutocompleteInput({
  fieldType,
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  disabled,
  autoSaveOnBlur = true,
}: AutocompleteInputProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { saveValue, getFilteredSuggestions, getRecentSuggestions } = useInputMemory({
    fieldType,
    maxSuggestions: 20,
  })

  // Get suggestions based on current input
  const filteredSuggestions = getFilteredSuggestions(value, 5)
  const recentSuggestions = getRecentSuggestions(5)

  // Determine which suggestions to show
  const displaySuggestions = value.trim() 
    ? filteredSuggestions 
    : recentSuggestions

  // Filter out the current exact value from suggestions
  const visibleSuggestions = displaySuggestions.filter(
    s => s.toLowerCase() !== value.toLowerCase()
  )

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleFocus = () => {
    setIsFocused(true)
    setShowSuggestions(true)
  }

  const handleBlur = () => {
    setIsFocused(false)
    // Don't immediately hide suggestions - let click handler work first
    setTimeout(() => {
      setShowSuggestions(false)
    }, 150)

    // Auto-save value on blur if enabled
    if (autoSaveOnBlur && value.trim()) {
      saveValue(value)
    }

    onBlur?.()
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    onChange(newValue)
    setShowSuggestions(true)
  }

  const handleSelectSuggestion = (suggestion: string) => {
    onChange(suggestion)
    saveValue(suggestion)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) {
      saveValue(value)
    }
    if (e.key === "Escape") {
      setShowSuggestions(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        disabled={disabled}
        autoComplete="off"
      />

      {/* Suggestions dropdown */}
      {showSuggestions && visibleSuggestions.length > 0 && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
          {!value.trim() && (
            <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              Recent
            </div>
          )}
          {value.trim() && (
            <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" />
              Suggestions
            </div>
          )}
          <div className="max-h-40 overflow-y-auto">
            {visibleSuggestions.map((suggestion, index) => (
              <button
                key={`${suggestion}-${index}`}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors focus:bg-accent focus:text-accent-foreground focus:outline-none"
                onMouseDown={(e) => {
                  e.preventDefault() // Prevent blur before click registers
                  handleSelectSuggestion(suggestion)
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
