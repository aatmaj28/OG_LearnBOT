"use client"

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'
import 'katex/dist/katex.min.css'
import { Bot, User } from 'lucide-react'

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
  isDarkMode?: boolean
}

// Function to sanitize content using efficient character whitelist (same as Python/frontend)
function sanitizeContent(content: string): string {
  if (!content) return content
  
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
  let result = ''
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i)
    // Allow: ASCII (0-127), safe Unicode ranges only
    if (code <= 127 || 
        (code >= 0x2000 && code <= 0x206F) ||  // General Punctuation
        (code >= 0x20A0 && code <= 0x20CF) ||  // Currency symbols
        (code >= 0x2100 && code <= 0x214F) ||  // Letterlike Symbols
        (code >= 0x2190 && code <= 0x21FF) ||  // Arrows
        (code >= 0x2200 && code <= 0x22FF) ||  // Mathematical Operators
        (code >= 0x2300 && code <= 0x23FF) ||  // Miscellaneous Technical
        (code >= 0x2400 && code <= 0x243F) ||  // Control Pictures
        (code >= 0x25A0 && code <= 0x25FF) ||  // Geometric Shapes
        (code >= 0xFE00 && code <= 0xFE0F) ||   // Variation Selectors
        (code >= 0xFE20 && code <= 0xFE2F)) {   // Combining Half Marks
      result += content[i]
    }
    // Skip all other characters (emojis, complex Unicode, corrupted sequences)
  }
  
  // Clean up multiple spaces that might result from removals
  result = result.replace(/\s{2,}/g, ' ')
  
  return result.trim()
}

export function ChatMessage({ role, content, timestamp, metadata, isDarkMode = false }: ChatMessageProps) {
  const sanitizedContent = sanitizeContent(content)
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} group animate-in fade-in slide-in-from-bottom-4 duration-500`}>
      <div className={`flex gap-3 max-w-[85%] ${role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* Avatar */}
        <div className="flex-shrink-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            role === 'user' 
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
        {/* Message Bubble */}
        <div className={`rounded-2xl px-5 py-3 ${
          role === 'user'
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
            prose-p:my-2 prose-p:leading-7
            prose-ul:my-2 prose-ol:my-2 prose-li:my-1
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
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex, rehypeHighlight]}
              components={{
                // Custom rendering for code blocks
                code({ node, inline, className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || '')
                  return !inline && match ? (
                    <div className="relative group/code">
                      <div className={`absolute right-2 top-2 text-xs px-2 py-1 rounded font-mono ${
                        isDarkMode 
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
                // Custom rendering for paragraphs to handle line breaks better
                p({ children }) {
                  return <p className="leading-7">{children}</p>
                },
                // Custom rendering for lists
                ul({ children }) {
                  return <ul className="space-y-1 pl-4">{children}</ul>
                },
                ol({ children }) {
                  return <ol className="space-y-1 pl-4">{children}</ol>
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
            {new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          
          {role === 'assistant' && metadata?.mode && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isDarkMode
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
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isDarkMode 
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
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isDarkMode
                ? 'bg-white/10 text-white/60 border border-white/10'
                : 'bg-emerald-100 text-emerald-700'
            }`}>
              ⚡ {metadata.timeToFirstToken < 1000 ? `${metadata.timeToFirstToken}ms` : `${(metadata.timeToFirstToken / 1000).toFixed(2)}s`}
            </span>
          )}
          
          {role === 'assistant' && metadata?.totalResponseTime && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              isDarkMode
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

