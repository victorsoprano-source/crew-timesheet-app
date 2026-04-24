"use server"

import { createClient } from "@/lib/supabase/server"

export interface CostCode {
  id: string
  code: string
  description: string
  job_group: string
  created_at: string
}

/**
 * Search cost codes by code or description
 * Returns matching codes for autocomplete
 */
export async function searchCostCodes(
  query: string,
  jobGroup?: string,
  limit: number = 10
): Promise<CostCode[]> {
  const supabase = await createClient()
  
  let queryBuilder = supabase
    .from("cost_codes")
    .select("*")
  
  // Filter by job group if provided
  if (jobGroup) {
    queryBuilder = queryBuilder.eq("job_group", jobGroup)
  }
  
  // Search by code or description
  if (query.trim()) {
    // Search in both code and description
    queryBuilder = queryBuilder.or(`code.ilike.%${query}%,description.ilike.%${query}%`)
  }
  
  const { data, error } = await queryBuilder
    .order("code", { ascending: true })
    .limit(limit)
  
  if (error) {
    console.error("Error searching cost codes:", error)
    return []
  }
  
  return data || []
}

/**
 * Get all cost codes for a job group
 */
export async function getCostCodesByJobGroup(jobGroup: string): Promise<CostCode[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("cost_codes")
    .select("*")
    .eq("job_group", jobGroup)
    .order("code", { ascending: true })
  
  if (error) {
    console.error("Error fetching cost codes:", error)
    return []
  }
  
  return data || []
}

/**
 * Get all unique job groups
 */
export async function getJobGroups(): Promise<string[]> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from("cost_codes")
    .select("job_group")
    .order("job_group", { ascending: true })
  
  if (error) {
    console.error("Error fetching job groups:", error)
    return []
  }
  
  // Get unique job groups
  const uniqueGroups = [...new Set(data?.map(d => d.job_group) || [])]
  return uniqueGroups
}

// Note: Helper functions like formatCostCode and parseCostCodeDisplay
// are defined locally in components that need them, since "use server"
// files can only export async functions.
