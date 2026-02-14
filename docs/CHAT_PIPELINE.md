# LearnBot Chat Pipeline: From User Query to Response

This document describes the full pipeline from when a user sends a message in the chat until the response is displayed. All stages run in the backend RAG service (`LearnBot-Backend/lib/llamaindex-rag-service.py`) unless noted.

---

## Pipeline Overview (Sequential)

| # | Stage | What Happens |
|---|--------|----------------|
| 1 | User sends message | Frontend sends the question (and optional attachments) to the backend. |
| 2 | PII + vector store load | Run **in parallel**: PII on query (regex only) and load Qdrant vector store. Wall clock = max(PII, load). |
| 3 | Attachment handling | If present, PDFs/docs are processed and text is appended to the query. |
| 4 | Input Guard | Classifies intent via Gemma/Blackwell (1s timeout; fallback to heuristics). |
| 5 | Bypass handling | If bypass detected: rephrase with Gemma (on-topic) or fixed teaching question; set flag for acknowledgement. |
| 6 | RAG retrieval | Query is embedded, Qdrant is searched, optional rerank; top chunks become context. |
| 7 | Prompt build | System prompt + RAG context + **message history** + current query (+ bypass acknowledgement instruction if needed). |
| 8 | Teaching LLM (streaming) | Gemma/Blackwell vLLM generates the answer; tokens are streamed to the backend. |
| 9 | Formatting | Response is formatted (markdown, emojis, checkpoint rules). |
| 10 | Output Guard | Gemma compares **original user question** vs response; if leak detected with confidence ≥ threshold, response is replaced. |
| 11 | Stream to frontend | Backend streams chunks to the frontend over SSE. |
| 12 | Display | Frontend appends chunks and shows the response to the user. |

---

## Stage Details

### 1. User Sends Message

- **Where:** Frontend (student or faculty chat UI).
- **What:** The user’s message, optional attachments, conversation ID, vector store path, preferred model, TA mode, checkpoint state, etc. are sent to the backend chat endpoint (e.g. `POST /api/chat/ai-response` with streaming).

---

### 2. PII Stripping (Query Only)

- **Purpose:** Remove or mask PII from the **current query** so it is not sent to external models in recognizable form and to avoid bias.
- **Flow:** Blackwell (Gemma/vLLM) is called first; on failure or timeout, regex-based masking is used (NUID, email, DOB, phone, SSN, names in “my name is” contexts, etc.).
- **Scope:** Only the current user message is stripped. Message history is **not** stripped (we rely on query-only PII stripping).
- **Implementation:** Regex only (no vLLM/Blackwell for PII).

---

### 3. Attachment Handling

- **What:** If the request includes attachments (e.g. PDF, CSV, text), the backend extracts text and optionally summarizes long documents with Blackwell. The resulting text is appended to the query so RAG and the teaching model see it.

---

### 4. PII + Vector Store Load (Parallel), Then Input Guard

- **Purpose:** Reduce TTFT by running PII and vector load in parallel (wall clock = max of the two).
- **Vector store load:** The embedding model is loaded if needed (or reused); the Qdrant vector store for the class is loaded. Stores are cached so repeat requests see ~0s load after preload.
- **PII:** Query is stripped of PII (regex only). Runs in parallel with vector load.
- **Input Guard (after parallel):** A Gemma/Blackwell vLLM call classifies the user message (1s timeout; fallback to heuristics):
  - **Intent:** e.g. conceptual_learning, homework_question, bypass_attempt, off_topic.
  - **Flags:** is_checkpoint_response, has_specific_numbers, is_homework_question, bypass_attempt, problem_type, requires_formula.
  - **teaching_query:** Optional rephrase from the guard (less used now; see Bypass handling).
- **Output:** `guard_result` (intent + flags) and `store_data` (index, metadata) for the next stages.

---

### 5. Bypass Handling

- **Purpose:** When the user is asking for a direct answer or trying to bypass teaching, we redirect to a teaching-style question so RAG and the teaching model stay on topic and pedagogically sound.
- **Trigger:** `guard_result.bypass_attempt === true`.
- **Flow:**
  1. **Original query preserved:** `original_user_query = query` (used later for Output Guard and for “what the user actually asked”).
  2. **Rephrase with Gemma:** `rephrase_bypass_query_with_gemma(query)` asks Gemma to turn the message into a **single teaching-style question on the same topic**. That becomes the new `query` for RAG and the teaching LLM.
  3. **Fallback:** If Gemma fails or returns nothing, we use fixed context-aware questions (e.g. “What type of problem is this?”, “What formula would you use?”) based on checkpoint state.
  4. **Flag:** `bypass_attempt_occurred = true` so the teaching prompt can ask the model to acknowledge the bypass in its first sentence.

---

### 6. RAG Retrieval

- **Input:** The current `query` (possibly rephrased in bypass handling), vector store index, and class filter if applicable.
- **Steps:**
  - Query is turned into an embedding and sent to Qdrant.
  - Top-k chunks are retrieved (and optionally reranked).
  - Chunks are trimmed to a final count (e.g. top 3 for class material, 8 for syllabus).
- **Output:** `final_results` — list of chunks that form the “Context from textbook” in the prompt.

---

### 7. Prompt Build

- **Context:** RAG chunks are formatted into `context_text`.
- **Message history:**
  - **Last 6 messages** are included in full (roughly 3 user + 3 assistant).
  - If there are **more than 6** messages, **older** messages are **summarized** via `summarize_older_messages()` and that summary is prepended; then the last 6 are appended in full.
  - For **Blackwell/Gemma**, the “Previous conversation” string is capped at **2000 characters** to respect vLLM limits.
- **Current question:** The `query` (rephrased or not) is added as “Student question”.
- **Bypass acknowledgement:** If `bypass_attempt_occurred` is true, an instruction is added telling the model to acknowledge in the first sentence that the user was asking for a direct answer and that the bot will guide them instead, then continue with the teaching response.
- **Result:** `full_prompt` (and `final_system_prompt`) passed to the teaching LLM.

---

### 8. Teaching LLM (Streaming)

- **Model:** Gemma/Blackwell vLLM (or fallbacks: Ollama, Claude) as per `preferred_model`.
- **Behavior:** Generates a teaching response following the system prompt (checkpoints, no direct answers, formatting rules). Response is **streamed** token-by-token to the backend, which forwards chunks to the frontend via SSE.
- **Output:** Full `teaching_response` text after the stream completes.

---

### 9. Formatting

- **What:** Post-processing enforces formatting rules (e.g. checkpoint names, numbered lists, bold, spacing). Optional emoji handling. Document-acknowledgement prefix if attachments were used.
- **Result:** The string that will be sent to the user (before Output Guard).

---

### 10. Output Guard

- **Purpose:** Check that the model did not inadvertently give away the **final answer** to the **original** user question.
- **Input:** **Original user question** (`original_user_query`) and the current `teaching_response`.
- **Flow:**
  1. Gemma/Blackwell is called with both the question and the response and asked whether the response inappropriately gives away the final answer. It returns `leak_detected` (true/false) and `confidence` (0–1).
  2. We only **replace** the response (block the “leak”) when **both** are true: `leak_detected === true` and `confidence >= OUTPUT_GUARD_CONFIDENCE_THRESHOLD` (default **0.60**).
  3. If the Gemma call fails, a pattern-based fallback runs (phrases like “the answer is”, “therefore =”, dollar amounts, etc.). Replacement is conservative so normal teaching responses are not over-flagged.
- **On “leak”:** The response is replaced with a short teaching redirect (e.g. “Let’s start by identifying the problem…”) depending on checkpoint state.
- **Config:** `OUTPUT_GUARD_CONFIDENCE_THRESHOLD` (default `0.60`). Lower = stricter, higher = more permissive.

---

### 11–12. Stream to Frontend & Display

- **Backend:** Streams SSE chunks to the client until the full response is sent.
- **Frontend:** Appends each chunk to the assistant message and updates the UI (and metadata such as time-to-first-token / total time when the stream ends).

---

## Summary Table: What Uses What

| Component | Model / System |
|-----------|-----------------|
| PII stripping (query) | Regex only |
| Input Guard | Blackwell (Gemma/vLLM) |
| Bypass rephrase | Blackwell (Gemma/vLLM) |
| RAG embedding | Sentence-transformers (e.g. nomic-embed-text-v1.5) |
| RAG retrieval | Qdrant + LlamaIndex |
| Teaching response | Blackwell (Gemma/vLLM) or Ollama/Claude fallback |
| Output Guard | Blackwell (Gemma/vLLM) + pattern fallback |

---

## Configuration (Environment)

| Variable | Purpose | Default |
|----------|---------|--------|
| `FAST_TTFT` | 1-3s TTFT: heuristic-only Input Guard (PII is always regex-only) | `false` |
| `ENABLE_LLM_GUARDS` | Use LLM for Input Guard; when false, heuristic only | `true` |
| `OUTPUT_GUARD_CONFIDENCE_THRESHOLD` | Min confidence to treat Output Guard as “leak” and replace response | `0.60` |
| `REMOTE_BLACKWELL_URL` | Blackwell/Gemma vLLM endpoint | (e.g. `http://...:8000/v1/chat/completions`) |
| `REMOTE_BLACKWELL_MODEL` | Model name (e.g. `google/gemma-3-12b-it`) | (set in env) |

---

## Message History Sent to the Model

- **Included:** Last **6** messages in full.
- **Older messages:** Summarized and prepended.
- **Blackwell:** “Previous conversation” text is truncated to **2000** characters.
- **PII:** Only the **current query** is PII-stripped; history is sent as stored (no separate PII stripping on history).

---

## Optimizations in Place

1. **Pre-warm on load:** When the RAG module is loaded (e.g. by Flask), embedding model and vector stores are preloaded in the background to reduce first-request latency.
2. **Parallel load + guard:** Vector store load and Input Guard run in parallel to cut time to first token.
3. **PII:** Regex-only on the query (no vLLM/Blackwell).
4. **Bypass:** Gemma rephrases bypass attempts into an on-topic teaching question so RAG and the teaching response stay relevant.
5. **Output Guard:** Gemma compares response to the **original** user question with a confidence threshold (default 0.60) to avoid over-blocking normal teaching responses.
6. **TTFT 1–3s:** PII (regex-only) and vector load run in parallel; Input Guard has 1s timeout; optional `FAST_TTFT=true` uses heuristic guard only for fastest path.

---

## Target TTFT 1–3 seconds

- **Preload at startup:** Flask loads the RAG module on startup so embedding + vector stores preload in the background; first request often sees vector load ~0s.
- **PII + load in parallel:** Wall clock = max(PII time, load time) instead of PII + load.
- **Input Guard 1s timeout:** If the guard LLM doesn’t respond in 1s, we use heuristics so we don’t add more than 1s before the Teaching LLM.
- **FAST_TTFT=true:** Set in env for fastest TTFT: heuristic-only Input Guard (~0s). No LLM calls before the Teaching LLM. Bypass/intent detection is keyword-based only. (PII is always regex-only.)

---

*Last updated to reflect: PII query-only stripping, no history PII; Input Guard + parallel vector load; bypass rephrase with Gemma + acknowledgement in prompt; Output Guard with confidence threshold 0.60; message history (last 6 + older summarized, 2000-char cap for Blackwell).*
