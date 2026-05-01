/**
 * Equipment Master List
 * Permanent list of equipment available for selection in Daily Reports
 */

export interface Equipment {
  id: string
  name: string
  type: "Fork Lift" | "Man Lift" | "Arrow Board" | "Other"
  unitNumber: string
  model?: string
}

export const EQUIPMENT_MASTER_LIST: Equipment[] = [
  {
    id: "forklift-10277427",
    name: "Blue Fork Lift - 10277427",
    type: "Fork Lift",
    unitNumber: "10277427",
  },
  {
    id: "manlift-ab206050-600aj",
    name: "Man Lift AB206050 - 600AJ",
    type: "Man Lift",
    unitNumber: "AB206050",
    model: "600AJ",
  },
  {
    id: "manlift-n89525-460sj",
    name: "Man Lift N89525 - 460SJ",
    type: "Man Lift",
    unitNumber: "N89525",
    model: "460SJ",
  },
  {
    id: "forklift-ab804312",
    name: "Fork Lift AB804312",
    type: "Fork Lift",
    unitNumber: "AB804312",
  },
  {
    id: "arrowboard-ababab23",
    name: "Arrow Board ABABAB23",
    type: "Arrow Board",
    unitNumber: "ABABAB23",
  },
  {
    id: "manlift-ab204615-sj45t",
    name: "Man Lift AB204615 - SJ45T",
    type: "Man Lift",
    unitNumber: "AB204615",
    model: "SJ45T",
  },
]

// Get equipment grouped by type for dropdown display
export function getEquipmentByType() {
  const grouped: Record<string, Equipment[]> = {}
  
  for (const eq of EQUIPMENT_MASTER_LIST) {
    if (!grouped[eq.type]) {
      grouped[eq.type] = []
    }
    grouped[eq.type].push(eq)
  }
  
  return grouped
}

// Get equipment name by ID
export function getEquipmentNameById(id: string): string {
  const eq = EQUIPMENT_MASTER_LIST.find(e => e.id === id)
  return eq?.name || id
}

// Get short display name (unit number only)
export function getEquipmentShortName(nameOrId: string): string {
  // Try to find by ID first
  const eq = EQUIPMENT_MASTER_LIST.find(e => e.id === nameOrId || e.name === nameOrId)
  if (eq) {
    return eq.unitNumber + (eq.model ? ` - ${eq.model}` : "")
  }
  // Fallback: return the input
  return nameOrId
}
