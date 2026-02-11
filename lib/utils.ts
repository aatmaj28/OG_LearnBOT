import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Max length for conversation card title snippet (add "..." when truncated) */
const CARD_TITLE_SNIPPET_LENGTH = 45

/**
 * Get the title shown on a conversation card. Always prefer a content snippet (first user message),
 * never "Chat (Date)" since the date is already shown in the card subtitle.
 * Used by both student and faculty chat history lists.
 * Backend may send titleSnippet in the list response; otherwise we derive from messageHistory or title.
 */
export function getConversationCardTitle(conversation: {
  titleSnippet?: string | null
  messageHistory?: Array<{ role: string; content?: string }>
  title?: string
  createdAt?: Date | string
  updatedAt?: Date | string
}): string {
  if (!conversation) return 'New chat'

  // Prefer backend-provided snippet (from list API) when present
  const snippet = (conversation.titleSnippet || '').trim()
  if (snippet) return snippet

  const firstUser = conversation.messageHistory?.find(m => m.role === 'user')
  const content = firstUser?.content?.trim()
  if (content && content.length > 0) {
    if (content.length <= CARD_TITLE_SNIPPET_LENGTH) return content
    return content.slice(0, CARD_TITLE_SNIPPET_LENGTH).trim() + '...'
  }

  // If backend sent a title that isn't "Chat ..." or date-like, use it
  const title = (conversation.title || '').trim()
  const lower = title.toLowerCase()
  if (title && !lower.startsWith('chat ') && !/^\d{4}-\d{2}-\d{2}/.test(title)) {
    if (title.length <= CARD_TITLE_SNIPPET_LENGTH) return title
    return title.slice(0, CARD_TITLE_SNIPPET_LENGTH).trim() + '...'
  }

  return 'New chat'
}
