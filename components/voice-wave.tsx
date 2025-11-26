"use client"

import React from "react"

interface VoiceWaveProps {
  isActive: boolean
  className?: string
}

export function VoiceWave({ isActive, className = "" }: VoiceWaveProps) {
  if (!isActive) return null

  const bars = 5
  const delays = [0, 0.1, 0.2, 0.15, 0.05]

  return (
    <>
      <style jsx>{`
        @keyframes voiceWave {
          0%, 100% {
            height: 6px;
            opacity: 0.4;
          }
          50% {
            height: 18px;
            opacity: 1;
          }
        }
        .voice-bar {
          animation: voiceWave 0.8s ease-in-out infinite;
        }
      `}</style>
      <div className={`flex items-center gap-0.5 h-5 ${className}`}>
        {[...Array(bars)].map((_, i) => (
          <div
            key={i}
            className="voice-bar w-0.5 bg-current rounded-full"
            style={{
              animationDelay: `${delays[i]}s`,
            }}
          />
        ))}
      </div>
    </>
  )
}

