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
 * 6. Add 1-2 emojis if none are present
 */

// Emoji regex covering common emoji ranges
const EMOJI_REGEX = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu

// Map of topic keywords → relevant emojis for smart insertion
const TOPIC_EMOJI_MAP: [RegExp, string][] = [
  [/\b(checkpoint|step|progress)\b/i, '📌'],
  [/\b(formula|equation|calculate|math|compute)\b/i, '🔢'],
  [/\b(great|excellent|awesome|perfect|correct|well done|good job|nice)\b/i, '🎉'],
  [/\b(think|consider|reflect|reason|understand)\b/i, '💡'],
  [/\b(hint|clue|tip)\b/i, '💡'],
  [/\b(try|attempt|practice)\b/i, '✏️'],
  [/\b(time value|interest|compound|discount|annuity|bond|stock|finance|investment)\b/i, '📊'],
  [/\b(read|book|chapter|module|textbook)\b/i, '📖'],
  [/\b(question|ask|doubt)\b/i, '❓'],
  [/\b(important|key|critical|note|remember)\b/i, '⚠️'],
  [/\b(example|instance|scenario)\b/i, '📝'],
  [/\b(welcome|hello|hi there|greet)\b/i, '👋'],
]

// Fallback emojis when no topic match
const FALLBACK_EMOJIS = ['📚', '✅', '💬', '🔍']

/**
 * Count emojis already present in text
 */
function countEmojis(text: string): number {
  const matches = text.match(EMOJI_REGEX)
  return matches ? matches.length : 0
}

/**
 * Pick 1-2 emojis based on content keywords
 */
function pickEmojis(text: string, count: number): string[] {
  const chosen: string[] = []
  const lowerText = text.toLowerCase()

  for (const [pattern, emoji] of TOPIC_EMOJI_MAP) {
    if (chosen.length >= count) break
    if (pattern.test(lowerText) && !chosen.includes(emoji)) {
      chosen.push(emoji)
    }
  }

  // Fill remaining slots with fallback emojis
  let fallbackIdx = 0
  while (chosen.length < count && fallbackIdx < FALLBACK_EMOJIS.length) {
    const fb = FALLBACK_EMOJIS[fallbackIdx]
    if (!chosen.includes(fb)) {
      chosen.push(fb)
    }
    fallbackIdx++
  }

  return chosen
}

/**
 * Insert emojis at natural positions (end of first sentence, end of response)
 */
function insertEmojis(text: string, emojis: string[]): string {
  if (emojis.length === 0) return text

  const lines = text.split('\n')

  // Strategy: put first emoji after the first sentence/paragraph ending
  // put second emoji (if any) near the end
  let firstInserted = false

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!firstInserted && trimmed.length > 10) {
      // Insert after first substantive line that ends with punctuation
      if (/[.!?:]\s*$/.test(trimmed) || (i < lines.length - 1 && lines[i + 1].trim() === '')) {
        lines[i] = lines[i].trimEnd() + ' ' + emojis[0]
        firstInserted = true
        continue
      }
    }
  }

  // If we couldn't find a natural break, append to first non-empty line
  if (!firstInserted && lines.length > 0) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().length > 0) {
        lines[i] = lines[i].trimEnd() + ' ' + emojis[0]
        firstInserted = true
        break
      }
    }
  }

  // Second emoji: append to the last non-empty line
  if (emojis.length > 1) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim().length > 0) {
        lines[i] = lines[i].trimEnd() + ' ' + emojis[1]
        break
      }
    }
  }

  return lines.join('\n')
}

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

  // Step 8: Add 1-2 emojis if text doesn't already have any
  const existingEmojiCount = countEmojis(text)
  if (existingEmojiCount === 0 && text.length > 20) {
    // Pick how many: 1 for short responses, 2 for longer ones
    const emojiCount = text.length > 200 ? 2 : 1
    const emojis = pickEmojis(text, emojiCount)
    text = insertEmojis(text, emojis)
  }

  // Final cleanup
  text = text.trim()
  text = text.replace(/\n{3,}/g, '\n\n')

  return text
}
