"use client"

// STUB from the skeleton (P1); P3 implements it. Contract (CONTRACTS.md › Frontend routes):
//   <VoiceButton onTranscript={(text) => ...} speakText={string | null} />
// P3: record 16-bit PCM WAV in the browser (encodeWav), POST it to `${VOICE_URL}/stt`, pass the text to
// onTranscript; when speakText changes to a string, POST it to `${VOICE_URL}/tts` and play the WAV.
import { Mic } from "lucide-react"
import { Button } from "@/components/ui/button"

export type VoiceButtonProps = {
  onTranscript: (text: string) => void
  speakText?: string | null
}

export function VoiceButton(_props: VoiceButtonProps) {
  return (
    <Button type="button" variant="outline" size="icon" disabled title="Voice input (coming soon)" aria-label="Voice input">
      <Mic className="h-4 w-4" />
    </Button>
  )
}

export default VoiceButton
