# LearnBOT — Workers Calculation & Load Balancing

**Date:** February 23, 2026  
**Target:** 1,100 registered users → 700 concurrent → 200-300 active LLM requests  
**Immediate Target:** 50 students testing simultaneously (next week)

---

## Team Lead's Guidance — Alignment Check

| Team Lead's Advice | Our Plan | Status |
|---|---|---|
| "Turn all your endpoints async" | `/api/chat/ai-response` becomes async (returns task ID instantly) | ✅ |
| "Put queues and workers in front of your endpoints" | RabbitMQ queue + threaded workers in front of the chat endpoint | ✅ |
| "Horizontal scaling for every service" | Workers scale via PM2 `instances` config (one-line change) | ✅ |
| "As per the context from the load test" | Load test showed `/ai-response` is the sole bottleneck → fixing exactly that | ✅ |

### RabbitMQ User Setup

**Credentials:** Dedicated `learnbot` user (✅ created) — regex permissions restrict access to `learnbot.*` queues only. Cannot touch EssayBOT's `essay.*` queues.

```
User        Permissions (configure | write | read)
essaybot    .*              .*              .*            ← admin
learnbot    learnbot\..*    learnbot\..*    learnbot\..*  ← isolated
```

Connection URL: `amqp://learnbot:learnbot123@localhost:5672`

---

## Current Architecture (Synchronous — Broken at Scale)

```
Student clicks Send → Flask BLOCKS for 20-60s → Gunicorn worker STUCK → Student stares at frozen screen
```

### Load Test Evidence (k6 Results)

| VUs | Chat Avg | Chat Max | Login Max | Interrupted | Result |
|---|---|---|---|---|---|
| **30** | 23.4s | 36s | 289ms | 0 | ✅ Pass |
| **50** | 31.5s | 52.5s | 9.1s | 15 | ✅ Pass |
| **100** | 40.5s | **60.0s** | **17.8s** | **64** | ❌ Failed |

---

## New Architecture (RabbitMQ + Threaded Workers)

```
Student clicks Send → Flask publishes to RabbitMQ (instantly, <200ms) → Worker processes in background
→ Streams results via Redis pub/sub → SSE → Student sees words appear one-by-one
```

### Improvements

| Metric | Before (Sync) | After (RabbitMQ + Threaded Workers) |
|---|---|---|
| API Response Time | 20-60s (blocked) | **<200ms** (instant) |
| Login at 100 VUs | **17.8 seconds** | **<50ms** |
| User Experience | Frozen screen | Instant "Thinking..." + streaming |
| Scalability | Limited by Gunicorn workers | Horizontal via PM2 `instances` |

---

## Worker Design Decision: ThreadPoolExecutor

### Options Evaluated

| Factor | Sync (1/worker) | **Threaded (5/worker)** ✅ | Full Async |
|---|---|---|---|
| Concurrency per worker | 1 | **5** | 50-100 |
| 50 students → workers needed | 50 | **10** | 2-3 |
| RAM for 50 concurrent | 1.7GB | **350MB** | ~100MB |
| RabbitMQ library | pika ✅ | **pika ✅** | aio-pika (different) |
| RAG code changes | None ✅ | **None ✅** | Full rewrite |
| Development time | 1 day | **1 day** | 3-5 days |
| If worker crashes | 1 request lost | 5 requests lost | Many lost |
| Scaling at 700 users | 300 workers 😬 | **50 workers** | 10 workers |

**Decision:** ThreadPoolExecutor — best balance of efficiency and simplicity. Same `pika` library as EssayBOT, `process_query()` runs unchanged.

### Direct process_query() Call (Better Than EssayBOT)

```
EssayBOT:  Worker → HTTP → Flask → process function    (Python↔Node.js bridge needed)
LearnBOT:  Worker → process_query() directly            (both Python, no middleman)
```
~50ms faster per request, one less failure point.

---

## Worker Count Calculation

| Phase | Workers | Threads/Worker | Total Concurrent | RAM | Queue for 50 |
|---|---|---|---|---|---|
| **Phase 1 (50 students)** | **10** | **5** | **50** | **350MB** | **None** ✅ |
| Phase 2 (200 students) | 15 | 5 | 75 | 525MB | Minimal |
| Phase 3 (700 concurrent) | 50 | 5 | 250 | 1.7GB | Some queuing |

### Queue UX for Waiting Students

When all workers are busy:
1. API responds **instantly** (<200ms) with `{ taskId, status: "queued" }`
2. Student sees **loading spinner + "LearnBOT is thinking..."**
3. Worker picks up task → chunks stream word-by-word
4. Student **never sees frozen or error screen**

---

## LLM Throughput (Load Test Data)

| Concurrent to vLLM | Avg Response | Throughput |
|---|---|---|
| 1-5 | ~17-19s | 0.3/sec |
| 30 | ~23.4s | **1.3/sec** |
| 50 | ~31.5s | **1.6/sec** |
| 100 | ~40.5s | **2.5/sec** |

> vLLM continuous batching: more concurrent = higher throughput but higher per-request latency.

---

## How Modern Apps Handle 10,000+ Users

Our approach (threaded workers on self-hosted GPU) is standard for self-hosted LLM apps. Large apps differ because:

| Approach | Effect |
|---|---|
| **Cloud LLM APIs** (OpenAI/Claude) | Thousands of GPUs → no degradation under concurrency |
| **Faster/smaller models** | 2s per request → fewer workers needed |
| **Auto-scaling** (AWS/GCP) | Workers spin up/down with demand |
| **Caching** | Same question → cached response, no LLM call |
| **GPU clusters** | Multiple GPUs behind load balancer |

**For LearnBOT Phase 3:** Claude API fallback (once firewall egress approved) + potential second GPU/vLLM instance.

---

## Server Resource Impact

| Resource | Total | LearnBOT Workers (10) | Impact |
|---|---|---|---|
| **RAM** | 124 GB | +350 MB | Negligible |
| **CPU** | 32 cores | I/O bound (minimal CPU) | Negligible |
| **GPU** | 48 GB VRAM | Shared with EssayBOT | Acceptable |

---

## Summary

| Decision | Value | Rationale |
|---|---|---|
| **Worker count** | **10** | 50 concurrent (10×5 threads), zero queue for 50 students |
| **Concurrency model** | **ThreadPoolExecutor(5)** | Optimal balance: simple code, efficient RAM, proven pika library |
| **Queue system** | **RabbitMQ** (existing Docker) | Zero installation, separate `learnbot.*` queues |
| **Result streaming** | **Redis pub/sub → SSE** | Real-time word-by-word streaming |
| **Redis role** | Status storage + streaming | `learnbot:task:<id>` + `learnbot:stream:<id>` |
| **EssayBOT isolation** | Separate queues + key prefixes | Zero interference guaranteed |
