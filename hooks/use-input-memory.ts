"use client"

import { useState, useEffect, useCallback } from "react"

interface InputMemoryOptions {
  fieldType: string // e.g., "jobCode", "equipment", "notes"
  maxSuggestions?: number // Maximum number of suggestions to store
}

interface SuggestionEntry {
  value: string
  count: number // How many times used
  lastUsed: number // Timestamp
}

const STORAGE_KEY_PREFIX = "crew-timesheet-input-memory-"

export function useInputMemory({ fieldType, maxSuggestions = 20 }: InputMemoryOptions) {
  const [suggestions, setSuggestions] = useState<SuggestionEntry[]>([])
  const storageKey = `${STORAGE_KEY_PREFIX}${fieldType}`

  // Load suggestions from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        const parsed = JSON.parse(stored) as SuggestionEntry[]
        // Sort by count (most used) then by lastUsed (most recent)
        const sorted = parsed.sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count
          return b.lastUsed - a.lastUsed
        })
        setSuggestions(sorted)
      }
    } catch (e) {
      console.error("Error loading input memory:", e)
    }
  }, [storageKey])

  // Save a value to memory
  const saveValue = useCallback((value: string) => {
    if (!value.trim()) return

    const normalizedValue = value.trim()

    setSuggestions(prev => {
      // Check if value already exists
      const existingIndex = prev.findIndex(
        s => s.value.toLowerCase() === normalizedValue.toLowerCase()
      )

      let updated: SuggestionEntry[]

      if (existingIndex !== -1) {
        // Update existing entry
        updated = [...prev]
        updated[existingIndex] = {
          value: normalizedValue, // Keep the latest casing
          count: updated[existingIndex].count + 1,
          lastUsed: Date.now(),
        }
      } else {
        // Add new entry
        updated = [
          {
            value: normalizedValue,
            count: 1,
            lastUsed: Date.now(),
          },
          ...prev,
        ]
      }

      // Sort by count then lastUsed
      updated.sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return b.lastUsed - a.lastUsed
      })

      // Limit to max suggestions
      updated = updated.slice(0, maxSuggestions)

      // Save to localStorage
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated))
      } catch (e) {
        console.error("Error saving input memory:", e)
      }

      return updated
    })
  }, [storageKey, maxSuggestions])

  // Get filtered suggestions based on input
  const getFilteredSuggestions = useCallback((input: string, limit = 5): string[] => {
    if (!input.trim()) {
      // Return top recent/frequent suggestions when input is empty
      return suggestions.slice(0, limit).map(s => s.value)
    }

    const lowerInput = input.toLowerCase()
    
    // Filter suggestions that match the input
    const filtered = suggestions
      .filter(s => s.value.toLowerCase().includes(lowerInput))
      .slice(0, limit)
      .map(s => s.value)

    return filtered
  }, [suggestions])

  // Get all suggestions (for showing recent when focused)
  const getRecentSuggestions = useCallback((limit = 5): string[] => {
    return suggestions.slice(0, limit).map(s => s.value)
  }, [suggestions])

  // Clear all suggestions for this field type
  const clearSuggestions = useCallback(() => {
    setSuggestions([])
    try {
      localStorage.removeItem(storageKey)
    } catch (e) {
      console.error("Error clearing input memory:", e)
    }
  }, [storageKey])

  return {
    suggestions,
    saveValue,
    getFilteredSuggestions,
    getRecentSuggestions,
    clearSuggestions,
  }
}
