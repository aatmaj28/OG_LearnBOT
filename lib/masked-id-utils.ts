/**
 * Masked ID Utility
 * 
 * Generates deterministic SHA256-based masked_id for users.
 * This allows developers to work with masked identifiers while
 * faculty can access real user data via user_id.
 * 
 * Format: SHA256(user_id) truncated to 64 characters
 */

import crypto from 'crypto'

/**
 * Generates a deterministic masked_id from user_id
 * Same user_id always produces the same masked_id
 * 
 * @param userId - The user's ID (string or number)
 * @returns SHA256 hash truncated to 64 characters
 */
export function generateMaskedId(userId: string | number): string {
  const userIdStr = userId.toString()
  const hash = crypto.createHash('sha256').update(userIdStr).digest('hex')
  // SHA256 produces 64 hex characters, which is perfect for our use case
  return hash
}

/**
 * Validates if a string is a valid masked_id format
 * (64 character hex string)
 */
export function isValidMaskedId(maskedId: string): boolean {
  return /^[a-f0-9]{64}$/i.test(maskedId)
}

/**
 * Gets masked_id from user_id (with caching for performance)
 */
const maskedIdCache = new Map<string, string>()

export function getMaskedId(userId: string | number): string {
  const userIdStr = userId.toString()
  
  if (!maskedIdCache.has(userIdStr)) {
    maskedIdCache.set(userIdStr, generateMaskedId(userIdStr))
  }
  
  return maskedIdCache.get(userIdStr)!
}

/**
 * Clears the masked_id cache (useful for testing)
 */
export function clearMaskedIdCache(): void {
  maskedIdCache.clear()
}

