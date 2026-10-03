/**
 * Answer Mode Prompt System
 * 
 * This module exports prompt functions for the three answer modes:
 * - Lenient: Answers plainly and warmly, no quizzing
 * - Normal: Answers, states conditions and exceptions, then one short check-for-understanding
 * - Strict: Answers, quotes the exact policy wording, states every condition, exception and
 *   deadline, and names what the employee must do and by when
 * 
 * All three answer only from the company documents and always cite the source file.
 * Deep Thinking Mode can be combined with any mode to make answers more thorough (not longer).
 */

export type TAMode = 'lenient' | 'normal' | 'strict'

export { getLenientPrompts } from './lenient'
export { getNormalPrompts } from './normal'
export { getStrictPrompts } from './strict'
export { getDeepThinkingInstructions, getDeepThinkingCheckpointInstructions } from './deep-thinking'
export { getAttachmentHandlingInstructions, getNoAttachmentInstructions } from './attachments'
export * from './guardrails'

/**
 * Get prompts based on answer mode
 */
export function getPromptsByMode(mode: TAMode) {
  switch (mode) {
    case 'lenient':
      return require('./lenient').getLenientPrompts()
    case 'normal':
      return require('./normal').getNormalPrompts()
    case 'strict':
      return require('./strict').getStrictPrompts()
    default:
      return require('./normal').getNormalPrompts()
  }
}

/**
 * Enhance a system prompt with Deep Thinking Mode instructions
 * This combines the base answer-mode prompt with deep thinking enhancements
 */
export function enhancePromptWithDeepThinking(
  basePrompt: string,
  isCheckpointContext: boolean = false
): string {
  const deepThinkingInstructions = isCheckpointContext
    ? require('./deep-thinking').getDeepThinkingCheckpointInstructions()
    : require('./deep-thinking').getDeepThinkingInstructions()
  
  return basePrompt + deepThinkingInstructions
}

