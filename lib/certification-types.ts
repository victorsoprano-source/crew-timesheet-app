/**
 * Official Employee Certification Types
 * Based on jobsite requirements for C-34921R project
 */

export interface CertificationType {
  id: string
  name: string
  shortLabel: string
  /** Legacy names that should map to this certification */
  legacyNames?: string[]
}

/**
 * Official certification list with short labels for display
 */
export const CERTIFICATION_TYPES: CertificationType[] = [
  // Official jobsite certifications
  {
    id: "scaffold-user",
    name: "NYC DOB 4 Hour Supported Scaffold User",
    shortLabel: "Supported Scaffold",
    legacyNames: ["Scaffold Certified", "Scaffold User"],
  },
  {
    id: "aerial-lift",
    name: "Aerial / Scissor Lift Training",
    shortLabel: "Aerial / Scissor Lift",
  },
  {
    id: "sst",
    name: "Site Safety Training (SST)",
    shortLabel: "SST",
  },
  {
    id: "worker-wallet",
    name: "Worker Wallet",
    shortLabel: "Worker Wallet",
  },
  {
    id: "swac",
    name: "SWAC (Secure Worker Access Consortium)",
    shortLabel: "SWAC",
  },
  {
    id: "lead-awareness",
    name: "Lead Awareness",
    shortLabel: "Lead Awareness",
  },
  {
    id: "osha-30",
    name: "OSHA 30-Hour Construction Safety and Health",
    shortLabel: "OSHA 30",
    legacyNames: ["OSHA 30"],
  },
  {
    id: "rigging-16hr",
    name: "16 Hour Designated Rigging",
    shortLabel: "16 HR Rigging",
  },
  {
    id: "mta-track",
    name: "MTA Track Safety Certification",
    shortLabel: "MTA Track Safety",
  },
  // Keep existing certifications that may already be in use
  {
    id: "osha-10",
    name: "OSHA 10-Hour Construction Safety",
    shortLabel: "OSHA 10",
    legacyNames: ["OSHA 10"],
  },
  {
    id: "first-aid",
    name: "First Aid/CPR",
    shortLabel: "First Aid/CPR",
  },
  {
    id: "forklift",
    name: "Forklift Certified",
    shortLabel: "Forklift",
  },
  {
    id: "crane-operator",
    name: "Crane Operator",
    shortLabel: "Crane Operator",
  },
  {
    id: "confined-space",
    name: "Confined Space",
    shortLabel: "Confined Space",
  },
  {
    id: "fall-protection",
    name: "Fall Protection",
    shortLabel: "Fall Protection",
  },
  {
    id: "electrical-license",
    name: "Electrical License",
    shortLabel: "Electrical License",
  },
  {
    id: "plumbing-license",
    name: "Plumbing License",
    shortLabel: "Plumbing License",
  },
  {
    id: "hvac",
    name: "HVAC Certification",
    shortLabel: "HVAC",
  },
  {
    id: "welding",
    name: "Welding Certification",
    shortLabel: "Welding",
  },
  {
    id: "cdl",
    name: "CDL License",
    shortLabel: "CDL",
    legacyNames: ["CDL"],
  },
  // New certifications added
  {
    id: "lead-8hr",
    name: "8-hr Lead Awareness Training",
    shortLabel: "Lead 8hr",
  },
  {
    id: "flagger",
    name: "Flagger Certification",
    shortLabel: "Flagger",
  },
  {
    id: "forklift-operator",
    name: "Forklift Operator",
    shortLabel: "Forklift",
    legacyNames: ["Forklift Certified"],
  },
  {
    id: "mewp",
    name: "MEWP Operator",
    shortLabel: "MEWP",
  },
  {
    id: "susp-scaffold",
    name: "16-hr Suspended Scaffold (SCA-301)",
    shortLabel: "Susp. Scaffold",
  },
  {
    id: "driver-license",
    name: "Driver License",
    shortLabel: "Driver License",
  },
  {
    id: "fire-guard",
    name: "Fire Guard For Torch Operator",
    shortLabel: "Fire Guard",
  },
  {
    id: "confined-8hr",
    name: "8-hr Confined Space",
    shortLabel: "Confined 8hr",
    legacyNames: ["Confined Space"],
  },
  {
    id: "mta-catenary",
    name: "MTA-NYCT CPM Catenary Scaffold",
    shortLabel: "MTA Catenary",
  },
  {
    id: "twp-16hr",
    name: "16-hr Temporary Work Platform Course",
    shortLabel: "TWP 16hr",
  },
  {
    id: "nj-lead",
    name: "New Jersey Lead",
    shortLabel: "NJ Lead",
  },
  {
    id: "twic",
    name: "TWIC",
    shortLabel: "TWIC",
  },
  {
    id: "other",
    name: "Other",
    shortLabel: "Other",
  },
]

/**
 * Get all certification names for dropdown selection
 */
export function getCertificationNames(): string[] {
  return CERTIFICATION_TYPES.map(cert => cert.name)
}

/**
 * Get short label for a certification name (for display on cards)
 */
export function getCertificationShortLabel(name: string): string {
  // First try exact match
  const cert = CERTIFICATION_TYPES.find(c => c.name === name)
  if (cert) return cert.shortLabel
  
  // Try legacy name match
  const legacyCert = CERTIFICATION_TYPES.find(c => 
    c.legacyNames?.some(legacy => legacy.toLowerCase() === name.toLowerCase())
  )
  if (legacyCert) return legacyCert.shortLabel
  
  // Fallback: return the name as-is (possibly truncated)
  return name.length > 20 ? name.substring(0, 18) + "..." : name
}

/**
 * Normalize certification name (map legacy names to current names)
 */
export function normalizeCertificationName(name: string): string {
  // First try exact match
  const cert = CERTIFICATION_TYPES.find(c => c.name === name)
  if (cert) return cert.name
  
  // Try legacy name match
  const legacyCert = CERTIFICATION_TYPES.find(c => 
    c.legacyNames?.some(legacy => legacy.toLowerCase() === name.toLowerCase())
  )
  if (legacyCert) return legacyCert.name
  
  // Return as-is if no match found
  return name
}

/**
 * Calculate certification status based on expiration date
 */
export type CertificationStatus = "valid" | "expiring-soon" | "expired" | "pending"

export function getCertificationStatus(expirationDate: string | null): CertificationStatus {
  if (!expirationDate) return "pending"
  
  const expDate = new Date(expirationDate)
  const today = new Date()
  const thirtyDaysFromNow = new Date()
  thirtyDaysFromNow.setDate(today.getDate() + 30)
  
  if (expDate < today) return "expired"
  if (expDate <= thirtyDaysFromNow) return "expiring-soon"
  return "valid"
}

/**
 * Get status badge color class
 */
export function getStatusBadgeClass(status: CertificationStatus): string {
  switch (status) {
    case "valid":
      return "bg-green-500/20 text-green-400 border-green-500/30"
    case "expiring-soon":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
    case "expired":
      return "bg-red-500/20 text-red-400 border-red-500/30"
    case "pending":
      return "bg-primary/20 text-primary border-primary/30"
    default:
      return "bg-muted text-muted-foreground"
  }
}

/**
 * Get status label
 */
export function getStatusLabel(status: CertificationStatus): string {
  switch (status) {
    case "valid": return "Valid"
    case "expiring-soon": return "Expiring Soon"
    case "expired": return "Expired"
    case "pending": return "Pending Verification"
    default: return "Unknown"
  }
}
