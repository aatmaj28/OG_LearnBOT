/**
 * Frontend response formatting — mirrors Python's enforce_response_formatting()
 * Applied during rendering so streamed text is always formatted (no blink/swap).
 *
 * Rules:
 * 1. Remove markdown headers (#, ##, etc.)
 * 2. Remove bullet markers (-, *, +)
 * 3. Replace CP1/CP2/CP3 → Checkpoint 1/2/3
 * 4. Ensure numbered lists have proper spacing
 * 5. Clean up excessive blank lines
 *
 * Emojis are generated naturally by the LLM — no frontend insertion needed.
 */

/**
 * Main formatting function — call this on every render of an assistant message.
 * Designed to be idempotent (safe to call repeatedly on the same text).
 */
export function formatBotResponse(text: string): string {
  if (!text || text.trim().length === 0) return text

  // Step 1: Remove markdown headers (# Heading, ## Heading, etc.)
  text = text.replace(/^#{1,6}\s+/gm, '')

  // Step 2: Remove bullet markers (-, *, +) at start of lines
  text = text.replace(/^[\s]*[-*+]\s+/gm, '')

  // Step 3: Replace checkpoint abbreviations
  text = text.replace(/\bCP\s*1\b/gi, 'Checkpoint 1')
  text = text.replace(/\bCP\s*2\b/gi, 'Checkpoint 2')
  text = text.replace(/\bCP\s*3\b/gi, 'Checkpoint 3')

  // Step 4: Ensure numbered items (both "1) " and "1. " formats) have blank lines between them
  // For "1) " format
  text = text.replace(/(\d+\)[^\n]+)\n(\d+\))/g, '$1\n\n$2')
  // For "1. " format
  text = text.replace(/(\d+\.\s[^\n]+)\n(\d+\.\s)/g, '$1\n\n$2')

  // Step 5: Add blank line before numbered list if missing
  text = text.replace(/([^\n])\n(\d+\))/g, '$1\n\n$2')
  text = text.replace(/([^\n])\n(\d+\.\s)/g, '$1\n\n$2')

  // Step 6: Blank line after numbered list if followed by uppercase text
  text = text.replace(/(\d+[).]\s[^\n]+)\n([A-Z][a-z])/g, '$1\n\n$2')

  // Step 7: Clean up excessive blank lines
  text = text.replace(/\n{4,}/g, '\n\n\n')

  // Final cleanup
  text = text.trim()
  text = text.replace(/\n{3,}/g, '\n\n')

  return text
}
