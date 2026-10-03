"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Mic, Square, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { WavRecorder } from "@/lib/wav-recorder"
import { checkVoiceHealth, synthesize, transcribe, stripForSpeech } from "@/lib/voice-api"
import { askAgent } from "@/lib/voice-chat"
import type { Class } from "@/lib/types"

/**
 * Full-screen voice conversation.
 *
 * Loop: record WAV -> /stt -> chat backend -> /tts -> play.
 * The bubble and waveform are driven by a real AnalyserNode on both sides — the recorder's
 * analyser while listening, and an analyser over the playback element while speaking.
 */

// Voice-activity detection. The turn ends on its own when the speaker goes quiet, so the
// conversation runs hands-free instead of needing a tap per sentence.
const SILENCE_MS = 1300          // quiet for this long after speech -> end the turn
const MIN_SPEECH_MS = 350        // ignore a click or cough as a whole turn
const MAX_TURN_MS = 45000        // hard stop so a stuck mic can't record forever
const CALIBRATE_MS = 400         // sample the room before deciding what counts as speech
const MIN_SPEECH_RMS = 0.018     // floor, so a silent room doesn't set an absurdly low bar

type VoiceState = "idle" | "listening" | "thinking" | "speaking" | "error"

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Tap the mic to start talking",
  listening: "Listening… pause when you are done",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Something went wrong",
}

export function VoiceMode() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [state, setState] = useState<VoiceState>("idle")
  const [error, setError] = useState("")
  const [transcript, setTranscript] = useState("")
  const [reply, setReply] = useState("")
  const [serviceUp, setServiceUp] = useState<boolean | null>(null)
  const [sectorName, setSectorName] = useState("")

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const recorderRef = useRef<WavRecorder | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const playbackAnalyserRef = useRef<AnalyserNode | null>(null)
  const playbackCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Conversation context, resolved once on mount.
  const sessionRef = useRef<{ userId: string; conversationId: string; classId: string } | null>(null)
  // Read inside the animation loop so it doesn't restart on every state change.
  const stateRef = useRef<VoiceState>("idle")
  // Hands-free loop state. Refs because the animation loop reads them every frame and must
  // not be torn down and rebuilt on each React state change.
  const conversationRef = useRef(false)
  const hasSpokenRef = useRef(false)
  const lastVoiceAtRef = useRef(0)
  const turnStartedAtRef = useRef(0)
  const noiseFloorRef = useRef<number[]>([])
  const speechThresholdRef = useRef(MIN_SPEECH_RMS)
  // The draw loop is created once, so it calls the latest handler through a ref.
  const endTurnRef = useRef<() => void>(() => {})
  stateRef.current = state

  // --- Service health + conversation setup -------------------------------------------------
  useEffect(() => {
    let cancelled = false

    const setup = async () => {
      const health = await checkVoiceHealth()
      if (cancelled) return
      setServiceUp(Boolean(health?.ok))
      if (!health?.ok) {
        setError("The voice service isn't reachable. Check the SSH tunnel on port 8100.")
        return
      }

      const userId = localStorage.getItem("userId")
      if (!userId) {
        setError("You need to be signed in to use voice.")
        return
      }

      try {
        const { classesApi, chatApi } = await import("@/lib/flask-api-client")
        const role = localStorage.getItem("userRole")
        const data = (await classesApi.getClasses(
          role === "faculty" ? userId : undefined,
          role === "faculty" ? undefined : userId
        )) as { classes?: Class[] }

        const classes = data.classes ?? []
        // Honour ?classId= from the chat page; otherwise use the first sector.
        const requested = searchParams.get("classId")
        const sector = classes.find((c) => c.id === requested) ?? classes[0]
        if (!sector) {
          setError("You aren't assigned to a sector yet, so there's nothing to talk about.")
          return
        }

        const created = (await chatApi.createConversation({
          userId,
          classId: sector.id,
          chatType: "class_material",
          title: "Voice conversation",
        })) as { conversation?: { id: string } }

        if (cancelled) return
        const conversationId = created.conversation?.id
        if (!conversationId) {
          setError("Could not start a voice conversation.")
          return
        }
        sessionRef.current = { userId, conversationId, classId: sector.id }
        setSectorName(sector.name)
      } catch {
        if (!cancelled) setError("Could not reach the chat backend.")
      }
    }

    setup()
    return () => {
      cancelled = true
    }
  }, [searchParams])

  // --- Teardown ----------------------------------------------------------------------------
  const cleanup = useCallback(() => {
    // Stop the hands-free loop first, or an in-flight turn would restart the mic after unmount.
    conversationRef.current = false
    abortRef.current?.abort()
    recorderRef.current?.cancel()
    recorderRef.current = null
    audioElRef.current?.pause()
    audioElRef.current = null
    playbackAnalyserRef.current = null
    playbackCtxRef.current?.close().catch(() => {})
    playbackCtxRef.current = null
  }, [])

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      cleanup()
    }
  }, [cleanup])

  // --- Animation: one loop, whichever analyser is live ---------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx2d = canvas.getContext("2d")
    if (!ctx2d) return

    const timeData = new Uint8Array(2048)

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const { width, height } = canvas.getBoundingClientRect()
      canvas.width = width * dpr
      canvas.height = height * dpr
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener("resize", resize)

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw)
      const { width, height } = canvas.getBoundingClientRect()
      const midY = height / 2
      ctx2d.clearRect(0, 0, width, height)

      // Listening reads the mic; speaking reads the playback. Otherwise there is no audio and
      // the line stays flat rather than animating something that isn't happening.
      const analyser =
        stateRef.current === "listening"
          ? recorderRef.current?.analyser ?? null
          : stateRef.current === "speaking"
            ? playbackAnalyserRef.current
            : null

      if (analyser) analyser.getByteTimeDomainData(timeData as any)
      else timeData.fill(128)

      const samples = analyser ? Math.min(analyser.fftSize, timeData.length) : 512
      let level = 0

      ctx2d.beginPath()
      ctx2d.lineWidth = 2.5
      ctx2d.lineCap = "round"
      const speaking = stateRef.current === "speaking"
      const gradient = ctx2d.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, speaking ? "rgba(129,140,248,0.2)" : "rgba(96,165,250,0.2)")
      gradient.addColorStop(0.5, speaking ? "#818cf8" : "#60a5fa")
      gradient.addColorStop(1, speaking ? "rgba(129,140,248,0.2)" : "rgba(96,165,250,0.2)")
      ctx2d.strokeStyle = gradient

      for (let i = 0; i < samples; i++) {
        const deviation = (timeData[i] - 128) / 128
        level += Math.abs(deviation)
        const x = (i / (samples - 1)) * width
        const taper = Math.sin((i / (samples - 1)) * Math.PI)
        const y = midY + deviation * (height / 2) * 0.9 * taper
        if (i === 0) ctx2d.moveTo(x, y)
        else ctx2d.lineTo(x, y)
      }
      ctx2d.stroke()
      level = Math.min(1, (level / samples) * 6)

      // --- voice activity detection -------------------------------------------------------
      if (stateRef.current === "listening" && analyser) {
        let sumSquares = 0
        for (let i = 0; i < samples; i++) {
          const d = (timeData[i] - 128) / 128
          sumSquares += d * d
        }
        const rms = Math.sqrt(sumSquares / samples)
        const now = Date.now()
        const elapsed = now - turnStartedAtRef.current

        if (elapsed < CALIBRATE_MS) {
          // Learn the room's noise floor before judging anything as speech.
          noiseFloorRef.current.push(rms)
        } else {
          if (noiseFloorRef.current.length) {
            const ambient =
              noiseFloorRef.current.reduce((a, b) => a + b, 0) / noiseFloorRef.current.length
            speechThresholdRef.current = Math.max(MIN_SPEECH_RMS, ambient * 2.5)
            noiseFloorRef.current = []
          }

          if (rms > speechThresholdRef.current) {
            hasSpokenRef.current = true
            lastVoiceAtRef.current = now
          }

          const quietFor = now - lastVoiceAtRef.current
          const endedNaturally = hasSpokenRef.current && quietFor > SILENCE_MS
          const ranTooLong = elapsed > MAX_TURN_MS
          if (endedNaturally || ranTooLong) {
            endTurnRef.current()
          }
        }
      }

      if (bubbleRef.current) {
        const pulse = stateRef.current === "thinking" ? 0.05 * Math.sin(Date.now() / 260) : 0
        bubbleRef.current.style.transform = `scale(${1 + level * 0.35 + pulse})`
        bubbleRef.current.style.opacity = String(0.75 + level * 0.25)
      }
    }

    draw()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
    }
  }, [])

  // --- Playback with an analyser so the line moves while the agent speaks --------------------
  const playReply = useCallback(async (wav: Blob) => {
    const url = URL.createObjectURL(wav)
    const audio = new Audio(url)
    audioElRef.current = audio

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      const ctx: AudioContext = new AudioCtx()
      const source = ctx.createMediaElementSource(audio)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8
      source.connect(analyser)
      analyser.connect(ctx.destination)
      playbackCtxRef.current = ctx
      playbackAnalyserRef.current = analyser
    } catch {
      // Without the analyser the audio still plays; only the waveform is flat.
    }

    setState("speaking")
    await new Promise<void>((resolve) => {
      audio.onended = () => resolve()
      audio.onerror = () => resolve()
      audio.play().catch(() => resolve())
    })

    URL.revokeObjectURL(url)
    audioElRef.current = null
    playbackAnalyserRef.current = null
    playbackCtxRef.current?.close().catch(() => {})
    playbackCtxRef.current = null
  }, [])

  // --- One full turn -------------------------------------------------------------------------
  const startListening = useCallback(async () => {
    if (!sessionRef.current) return
    setError("")
    try {
      const recorder = new WavRecorder()
      await recorder.start()
      recorderRef.current = recorder
      // Fresh VAD window: nothing said yet, and the noise floor is re-measured each turn
      // because the room (and the laptop fan) can change between turns.
      hasSpokenRef.current = false
      turnStartedAtRef.current = Date.now()
      lastVoiceAtRef.current = Date.now()
      noiseFloorRef.current = []
      setState("listening")
    } catch {
      conversationRef.current = false
      setError("Microphone access was blocked. Allow it in your browser to use voice mode.")
      setState("error")
    }
  }, [])

  const stopAndSend = useCallback(async () => {
    const recorder = recorderRef.current
    const session = sessionRef.current
    if (!recorder || !session) return

    const wav = await recorder.stop()
    recorderRef.current = null
    if (!wav) {
      setState("idle")
      return
    }

    setState("thinking")
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const heard = await transcribe(wav, controller.signal)
      if (!heard.text) {
        // Nothing intelligible — don't interrupt the conversation over it, just listen again.
        if (conversationRef.current) { await startListening(); return }
        setState("idle")
        return
      }
      setTranscript(heard.text)
      setReply("")

      const answer = await askAgent({
        userId: session.userId,
        conversationId: session.conversationId,
        classId: session.classId,
        message: heard.text,
        signal: controller.signal,
      })
      setReply(answer)

      const speech = await synthesize(stripForSpeech(answer), { signal: controller.signal })
      await playReply(speech)

      // Hand the turn straight back rather than making them tap to speak again.
      if (conversationRef.current) {
        await startListening()
      } else {
        setState("idle")
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return
      conversationRef.current = false
      setError(err instanceof Error ? err.message : "Something went wrong.")
      setState("error")
    }
  }, [playReply, startListening])

  // The draw loop was created once on mount, so point it at the current handler.
  useEffect(() => {
    endTurnRef.current = () => {
      // Guard: the loop fires every frame, so only the first call should take the turn.
      if (stateRef.current !== "listening") return
      stateRef.current = "thinking"
      void stopAndSend()
    }
  }, [stopAndSend])

  const startConversation = useCallback(async () => {
    conversationRef.current = true
    setTranscript("")
    setReply("")
    await startListening()
  }, [startListening])

  const pauseConversation = useCallback(() => {
    conversationRef.current = false
    abortRef.current?.abort()
    recorderRef.current?.cancel()
    recorderRef.current = null
    audioElRef.current?.pause()
    setState("idle")
  }, [])

  const endSession = () => {
    cleanup()
    router.back()
  }

  const busy = state === "thinking" || state === "speaking"
  const ready = serviceUp === true && Boolean(sessionRef.current)

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-between bg-gradient-to-b from-gray-950 via-blue-950 to-gray-950 px-6 py-10">
      <div className="w-full flex items-center justify-between max-w-3xl">
        <div className="min-w-0">
          <span className="text-sm font-medium text-white/60">OnboardAI voice</span>
          {sectorName && <p className="text-xs text-white/35 truncate">{sectorName}</p>}
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={endSession}
          className="text-white/70 hover:text-white hover:bg-white/10 rounded-full"
          title="Close voice mode"
          aria-label="Close voice mode"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex-1 w-full max-w-3xl flex flex-col items-center justify-center gap-10">
        <div className="relative flex items-center justify-center">
          <div
            className={`absolute w-56 h-56 rounded-full blur-3xl transition-colors duration-500 ${
              state === "speaking" ? "bg-indigo-500/30" : "bg-blue-500/25"
            }`}
          />
          <div
            ref={bubbleRef}
            className={`relative w-40 h-40 rounded-full shadow-2xl will-change-transform ${
              state === "speaking"
                ? "bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-600 shadow-indigo-500/40"
                : "bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 shadow-blue-500/40"
            }`}
            style={{ transition: "opacity 120ms linear" }}
          />
        </div>

        <canvas ref={canvasRef} className="w-full h-24" aria-hidden="true" />

        <div className="text-center min-h-[6rem] max-w-xl">
          <p className="text-lg font-medium text-white/90">{STATE_LABEL[state]}</p>
          {transcript && <p className="mt-3 text-sm text-white/55 italic">“{transcript}”</p>}
          {reply && state !== "thinking" && (
            <p className="mt-2 text-sm text-white/75 line-clamp-3">{reply}</p>
          )}
          {error && <p className="mt-2 text-sm text-red-300">{error}</p>}
          {serviceUp === null && !error && (
            <p className="mt-2 text-sm text-white/40">Connecting to the voice service…</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {conversationRef.current || state === "listening" || busy ? (
          <Button
            onClick={pauseConversation}
            className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 text-white"
            title="Pause the conversation"
            aria-label="Pause the conversation"
          >
            <Square className="h-6 w-6 fill-current" />
          </Button>
        ) : (
          <Button
            onClick={startConversation}
            disabled={!ready}
            className="h-16 w-16 rounded-full bg-white text-gray-900 hover:bg-white/90 disabled:opacity-40"
            title="Start talking"
            aria-label="Start talking"
          >
            <Mic className="h-6 w-6" />
          </Button>
        )}
        <Button
          onClick={endSession}
          variant="ghost"
          className="h-16 px-8 rounded-full text-white/70 hover:text-white hover:bg-white/10"
        >
          End
        </Button>
      </div>
    </div>
  )
}
