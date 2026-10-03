# LearnBOT CONTRACTS (frozen; changes only through Person 1 / AJ)

## Branches
Integration branch: AJ (created from ui). Teammates branch from AJ: p2-learn-manager, p3-voice-team. AJ merges them at the end.

## Env (.env.example)
LLM_BASE_URL=http://localhost:21434/v1        # prod (GB10 sandbox): https://inference.local/v1
LLM_MODEL=nemotron-3.5-lightning:30b
LLM_API_KEY=local
EMBED_URL=http://localhost:21434/api/embed    # prod: http://host.openshell.internal:11435/api/embed (+ OLLAMA_PROXY_TOKEN)
EMBED_MODEL=nemotron-embed-1b-v2              # needs "query: " / "passage: " prefixes
OLLAMA_PROXY_TOKEN=                           # prod only
VOICE_URL=http://localhost:8100               # BROWSER ONLY. Backend never calls voice.
DATA_DIR=Backend/data
DEMO_EMPLOYEE_ID=emp_demo                     # "Alex, new backend engineer"
Dev tunnel: ssh -N -L 21434:127.0.0.1:11434 -L 8100:127.0.0.1:8100 -L 18000:127.0.0.1:8000 dell@172.20.65.152

## Allowed Python packages: openai fastapi uvicorn numpy pydantic python-multipart httpx langgraph. NO OTHERS. Git via the git CLI.

## AGENT FRAMEWORK
FastAPI + LangGraph. No langchain-openai/ChatOpenAI/create_react_agent; LangGraph nodes call core.llm (openai client).
ALL agents are owned by P1 in Backend/app/agents/. P2 and P3 only CALL them:
agents.ask_agent.run(message, employee_id, project_id=None, think=False) -> {answer, citations:[Chunk], unanswered:bool, steps:[str]}
agents.learn_agent.start(employee_id, topic=None, path=None, project_id=None) -> {session_id, material:[Chunk], questions:[{id,q,type}]}
agents.learn_agent.answer(session_id, question_id, answer) -> {correct:bool, score:0-1, feedback, gap_concepts:[str], citation:Chunk, next:"reteach"|"next"|"done", reteach:str|null}
agents.insights_agent.report(analytics:dict) -> {summary, at_risk:[{employee_id,reason}], doc_fixes:[{path,section,problem,suggestion}], actions:[str]}
agents.meeting_agent.summarize(title, attendees:[str], transcript) -> {summary, decisions:[], action_items:[{owner,task,due}], notes:[], open_questions:[]}

## Ownership (only the owner edits these paths)
P1 (AJ): Backend/app/main.py, Backend/app/core/**, Backend/app/rag/**, Backend/app/agents/**, Backend/app/routers/chat.py, files.py, admin.py, projects.py, Backend/data/projects.json,
         Frontend shell (layout, nav, router, employee switcher, src/lib/api.*), pages chat/**, files/**, manager-projects/**, deploy.sh, .env.example, CONTRACTS.md
P2: Backend/app/analytics/** (metrics, at-risk rules, fake-data loading), Backend/app/routers/learn.py, feedback.py, analytics.py (call learn_agent / insights_agent),
    Backend/data/employees.json, Backend/data/fake/**, Frontend pages learn/**, experience/**, manager/** (dashboard)
P3: Backend/app/team/** (meeting storage), Backend/app/routers/team.py (calls meeting_agent), Backend/data/meetings/**, Frontend components/voice/**, pages team/**

## Shared Python helpers (P1)
core.llm.chat(messages, think=False) -> str ; core.llm.chat_json(messages, think=False) -> dict
core.embed.embed(texts, kind="query"|"passage") -> list[list[float]]
core.events.log_event(type, employee_id, **fields)    # data/events.jsonl
core.store.read_json(name, default) / write_json(name, obj)
rag.search.search(query, k=6, sources=None, project_ids=None) -> list[Chunk]
rag.files.list_files(project_id) -> list[str]; rag.files.get_file(project_id, path) -> {"path","text"}
Chunk = {"id","project_id","source_type":"code"|"doc"|"meeting","path","title","section","start_line","end_line","text","score"}

## Events (data/events.jsonl)
{"ts","employee_id","type","topic","path","project_id","score","details"}
types: chat_question | chat_unanswered | file_view | learn_attempt | experience_feedback | meeting_summary

## API (all under /api)
P1: GET /health | GET /employees | POST /chat {message, employee_id, project_id?, think?} | GET /files?project_id= | GET /files/content?project_id=&path=
    GET /projects | POST /projects {name, git_url|local_path, branch, token?} | POST /projects/{id}/sync | POST /projects/{id}/members {employee_ids} | POST /admin/reindex
P2: POST /learn/start {employee_id, topic|path, project_id?} | POST /learn/answer {session_id, question_id, answer}
    POST /feedback/experience {employee_id, rating 1-5, understood:[str], confusing:[str], comment}
    GET /analytics/overview | GET /analytics/employee/{id} | GET /analytics/doc-gaps | GET /analytics/report
P3: POST /team/summarize {title, attendees:[str], transcript} | GET /team/meetings | GET /team/meetings/{id}

## Voice service (GB10 host; browser only, through the tunnel)
POST /stt (16-bit PCM WAV only) ?engine=parakeet|whisper&language=en|hi ; POST /tts {"text","voice"} -> wav ; GET /health

## Data
Backend/data/repos/{project_id}/ = cloned project repos (gitignored) | Backend/data/projects.json (P1)
Backend/data/docs/ = extra docs | Backend/data/meetings/ = P3 writes {id}.json + {id}.md (indexed by P1)
Backend/data/index/, events.jsonl, memory/ = runtime (gitignored)

## Frontend routes
/employee/chat (P1) | /employee/files (P1) | /employee/learn (P2) | /employee/experience (P2) | /manager (P2) | /manager/projects (P1) | /team/meetings (P3)
<VoiceButton onTranscript={(text)=>...} speakText={string|null}/> from components/voice/VoiceButton (stub by P1, implemented by P3)
