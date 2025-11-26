/**
 * Voice Logger - Sends logs to server terminal
 */

const LOG_ENABLED = process.env.NODE_ENV === 'development' || true // Always enabled for now

export function logVoice(level: 'info' | 'warn' | 'error', message: string, data?: any) {
  if (!LOG_ENABLED) return
  
  try {
    // Send to server for terminal logging
    fetch('/api/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        level,
        message,
        data
      })
    }).catch(() => {
      // Silently fail if server is not available
    })
  } catch (error) {
    // Silently fail
  }
}

export const voiceLogger = {
  info: (message: string, data?: any) => logVoice('info', message, data),
  warn: (message: string, data?: any) => logVoice('warn', message, data),
  error: (message: string, data?: any) => logVoice('error', message, data),
}

