"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { searchCostCodes, type CostCode } from "@/app/actions/cost-codes"
import { Search, Loader2 } from "lucide-react"

interface CostCodeAutocompleteProps {
  value: string
  onChange: (value: string) => void
  jobGroup?: string // Optional: filter by job group (e.g., "C-34921")
  placeholder?: string
  className?: string
  disabled?: boolean
}

export function CostCodeAutocomplete({
  value,
  onChange,
  jobGroup = "C-34921", // Default to current job
  placeholder = "Search cost code...",
  className,
  disabled,
}: CostCodeAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value)
  const [suggestions, setSuggestions] = useState<CostCode[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Sync input value with external value
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // Search for cost codes with debounce
  const searchCodes = useCallback(async (query: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        const results = await searchCostCodes(query, jobGroup, 15)
        setSuggestions(results)
      } catch (err) {
        console.error("Error searching cost codes:", err)
        setSuggestions([])
      } finally {
        setIsLoading(false)
      }
    }, 150) // 150ms debounce
  }, [jobGroup])

  // Load initial suggestions on focus
  const handleFocus = async () => {
    setShowDropdown(true)
    if (suggestions.length === 0) {
      searchCodes(inputValue)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false)
        setHighlightedIndex(-1)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    onChange(newValue)
    setShowDropdown(true)
    setHighlightedIndex(-1)
    searchCodes(newValue)
  }

  const handleSelectCode = (costCode: CostCode) => {
    // Format: "120-001 - Install Cables & Terminations (C-34921/34925)"
    const formatted = `${costCode.code} - ${costCode.description} (${costCode.job_group})`
    setInputValue(formatted)
    onChange(formatted)
    setShowDropdown(false)
    setHighlightedIndex(-1)
    inputRef.current?.blur()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || suggestions.length === 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        setShowDropdown(true)
        searchCodes(inputValue)
      }
      return
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setHighlightedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        )
        break
      case "ArrowUp":
        e.preventDefault()
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1)
        break
      case "Enter":
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSelectCode(suggestions[highlightedIndex])
        }
        break
      case "Escape":
        setShowDropdown(false)
        setHighlightedIndex(-1)
        break
      case "Tab":
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          handleSelectCode(suggestions[highlightedIndex])
        }
        setShowDropdown(false)
        break
    }
  }

  // Group suggestions by division (first 3 characters of code)
  const groupedSuggestions = suggestions.reduce((acc, code) => {
    const division = code.code.substring(0, 3)
    if (!acc[division]) {
      acc[division] = []
    }
    acc[division].push(code)
    return acc
  }, {} as Record<string, CostCode[]>)

  // Division labels for C-34921R cost codes
  const divisionLabels: Record<string, string> = {
    "001": "Admin/Personnel",
    "002": "Yard/Mobilization",
    "011": "Mock Up",
    "013": "Rigging",
    "020": "General Work",
    "021": "Supervision",
    "030": "C-33600 Paint",
    "051": "C-33600 Steel Support",
    "052": "C-34921 Steel Support",
    "053": "C-34925 Steel Support",
    "120": "C-34921/34925 Work",
    "130": "C-34921/34925 Paint",
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`pl-8 ${className}`}
          disabled={disabled}
          autoComplete="off"
        />
        {isLoading && (
          <Loader2 className="absolute right-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
          {isLoading && suggestions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground text-center">
              Searching...
            </div>
          ) : suggestions.length === 0 ? (
            <div className="px-3 py-3 text-sm text-muted-foreground text-center">
              No matching codes found
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {Object.entries(groupedSuggestions).map(([division, codes]) => (
                <div key={division}>
                  {/* Division header */}
                  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50 sticky top-0">
                    {divisionLabels[division] || `Division ${division}`}
                  </div>
                  {/* Codes in this division */}
                  {codes.map((code) => {
                    const globalIndex = suggestions.indexOf(code)
                    return (
                      <button
                        key={code.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm transition-colors focus:outline-none ${
                          globalIndex === highlightedIndex
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent hover:text-accent-foreground"
                        }`}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          handleSelectCode(code)
                        }}
                        onMouseEnter={() => setHighlightedIndex(globalIndex)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center min-w-0">
                            <span className="font-mono font-medium shrink-0">{code.code}</span>
                            <span className="mx-1.5 text-muted-foreground shrink-0">-</span>
                            <span className="truncate">{code.description}</span>
                          </div>
                          <span className={`text-xs shrink-0 px-1.5 py-0.5 rounded ${
                            globalIndex === highlightedIndex 
                              ? "bg-primary-foreground/20 text-primary-foreground" 
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {code.job_group}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
