"use client"

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import { Bot, User, Image as ImageIcon, File } from 'lucide-react'
import type { ChatAttachment } from '@/lib/types'

interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  metadata?: {
    mode?: 'rag' | 'llm_fallback' | 'error'
    modelUsed?: string
    timeToFirstToken?: number
    totalResponseTime?: number
    timeTaken?: number
  }
  attachments?: ChatAttachment[]
  isDarkMode?: boolean
}

// Replace literal HTML line-break tags with newlines so they render as clean line breaks, not raw text
function stripHtmlLineBreaks(text: string): string {
  return text.replace(/<br\s*\/?>/gi, '\n')
}

// Function to sanitize content using efficient character whitelist (same as Python/frontend)
function sanitizeContent(content: string): string {
  if (!content) return content

  // Remove literal <br/>, <br>, <br /> etc so response is clean (LLM sometimes emits these)
  content = stripHtmlLineBreaks(content)

  // Fast path: check if all ASCII (most common case)
  let hasNonASCII = false
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) > 127) {
      hasNonASCII = true
      break
    }
  }
  if (!hasNonASCII) return content // Early exit for ASCII-only

  // Character whitelist filter (same as Python side and streaming sanitization)
  // Use codePointAt for proper emoji handling (emojis are multi-byte)
  let result = ''
  for (let i = 0; i < content.length; i++) {
    const codePoint = content.codePointAt(i) || 0
    // Skip surrogate pairs (second half of emoji)
    if (codePoint >= 0xD800 && codePoint <= 0xDFFF) {
      continue
    }

    // Allow: ASCII (0-127), safe Unicode ranges, and emojis
    if (codePoint <= 127 ||
      (codePoint >= 0x2000 && codePoint <= 0x206F) ||  // General Punctuation
      (codePoint >= 0x20A0 && codePoint <= 0x20CF) ||  // Currency symbols
      (codePoint >= 0x2100 && codePoint <= 0x214F) ||  // Letterlike Symbols
      (codePoint >= 0x2190 && codePoint <= 0x21FF) ||  // Arrows
      (codePoint >= 0x2200 && codePoint <= 0x22FF) ||  // Mathematical Operators
      (codePoint >= 0x2300 && codePoint <= 0x23FF) ||  // Miscellaneous Technical
      (codePoint >= 0x2400 && codePoint <= 0x243F) ||  // Control Pictures
      (codePoint >= 0x25A0 && codePoint <= 0x25FF) ||  // Geometric Shapes
      (codePoint >= 0x2600 && codePoint <= 0x26FF) ||  // Miscellaneous Symbols (includes some emojis)
      (codePoint >= 0x2700 && codePoint <= 0x27BF) ||  // Dingbats
      (codePoint >= 0x1F300 && codePoint <= 0x1F9FF) || // Emoticons and Symbols
      (codePoint >= 0x1F600 && codePoint <= 0x1F64F) || // Emoticons
      (codePoint >= 0x1F900 && codePoint <= 0x1F9FF) || // Supplemental Symbols and Pictographs
      (codePoint >= 0x1FA00 && codePoint <= 0x1FAFF) || // Symbols and Pictographs Extended-A
      (codePoint >= 0xFE00 && codePoint <= 0xFE0F) ||   // Variation Selectors
      (codePoint >= 0xFE20 && codePoint <= 0xFE2F)) {   // Combining Half Marks
      // Use String.fromCodePoint for proper emoji handling
      result += String.fromCodePoint(codePoint)
      // Skip the next character if this was a surrogate pair
      if (codePoint > 0xFFFF) {
        i++
      }
    }
    // Skip corrupted sequences but allow emojis
  }

  // Clean up multiple spaces (but preserve newlines)
  // Replace multiple spaces/tabs with single space, but keep newlines
  result = result.replace(/[ \t]+/g, ' ')  // Collapse spaces/tabs only
  result = result.replace(/\n{3,}/g, '\n\n')  // Limit consecutive newlines to 2

  return result.trim()
}

export function ChatMessage({ role, content, timestamp, metadata, attachments, isDarkMode = false }: ChatMessageProps) {
  let sanitizedContent = sanitizeContent(content)

  // Debug: Log content to see what we're working with
  if (role === 'assistant') {
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]/gu
    const emojisInOriginal = content.match(emojiRegex) || []
    const emojisInSanitized = sanitizedContent.match(emojiRegex) || []
    console.log('[CHAT MESSAGE DEBUG] Original content length:', content.length)
    console.log('[CHAT MESSAGE DEBUG] Emojis in ORIGINAL content:', emojisInOriginal)
    console.log('[CHAT MESSAGE DEBUG] Emojis in SANITIZED content:', emojisInSanitized)
    console.log('[CHAT MESSAGE DEBUG] First 300 chars of sanitized:', sanitizedContent.substring(0, 300))
  }

  // Convert "1) " format to "1. " format for ReactMarkdown (it only recognizes "1. " as numbered lists)
  const beforeConversion = sanitizedContent
  // Check for numbered lines - match "1)" or "1) " at start of line
  const numberedLinesBefore = beforeConversion.split('\n').filter(line => /^\s*\d+\)/.test(line))

  if (role === 'assistant') {
    console.log('[CHAT MESSAGE DEBUG] Lines with "1)" format BEFORE conversion:', numberedLinesBefore.length)
    if (numberedLinesBefore.length > 0) {
      console.log('[CHAT MESSAGE DEBUG] Sample numbered lines:', numberedLinesBefore.slice(0, 3))
    }
  }

  // Convert "1) " to "1. " - handle both "1)" and "1) " formats
  // Pattern 1: "1) " at start of line (with space after parenthesis)
  sanitizedContent = sanitizedContent.replace(/^(\s*)(\d+)\)\s+/gm, '$1$2. ')
  // Pattern 2: "1)" at start of line (without space, but followed by text or end of line)
  sanitizedContent = sanitizedContent.replace(/^(\s*)(\d+)\)([^\s])/gm, '$1$2. $3')

  if (role === 'assistant') {
    const numberedLinesAfter = sanitizedContent.split('\n').filter(line => /^\s*\d+\.\s/.test(line))
    console.log('[CHAT MESSAGE DEBUG] Lines with "1." format AFTER conversion:', numberedLinesAfter.length)
    if (numberedLinesAfter.length > 0) {
      console.log('[CHAT MESSAGE DEBUG] Sample converted lines:', numberedLinesAfter.slice(0, 3))
      console.log('[CHAT MESSAGE DEBUG] First 300 chars AFTER conversion:', sanitizedContent.substring(0, 300))
    } else if (numberedLinesBefore.length > 0) {
      // This is not necessarily an error - the lines might have been processed differently
      // Only log as warning, not error
      console.warn('[CHAT MESSAGE DEBUG] Note: Found', numberedLinesBefore.length, 'numbered lines before conversion but 0 after. This may be normal if they were processed differently.')
      console.warn('[CHAT MESSAGE DEBUG] Original numbered lines:', numberedLinesBefore)
      console.warn('[CHAT MESSAGE DEBUG] Content after conversion (first 300 chars):', sanitizedContent.substring(0, 300))
    }
  }

  // IMPORTANT: Preserve numbered list formatting for ReactMarkdown
  // ReactMarkdown recognizes numbered lists when items start with "1. " at the beginning of a line
  // Each numbered item MUST be on its own line, and there should be a blank line before the list

  // First, ensure numbered list items are on separate lines (in case they got collapsed)
  // This regex finds numbered items that might be on the same line and splits them
  sanitizedContent = sanitizedContent.replace(/(\d+\.\s[^\n]+?)\s+(\d+\.\s)/g, '$1\n$2')

  // Normalize multiple newlines to double (but preserve list structure)
  sanitizedContent = sanitizedContent.replace(/\n{3,}/g, '\n\n')

  // Process line by line to ensure proper formatting
  const lines = sanitizedContent.split('\n')
  const processedLines: string[] = []
  let inNumberedList = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isNumberedItem = /^\s*\d+\.\s/.test(line)
    const nextIsNumbered = i + 1 < lines.length && /^\s*\d+\.\s/.test(lines[i + 1])
    const isBlank = line.trim() === ''

    if (isNumberedItem) {
      // Numbered list item
      if (!inNumberedList) {
        // First numbered item - ensure blank line before it
        if (processedLines.length > 0 && processedLines[processedLines.length - 1].trim() !== '') {
          processedLines.push('')
        }
        inNumberedList = true
      }
      // Add the numbered item as-is (on its own line)
      processedLines.push(line)

      // If next line is not numbered and not blank, end the list
      if (!nextIsNumbered && !isBlank && i + 1 < lines.length && lines[i + 1].trim() !== '') {
        processedLines.push('')  // Blank line after list
        inNumberedList = false
      }
    } else if (isBlank) {
      // Blank line - preserve it
      processedLines.push(line)
      if (inNumberedList && i + 1 < lines.length && !/^\s*\d+\.\s/.test(lines[i + 1])) {
        inNumberedList = false
      }
    } else {
      // Regular text line
      inNumberedList = false
      // Don't add markdown line breaks for regular text - let ReactMarkdown handle it
      processedLines.push(line)
    }
  }

  sanitizedContent = processedLines.join('\n')

  // Fix spacing around numbers with commas (e.g., "95,200and" -> "95,200 and", "is95,200" -> "is 95,200")
  sanitizedContent = sanitizedContent.replace(/([a-zA-Z])(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/g, '$1 $2')
  sanitizedContent = sanitizedContent.replace(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)([a-zA-Z])/g, '$1 $2')

  if (role === 'assistant') {
    const finalNumberedLines = sanitizedContent.split('\n').filter(line => /^\s*\d+\.\s/.test(line))
    console.log('[CHAT MESSAGE DEBUG] Final numbered lines count:', finalNumberedLines.length)

    // Check if numbered items are on separate lines
    const numberedItemsOnSameLine = sanitizedContent.match(/\d+\.\s[^\n]+\s+\d+\.\s/g)
    if (numberedItemsOnSameLine) {
      console.warn('[CHAT MESSAGE DEBUG] ⚠️ Found numbered items on same line:', numberedItemsOnSameLine)
    }

    // Show the actual structure around numbered items
    const numberedItemIndex = sanitizedContent.search(/^\d+\.\s/m)
    if (numberedItemIndex !== -1) {
      const contextStart = Math.max(0, numberedItemIndex - 50)
      const contextEnd = Math.min(sanitizedContent.length, numberedItemIndex + 300)
      console.log('[CHAT MESSAGE DEBUG] Context around first numbered item:', sanitizedContent.substring(contextStart, contextEnd))
    }

    if (finalNumberedLines.length > 0) {
      console.log('[CHAT MESSAGE DEBUG] Final numbered lines:', finalNumberedLines.slice(0, 4))
    }
  }

  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} group animate-in fade-in slide-in-from-bottom-4 duration-500`}>
      <div className={`flex gap-3 max-w-[85%] ${role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${role === 'user'
              ? isDarkMode
                ? 'bg-white/10 border border-white/20'
                : 'bg-gradient-to-br from-blue-500 to-indigo-600'
              : isDarkMode
                ? 'bg-white/10 border border-white/20'
                : 'bg-gradient-to-br from-emerald-400 to-teal-500'
            } shadow-lg`}>
            {role === 'user' ? (
              <User className={`w-4 h-4 ${isDarkMode ? 'text-white' : 'text-white'}`} />
            ) : (
              <Bot className={`w-4 h-4 ${isDarkMode ? 'text-white' : 'text-white'}`} />
            )}
          </div>
        </div>

        {/* Message Content */}
        <div className={`flex flex-col ${role === 'user' ? 'items-end' : 'items-start'}`}>
          {/* Attachments */}
          {attachments && attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {attachments.map((attachment, index) => (
                <div key={index} className="relative">
                  {attachment.type === 'image' ? (
                    attachment.url ? (
                      <div className="relative rounded-lg overflow-hidden border border-gray-300 max-w-xs">
                        <img
                          src={attachment.url}
                          alt={attachment.name}
                          className="max-h-48 object-contain"
                        />
                      </div>
                    ) : (
                      <div
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${isDarkMode
                            ? 'bg-white/5 border-white/20 text-white'
                            : 'bg-gray-50 border-gray-300 text-gray-700'
                          }`}
                      >
                        <ImageIcon className="h-4 w-4 shrink-0" />
                        <span className="text-sm max-w-[150px] truncate">{attachment.name || 'Image'}</span>
                      </div>
                    )
                  ) : (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${isDarkMode
                          ? 'bg-white/5 border-white/20 text-white'
                          : 'bg-gray-50 border-gray-300 text-gray-700'
                        }`}
                    >
                      <File className="h-4 w-4" />
                      <span className="text-sm max-w-[150px] truncate">{attachment.name}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Message Bubble */}
          <div className={`rounded-2xl px-5 py-3 ${role === 'user'
              ? isDarkMode
                ? 'bg-white/5 border border-white/10 text-white shadow-lg'
                : 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg'
              : isDarkMode
                ? 'bg-transparent text-white'
                : 'bg-white border border-gray-200 text-gray-900 shadow-lg'
            } transition-all duration-200`}>

            {/* Markdown Content */}
            <div className={`prose ${isDarkMode ? 'prose-invert' : 'prose-gray'} prose-sm max-w-none
            prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
            prose-h1:text-xl prose-h2:text-lg prose-h3:text-base
            prose-p:my-4 prose-p:leading-7 prose-p:whitespace-pre-wrap
            prose-ul:my-2 prose-ol:my-3 prose-li:my-1.5
            prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
            ${role === 'user'
                ? isDarkMode
                  ? 'prose-code:bg-white/10 prose-code:text-white'
                  : 'prose-code:bg-white/20 prose-code:text-white'
                : isDarkMode
                  ? 'prose-code:bg-white/10 prose-code:text-white'
                  : 'prose-code:bg-gray-100 prose-code:text-gray-800'}
            prose-pre:my-3 prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto
            ${isDarkMode ? 'prose-pre:bg-black prose-pre:border prose-pre:border-white/10' : 'prose-pre:bg-gray-900'}
            prose-blockquote:border-l-4 prose-blockquote:pl-4 prose-blockquote:italic
            ${role === 'user'
                ? isDarkMode
                  ? 'prose-blockquote:border-white/20 prose-strong:text-white prose-em:text-white/90'
                  : 'prose-blockquote:border-white/30 prose-strong:text-white prose-em:text-white/90'
                : isDarkMode
                  ? 'prose-blockquote:border-white/20 prose-strong:text-white prose-em:text-white/90'
                  : 'prose-blockquote:border-emerald-500 prose-strong:text-gray-900 prose-code:text-emerald-600'
              }
            ${isDarkMode ? 'prose-a:text-blue-400' : 'prose-a:text-blue-500'} prose-a:no-underline hover:prose-a:underline
            prose-table:border-collapse prose-th:border prose-th:p-2 prose-td:border prose-td:p-2
            ${isDarkMode ? 'prose-th:border-white/10 prose-td:border-white/10' : 'prose-th:border-gray-300 prose-td:border-gray-300'}
          `}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  // Custom rendering for code blocks
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '')
                    return !inline && match ? (
                      <div className="relative group/code">
                        <div className={`absolute right-2 top-2 text-xs px-2 py-1 rounded font-mono ${isDarkMode
                            ? 'text-white/60 bg-white/10 border border-white/10'
                            : 'text-gray-400 bg-gray-800'
                          }`}>
                          {match[1]}
                        </div>
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </div>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    )
                  },
                  // Custom rendering for paragraphs to handle line breaks better with more spacing
                  p({ children }) {
                    return <p className="leading-7 whitespace-pre-wrap my-4">{children}</p>
                  },
                  // Custom rendering for lists
                  ul({ children }) {
                    return <ul className="space-y-1 pl-4">{children}</ul>
                  },
                  ol({ children }) {
                    return <ol className="space-y-2 pl-6 list-decimal list-outside my-3">{children}</ol>
                  },
                  li({ children }) {
                    return <li className="ml-4 mb-1">{children}</li>
                  },
                }}
              >
                {sanitizedContent}
              </ReactMarkdown>
            </div>
          </div>

          {/* Metadata */}
          <div className={`flex items-center gap-2 mt-1.5 px-2 flex-wrap ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <span className={`text-xs ${isDarkMode ? 'text-white/40' : 'text-gray-500'} font-medium`}>
              {(() => {
                try {
                  const date = timestamp instanceof Date ? timestamp : new Date(timestamp)
                  const timeValue = date.getTime()
                  if (isNaN(timeValue) || timeValue === 0) {
                    // Treat invalid or epoch (1970-01-01) timestamps as unknown instead of showing 07:00 PM
                    console.warn('[ChatMessage] Invalid or epoch timestamp:', timestamp)
                    return '--:--'
                  }
                  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                } catch (e) {
                  // Don't default to current time - show a placeholder instead
                  console.warn('[ChatMessage] Error parsing timestamp:', timestamp, e)
                  return '--:--'
                }
              })()}
            </span>

            {role === 'assistant' && metadata?.mode && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDarkMode
                  ? 'bg-white/10 text-white/60 border border-white/10'
                  : metadata.mode === 'rag'
                    ? 'bg-green-100 text-green-700'
                    : metadata.mode === 'llm_fallback'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-orange-100 text-orange-700'
                }`}>
                {metadata.mode === 'rag' ? 'RAG' : metadata.mode === 'llm_fallback' ? 'LLM' : 'Error'}
              </span>
            )}

            {role === 'assistant' && metadata?.modelUsed && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDarkMode
                  ? 'bg-white/10 text-white/60 border border-white/10'
                  : 'bg-purple-100 text-purple-700'
                }`}>
                {metadata.modelUsed === 'claude' ? '🧠 Claude' :
                  metadata.modelUsed === 'remote-a6000' ? '🚀 A6000' :
                    metadata.modelUsed === 'remote-blackwell' ? '⚡ Blackwell' :
                      metadata.modelUsed === 'remote-ollama' ? '🚀 A6000' :
                        metadata.modelUsed}
              </span>
            )}

            {role === 'assistant' && metadata?.timeToFirstToken && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDarkMode
                  ? 'bg-white/10 text-white/60 border border-white/10'
                  : 'bg-emerald-100 text-emerald-700'
                }`}>
                ⚡ {metadata.timeToFirstToken < 1000 ? `${metadata.timeToFirstToken}ms` : `${(metadata.timeToFirstToken / 1000).toFixed(2)}s`}
              </span>
            )}

            {role === 'assistant' && metadata?.totalResponseTime && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDarkMode
                  ? 'bg-white/10 text-white/60 border border-white/10'
                  : 'bg-blue-100 text-blue-700'
                }`}>
                🏁 {metadata.totalResponseTime < 1000 ? `${metadata.totalResponseTime}ms` : `${(metadata.totalResponseTime / 1000).toFixed(2)}s`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

