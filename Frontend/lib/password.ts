// Password hashing (bcrypt). Mirrors Backend/utils/passwords.py so hashes written by
// either the Flask backend or these Next.js routes verify on the other side.
// Rows written before hashing was added hold plaintext: verifyPassword still accepts
// them, Flask re-hashes them on login, and Backend/scripts/hash_existing_passwords.py
// converts the rest.
import bcrypt from "bcryptjs"
import { timingSafeEqual } from "crypto"

const BCRYPT_ROUNDS = 12 // same cost as Python's bcrypt.gensalt() default

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, BCRYPT_ROUNDS)

export const isPasswordHash = (stored: string | null | undefined): boolean =>
  typeof stored === "string" && stored.length === 60 && /^\$2[aby]\$/.test(stored)

export const verifyPassword = async (password: string, stored: string | null | undefined): Promise<boolean> => {
  if (!password || !stored) return false
  if (isPasswordHash(stored)) return bcrypt.compare(password, stored)
  // Legacy plaintext row: constant-time compare
  const given = Buffer.from(password)
  const expected = Buffer.from(stored)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
