/**
 * PII Masking Utility
 * 
 * Implements strict PII masking to protect sensitive data:
 * - STRICT PII: NUID, NAME, EMAIL (always masked for non-faculty)
 * - Optional PII: SSN, DOB, Age (if present in data)
 * 
 * Purpose: Protect developers from seeing production-sensitive data in DEV environment
 * - PROD: Faculty see clean/unmasked data (they need real PII for their work)
 * - PROD: Students see their own data unmasked (they only access their own data anyway)
 * - DEV: ALL users see masked data (protect developers from PROD-sensitive information)
 * - Exception: Users always see their own data unmasked (handled in maskUserData)
 * 
 * Note: DEV databases should store masked data to prevent accidental exposure
 */

import type { User, UserRole } from './types'

export interface MaskingContext {
  requestingUserId?: string
  requestingUserRole?: UserRole | null
  environment?: string
}

/**
 * Determines if PII masking should be applied based on context
 * 
 * Rules:
 * - PRODUCTION: Faculty see all unmasked data (they need real PII for their work)
 * - PRODUCTION: Students see their own data unmasked (they only see their own data anyway)
 * - PRODUCTION: Students seeing other students' data would be masked (access controls prevent this)
 * - DEVELOPMENT: ALL users (including faculty) see masked data
 *   → This protects developers from accidentally seeing sensitive production data
 * - Exception: Users always see their own data unmasked (handled in maskUserData via isOwnData check)
 * - Unauthenticated requests always mask
 */
export function shouldMaskPII(context: MaskingContext): boolean {
  const { requestingUserRole, environment } = context
  
  const isProduction = environment === 'production' || environment === 'prod'
  
  // PRODUCTION: Only faculty see unmasked data for OTHER users (clean data for their portal)
  // Note: Students see their own data unmasked via isOwnData check in maskUserData()
  if (isProduction && requestingUserRole === 'faculty') {
    return false // No masking for faculty in production
  }
  
  // All other cases: mask PII
  // - PROD: Students see masked data for OTHER users (but they only access their own)
  // - DEV: Everyone sees masked (protect developers from PROD-sensitive data)
  // - Unauthenticated requests always mask
  // Note: Users seeing their own data is handled separately via isOwnData check
  return true
}

/**
 * Masks email address (STRICT PII)
 * Example: "john.doe@northeastern.edu" -> "jo***@northeastern.edu"
 */
export function maskEmail(email: string | undefined | null): string | undefined {
  if (!email) return email
  
  const [local, domain] = email.split('@')
  if (!domain) return email // Invalid email format, return as-is
  
  // Mask local part: show first 2 chars, mask the rest
  const maskedLocal = local.length > 2 
    ? `${local.substring(0, 2)}${'*'.repeat(Math.min(local.length - 2, 10))}`
    : '**'
  
  return `${maskedLocal}@${domain}`
}

/**
 * Masks name (STRICT PII)
 * Example: "John Doe" -> "J*** D**"
 */
export function maskName(name: string | undefined | null): string | undefined {
  if (!name) return name
  
  const trimmed = name.trim()
  if (trimmed.length === 0) return name
  
  const parts = trimmed.split(/\s+/)
  if (parts.length === 0) return '***'
  
  // Mask each name part
  const maskedParts = parts.map(part => {
    if (part.length === 0) return ''
    const firstChar = part[0].toUpperCase()
    const masked = '*'.repeat(Math.min(part.length - 1, 5))
    return `${firstChar}${masked}`
  })
  
  return maskedParts.join(' ')
}

/**
 * Masks NUID (STRICT PII - Northeastern University ID)
 * Example: "12345678" -> "******78" (show last 2 digits only)
 */
export function maskNuid(nuid: string | undefined | null): string | undefined {
  if (!nuid) return nuid
  
  // Show last 2 digits only
  if (nuid.length <= 2) {
    return '**'
  }
  
  return `${'*'.repeat(nuid.length - 2)}${nuid.slice(-2)}`
}

/**
 * Masks SSN (if present)
 * Example: "123-45-6789" -> "***-**-6789"
 */
export function maskSSN(ssn: string | undefined | null): string | undefined {
  if (!ssn) return ssn
  
  // Remove any formatting
  const clean = ssn.replace(/[-\s]/g, '')
  
  // Show last 4 digits only
  if (clean.length < 4) {
    return '***'
  }
  
  const last4 = clean.slice(-4)
  return `***-**-${last4}`
}

/**
 * Masks Date of Birth (if present)
 * Example: "2000-01-15" -> "****-**-**" or "2000-**-**" (show year only)
 */
export function maskDOB(dob: string | Date | undefined | null): string | undefined {
  if (!dob) return dob
  
  let dobStr: string
  if (dob instanceof Date) {
    dobStr = dob.toISOString().split('T')[0] // YYYY-MM-DD
  } else {
    dobStr = dob
  }
  
  // Mask day and month, optionally show year
  // For stricter masking, mask everything
  const parts = dobStr.split(/[-\/]/)
  if (parts.length >= 3) {
    // Show year only: "2000-**-**"
    return `${parts[0]}-**-**`
  }
  
  return '****-**-**'
}

/**
 * Masks age (if present)
 * Returns masked age as range or removed
 */
export function maskAge(age: number | string | undefined | null): string | undefined {
  if (age === null || age === undefined) return undefined
  
  // Convert to number if string
  const ageNum = typeof age === 'string' ? parseInt(age, 10) : age
  if (isNaN(ageNum)) return '***'
  
  // Return age range instead of exact age (e.g., "20-25" or "20s")
  if (ageNum < 18) return '<18'
  if (ageNum < 25) return '18-24'
  if (ageNum < 35) return '25-34'
  if (ageNum < 45) return '35-44'
  if (ageNum < 55) return '45-54'
  return '55+'
}

/**
 * Masks degree and major (less strict but still PII)
 */
export function maskDegree(degree: string | undefined | null): string | undefined {
  if (!degree) return degree
  return '***'
}

export function maskMajor(major: string | undefined | null): string | undefined {
  if (!major) return major
  return '***'
}

/**
 * Main function to mask PII in User object based on context
 * 
 * PRODUCTION:
 * - Faculty: See all unmasked data (clean data for their portal)
 * - Students: See their own data unmasked (they only access their own data anyway)
 * 
 * DEVELOPMENT:
 * - All users: See masked data (protects developers from PROD-sensitive information)
 * - Exception: Users see their own data unmasked (for user experience)
 */
export function maskUserData(user: User, context: MaskingContext): User {
  // Check if masking should be applied
  if (!shouldMaskPII(context)) {
    // PRODUCTION + Faculty: No masking, return clean data
    // Still remove password for security
    return {
      ...user,
      password: '[REDACTED]' // Never return password
    }
  }
  
  // Check if user is requesting their own data
  const isOwnData = context.requestingUserId && user.id === context.requestingUserId
  
  // Users always see their own unmasked data (except password)
  // This applies in both PROD and DEV for user experience
  // Since students only see their own data anyway, this means they see unmasked data
  if (isOwnData) {
    return {
      ...user,
      password: '[REDACTED]' // Never return password
    }
  }
  
  // Apply strict masking
  return {
    ...user,
    password: '[REDACTED]', // Never return password
    email: maskEmail(user.email),
    name: maskName(user.name),
    nuid: maskNuid(user.nuid),
    // Optional PII fields (if they exist in User type)
    ssn: user.ssn ? maskSSN(user.ssn) : undefined,
    dob: user.dob ? maskDOB(user.dob) : undefined,
    age: user.age ? maskAge(user.age) : undefined,
    // Less strict but still mask
    degree: maskDegree(user.degree),
    major: maskMajor(user.major)
  }
}

/**
 * Strips grades from text content (STRICT requirement)
 * Removes grade mentions, scores, GPA references, etc.
 */
export function stripGrades(text: string): string {
  if (!text) return text
  
  let cleaned = text
  
  // Remove GPA mentions: "GPA: 3.5", "3.5 GPA", "gpa of 3.5"
  cleaned = cleaned.replace(/\bGPA\s*:?\s*\d+\.?\d*\b/gi, '[GRADE_REDACTED]')
  cleaned = cleaned.replace(/\b\d+\.?\d*\s*GPA\b/gi, '[GRADE_REDACTED]')
  cleaned = cleaned.replace(/\bGPA\s+(?:of|is)\s+\d+\.?\d*\b/gi, '[GRADE_REDACTED]')
  
  // Remove grade mentions: "Grade: A", "A grade", "got an A"
  cleaned = cleaned.replace(/\bGrade\s*:?\s*[A-F][+-]?\b/gi, '[GRADE_REDACTED]')
  cleaned = cleaned.replace(/\b[A-F][+-]?\s+grade\b/gi, '[GRADE_REDACTED]')
  cleaned = cleaned.replace(/\bgot\s+(?:an?|the)?\s+[A-F][+-]?\b/gi, '[GRADE_REDACTED]')
  
  // Remove score/percentage: "Score: 85%", "85%", "scored 90"
  cleaned = cleaned.replace(/\bScore\s*:?\s*\d+\s*%?\b/gi, '[GRADE_REDACTED]')
  cleaned = cleaned.replace(/\b\d+\s*%\s*(?:score|grade)\b/gi, '[GRADE_REDACTED]')
  cleaned = cleaned.replace(/\bscored\s+\d+\s*%?\b/gi, '[GRADE_REDACTED]')
  
  // Remove percentage ranges with context: "85-90%"
  cleaned = cleaned.replace(/\b\d+-\d+\s*%\b/g, '[GRADE_REDACTED]')
  
  // Remove numeric grades with context: "grade of 85", "85 out of 100"
  cleaned = cleaned.replace(/\bgrade\s+(?:of|is)\s+\d+\b/gi, '[GRADE_REDACTED]')
  cleaned = cleaned.replace(/\b\d+\s+out\s+of\s+\d+\b/g, '[GRADE_REDACTED]')
  
  // Remove pass/fail with context: "passed with", "failed with"
  cleaned = cleaned.replace(/\b(?:passed|failed)\s+with\s+\d+\s*%?\b/gi, '[GRADE_REDACTED]')
  
  return cleaned
}

// Note: Prof. Brian-specific checks removed - ALL faculty members now have access
// This function is kept for backward compatibility but no longer used
export function isProfBrian(email: string | undefined, name: string | undefined): boolean {
  // All faculty have access, so this check is no longer needed
  // Keeping function for backward compatibility
  return false
}

