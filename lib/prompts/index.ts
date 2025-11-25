/**
 * TA Mode Prompt System
 * 
 * This module exports prompt functions for different TA modes:
 * - Lenient: More forgiving, accepts partial understanding
 * - Normal: Standard behavior (balanced)
 * - Strict: Very strict checkpoint requirements
 */

export type TAMode = 'lenient' | 'normal' | 'strict'

export { getLenientPrompts } from './lenient'
export { getNormalPrompts } from './normal'
export { getStrictPrompts } from './strict'

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

