"use server"

import { createClient } from "@/lib/supabase/server"
import { DEFAULT_TEAM, isValidTeam, type Team } from "@/lib/teams"

export async function getCurrentUserTeam(): Promise<Team> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return DEFAULT_TEAM
    }

    const team = user.user_metadata?.team
    if (team && isValidTeam(team)) {
      return team
    }

    return DEFAULT_TEAM
  } catch (error) {
    console.error("Error getting user team:", error)
    return DEFAULT_TEAM
  }
}

export async function getCurrentUser(): Promise<{ email: string; team: Team } | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return null
    }

    const team = user.user_metadata?.team
    return {
      email: user.email || "",
      team: team && isValidTeam(team) ? team : DEFAULT_TEAM,
    }
  } catch (error) {
    console.error("Error getting current user:", error)
    return null
  }
}
