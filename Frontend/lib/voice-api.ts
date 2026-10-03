/**
 * Client for the GB10 offline voice service (FastAPI, tunnelled to localhost:8100).
 *
 * Verified against the running service:
 *   POST /stt  multipart/form-data, field "file"  -> {text, engine, audio_seconds, seconds}
 *   POST /tts  application/json {text, voice?, speed?} -> raw audio/wav body (24kHz mono)
 *   GET  /health -> {ok, stt:{...}, tts:{...}, accepted_audio:"16-bit PCM WAV", ffmpeg:false}
 *
 * Note the OpenAPI schema advertises application/json for /tts, but it actually returns a WAV
 * body — hence blob(), not json(). And because ffmpeg is false the service does no transcoding:
 * it accepts 16-bit PCM WAV only, which is why uploads must come from WavRecorder rather than
 * MediaRecorder (webm).
 */

const VOICE_API_URL = process.env.NEXT_PUBLIC_VOICE_API_URL || "http://localhost:8100"
const DEFAULT_TTS_VOICE = process.env.NEXT_PUBLIC_VOICE_TTS_VOICE || "af_sarah"

export interface TranscriptionResult {
  text: string
  engine: string
  /** Length of the submitted audio, in seconds. */
  audioSeconds: number
  /** Time the service spent transcribing, in seconds. */
  seconds: number
}

export interface VoiceHealth {
  ok: boolean
  stt: { default: string; engines: string[] }
  tts: { default: string; engines: string[]; voices: Record<string, string[]> }
  loaded: string[]
  acceptedAudio: string
}

/** True when the voice service answers — used to show a clear message if the tunnel is down. */
export async function checkVoiceHealth(signal?: AbortSignal): Promise<VoiceHealth | null> {
  try {
    const res = await fetch(`${VOICE_API_URL}/health`, { signal })
    if (!res.ok) return null
    const data = await res.json()
    return {
      ok: Boolean(data.ok),
      stt: data.stt,
      tts: data.tts,
      loaded: data.loaded ?? [],
      acceptedAudio: data.accepted_audio ?? "",
    }
  } catch {
    return null
  }
}

/** Transcribe a 16-bit PCM WAV blob. Anything else is rejected by the service. */
export async function transcribe(wav: Blob, signal?: AbortSignal): Promise<TranscriptionResult> {
  const form = new FormData()
  form.append("file", wav, "speech.wav")

  const res = await fetch(`${VOICE_API_URL}/stt`, { method: "POST", body: form, signal })
  if (!res.ok) {
    throw new Error(`Speech-to-text failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  }
  const data = await res.json()
  return {
    text: (data.text ?? "").trim(),
    engine: data.engine ?? "",
    audioSeconds: data.audio_seconds ?? 0,
    seconds: data.seconds ?? 0,
  }
}

/** Synthesize speech. Returns a WAV blob ready for an <audio> element. */
export async function synthesize(
  text: string,
  options: { voice?: string; speed?: number; signal?: AbortSignal } = {}
): Promise<Blob> {
  const res = await fetch(`${VOICE_API_URL}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      voice: options.voice ?? DEFAULT_TTS_VOICE,
      speed: options.speed ?? 1.0,
    }),
    signal: options.signal,
  })
  if (!res.ok) {
    throw new Error(`Text-to-speech failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
  }
  return res.blob()
}

/**
 * Spoken answers should not read markdown aloud. Strips the formatting the chat prompts emit
 * so the voice doesn't say "asterisk asterisk".
 */
export function stripForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")           // code fences
    .replace(/`([^`]+)`/g, "$1")               // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")     // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")   // links -> label
    .replace(/^#{1,6}\s+/gm, "")               // headings
    .replace(/(\*\*|__)(.*?)\1/g, "$2")        // bold
    .replace(/(\*|_)(.*?)\1/g, "$2")           // italic
    .replace(/^\s*[-*+]\s+/gm, "")             // bullets
    .replace(/^\s*>\s?/gm, "")                 // quotes
    .replace(/\|/g, " ")                       // table pipes
    .replace(/\s+/g, " ")
    .trim()
}
