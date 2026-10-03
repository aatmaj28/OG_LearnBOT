/**
 * Microphone recorder that produces WAV.
 *
 * MediaRecorder gives webm/opus, which the voice service rejects — it only accepts WAV. So this
 * captures raw PCM frames through the Web Audio API and encodes a WAV container by hand.
 *
 * It also exposes the live AnalyserNode so the voice UI can draw a waveform from the same
 * microphone stream instead of opening a second one.
 */

/** Sample rate the STT service expects. Captured audio is downsampled to this. */
export const WAV_SAMPLE_RATE = 16000

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const clamped = Math.max(-1, Math.min(1, input[i]))
    out[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }
  return out
}

/** Average consecutive samples to reach the target rate. Good enough for speech. */
function downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (toRate >= fromRate) return buffer
  const ratio = fromRate / toRate
  const outLength = Math.round(buffer.length / ratio)
  const result = new Float32Array(outLength)
  let offsetResult = 0
  let offsetBuffer = 0
  while (offsetResult < outLength) {
    const nextOffset = Math.round((offsetResult + 1) * ratio)
    let sum = 0
    let count = 0
    for (let i = offsetBuffer; i < nextOffset && i < buffer.length; i++) {
      sum += buffer[i]
      count++
    }
    result[offsetResult] = count > 0 ? sum / count : 0
    offsetResult++
    offsetBuffer = nextOffset
  }
  return result
}

/** Wrap mono 16-bit PCM in a 44-byte RIFF/WAVE header. */
function encodeWav(samples: Int16Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)        // PCM chunk size
  view.setUint16(20, 1, true)         // format: PCM
  view.setUint16(22, 1, true)         // channels: mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate (mono, 2 bytes/sample)
  view.setUint16(32, 2, true)         // block align
  view.setUint16(34, 16, true)        // bits per sample
  writeString(36, "data")
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    view.setInt16(offset, samples[i], true)
  }
  return new Blob([view], { type: "audio/wav" })
}

export class WavRecorder {
  private audioCtx: AudioContext | null = null
  private stream: MediaStream | null = null
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private chunks: Float32Array[] = []
  private recording = false

  /** Live analyser over the same stream, for waveform drawing. Null until start(). */
  analyser: AnalyserNode | null = null

  get isRecording() {
    return this.recording
  }

  async start(): Promise<void> {
    if (this.recording) return

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
    this.audioCtx = new AudioCtx()
    this.source = this.audioCtx.createMediaStreamSource(this.stream)

    this.analyser = this.audioCtx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.8
    this.source.connect(this.analyser)

    // ScriptProcessor is deprecated but is the one PCM tap available without shipping a
    // separate AudioWorklet module file; it works in every browser we target.
    this.processor = this.audioCtx.createScriptProcessor(4096, 1, 1)
    this.chunks = []
    this.processor.onaudioprocess = (event) => {
      if (!this.recording) return
      // copy: the event buffer is reused between callbacks
      this.chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)))
    }
    this.source.connect(this.processor)
    // Keep the node alive without making the mic audible back to the user.
    const silentGain = this.audioCtx.createGain()
    silentGain.gain.value = 0
    this.processor.connect(silentGain)
    silentGain.connect(this.audioCtx.destination)

    this.recording = true
  }

  /** Stop capture and return the recording as a WAV blob (null if nothing was captured). */
  async stop(): Promise<Blob | null> {
    if (!this.recording) return null
    this.recording = false

    const inputRate = this.audioCtx?.sampleRate ?? 48000
    const totalLength = this.chunks.reduce((sum, c) => sum + c.length, 0)
    const merged = new Float32Array(totalLength)
    let offset = 0
    for (const chunk of this.chunks) {
      merged.set(chunk, offset)
      offset += chunk.length
    }
    this.chunks = []
    this.teardown()

    if (totalLength === 0) return null
    return encodeWav(floatTo16BitPCM(downsample(merged, inputRate, WAV_SAMPLE_RATE)), WAV_SAMPLE_RATE)
  }

  /** Release the microphone without producing a file. */
  cancel(): void {
    this.recording = false
    this.chunks = []
    this.teardown()
  }

  private teardown() {
    this.processor?.disconnect()
    this.source?.disconnect()
    this.analyser?.disconnect()
    this.stream?.getTracks().forEach((t) => t.stop())
    this.audioCtx?.close().catch(() => {})
    this.processor = null
    this.source = null
    this.analyser = null
    this.stream = null
    this.audioCtx = null
  }
}
