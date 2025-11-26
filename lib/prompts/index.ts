/**
 * TA Mode Prompt System
 * 
 * This module exports prompt functions for different TA modes:
 * - Lenient: More forgiving, accepts partial understanding
 * - Normal: Standard behavior (balanced)
 * - Strict: Very strict checkpoint requirements
 * 
 * Deep Thinking Mode can be combined with any TA mode to enable extended reasoning.
 */

export type TAMode = 'lenient' | 'normal' | 'strict'

export { getLenientPrompts } from './lenient'
export { getNormalPrompts } from './normal'
export { getStrictPrompts } from './strict'
export { getDeepThinkingInstructions, getDeepThinkingCheckpointInstructions } from './deep-thinking'
export { getAttachmentHandlingInstructions, getNoAttachmentInstructions } from './attachments'

/**
 * Get prompts based on TA mode
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
 * This combines the base TA mode prompt with deep thinking enhancements
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

