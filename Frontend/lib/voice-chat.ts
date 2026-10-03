/**
 * One turn of a spoken conversation: send text to the chat backend and get the reply.
 *
 * The chat endpoint queues work on RabbitMQ and returns a taskId, so this polls task-status
 * rather than consuming the SSE stream. Voice needs the whole sentence before it can speak it
 * anyway, so there is nothing to gain from streaming here.
 */

const FLASK_API_URL = (process.env.NEXT_PUBLIC_FLASK_API_URL || "http://localhost:5050").replace(/\/$/, "")

const POLL_INTERVAL_MS = 250
const POLL_TIMEOUT_MS = 180000

function sessionHeaders(): HeadersInit {
  const headers: HeadersInit = { "Content-Type": "application/json" }
  const sessionId = typeof window !== "undefined" ? localStorage.getItem("sessionId") : null
  if (sessionId) headers["X-Session-Id"] = sessionId
  return headers
}

export interface AskOptions {
  userId: string
  conversationId: string
  classId: string
  message: string
  preferredModel?: string
  sourceFile?: string
  signal?: AbortSignal
}

/** Ask the agent and resolve with its full reply text. */
export async function askAgent(options: AskOptions): Promise<string> {
  const res = await fetch(`${FLASK_API_URL}/api/chat/ai-response`, {
    method: "POST",
    headers: sessionHeaders(),
    signal: options.signal,
    body: JSON.stringify({
      message: options.message,
      userId: options.userId,
      sessionId: options.conversationId,
      classId: options.classId,
      sourceFile: options.sourceFile || undefined,
      chatType: "class_material",
      preferredModel: options.preferredModel || "local-nemotron",
      stream: false,
      deepThinking: false,
      // Ask for a spoken-length answer: shorter text is both faster to generate and
      // faster to synthesize, which is most of the delay the user feels.
      voice: true,
    }),
  })

  if (!res.ok) {
    throw new Error(`Chat request failed (${res.status})`)
  }

  const data = await res.json()

  // Queue mode: poll until the worker finishes. Direct mode: the reply is already here.
  if (data.taskId) {
    return pollTask(data.taskId, options.signal)
  }
  const direct = data.response ?? data.result?.response
  if (!direct) throw new Error("The agent returned an empty reply.")
  return direct
}

async function pollTask(taskId: string, signal?: AbortSignal): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError")
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    const res = await fetch(`${FLASK_API_URL}/api/chat/task-status/${taskId}`, { signal })
    if (!res.ok) continue

    const data = await res.json()
    if (data.status === "completed") {
      const text = data.result?.response
      if (!text) throw new Error("The agent returned an empty reply.")
      if (data.result?.modelUsed === "error") throw new Error(text)
      return text
    }
    if (data.status === "failed") {
      throw new Error(data.error || "The agent could not answer that.")
    }
  }

  throw new Error("The agent took too long to respond.")
}
