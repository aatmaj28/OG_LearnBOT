"use client"

import React from 'react'
import { Brain } from 'lucide-react'

interface DeepThinkingAnimationProps {
  isDarkMode: boolean
}

export function DeepThinkingAnimation({ isDarkMode }: DeepThinkingAnimationProps) {
  return (
    <div className="flex gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex-shrink-0">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center relative ${
          isDarkMode 
            ? 'bg-purple-500/20 border-2 border-purple-500/50'
            : 'bg-gradient-to-br from-purple-400 to-indigo-500'
        } shadow-lg`}>
          <Brain className={`w-5 h-5 ${isDarkMode ? 'text-purple-300' : 'text-white'} animate-pulse`} />
          {/* Pulsing rings */}
          <div className={`absolute inset-0 rounded-full ${
            isDarkMode ? 'border-2 border-purple-500/30' : 'border-2 border-purple-300/50'
          } animate-ping`} style={{ animationDuration: '2s' }}></div>
          <div className={`absolute inset-0 rounded-full ${
            isDarkMode ? 'border-2 border-purple-500/20' : 'border-2 border-purple-300/30'
          } animate-ping`} style={{ animationDuration: '2s', animationDelay: '0.5s' }}></div>
        </div>
      </div>
      <div className={`flex-1 max-w-[85%] rounded-2xl px-6 py-5 ${
        isDarkMode
          ? 'bg-gradient-to-r from-purple-900/30 via-indigo-900/30 to-purple-900/30 border border-purple-500/30'
          : 'bg-gradient-to-r from-purple-50 via-indigo-50 to-purple-50 border border-purple-200'
      } shadow-lg backdrop-blur-sm`}>
        <div className="flex items-center gap-3 mb-2">
          <div className="flex gap-1.5">
            <div className={`w-2 h-2 rounded-full ${
              isDarkMode ? 'bg-purple-400' : 'bg-purple-500'
            } animate-bounce`} style={{ animationDuration: '1s' }}></div>
            <div className={`w-2 h-2 rounded-full ${
              isDarkMode ? 'bg-indigo-400' : 'bg-indigo-500'
            } animate-bounce`} style={{ animationDuration: '1s', animationDelay: '0.2s' }}></div>
            <div className={`w-2 h-2 rounded-full ${
              isDarkMode ? 'bg-purple-400' : 'bg-purple-500'
            } animate-bounce`} style={{ animationDuration: '1s', animationDelay: '0.4s' }}></div>
          </div>
          <span className={`text-sm font-medium ${
            isDarkMode ? 'text-purple-200' : 'text-purple-700'
          }`}>
            Deep Thinking Mode
          </span>
        </div>
        <p className={`text-sm ${
          isDarkMode ? 'text-purple-300/80' : 'text-purple-600'
        }`}>
          Analyzing your question with enhanced depth and thoroughness...
        </p>
        {/* Animated progress bar */}
        <div className={`mt-3 h-1 rounded-full overflow-hidden ${
          isDarkMode ? 'bg-purple-900/50' : 'bg-purple-100'
        }`}>
          <div 
            className={`h-full rounded-full ${
              isDarkMode 
                ? 'bg-gradient-to-r from-purple-400 via-indigo-400 to-purple-400'
                : 'bg-gradient-to-r from-purple-500 via-indigo-500 to-purple-500'
            }`}
            style={{ 
              width: '100%',
              animation: 'shimmer 2s ease-in-out infinite'
            }}
          ></div>
        </div>
        <style>{`
          @keyframes shimmer {
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(100%);
            }
          }
        `}</style>
      </div>
    </div>
  )
}

