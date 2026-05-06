export const TEAMS = [
  "RIGGING",
  "COLUMNS", 
  "WOOD",
  "CONTAINMENT",
  "BLASTERS",
  "TRACK",
] as const

export type Team = (typeof TEAMS)[number]

export const DEFAULT_TEAM: Team = "RIGGING"

export function isValidTeam(team: string): team is Team {
  return TEAMS.includes(team as Team)
}

export function getTeamDisplayName(team: Team): string {
  return `${team} CREW`
}
