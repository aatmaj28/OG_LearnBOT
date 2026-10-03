# OG_LearnBOT

Monorepo for LearnBOT: an onboarding assistant for new developers that runs entirely on a Dell GB10. Managers
connect project repositories; new employees ask about the code (answers cite files and lines), learn
interactively and give feedback; managers see who is struggling and which docs need fixing. Interfaces between
the three owners are in [`CONTRACTS.md`](CONTRACTS.md).

| Folder | Contents |
| --- | --- |
| [`Backend/app/`](Backend/app/) | FastAPI + LangGraph backend (agents, RAG, routers) |
| [`Backend/data/`](Backend/data/) | Employees, fake history, projects, meetings; runtime index/events (gitignored) |
| [`Frontend/`](Frontend/) | Next.js UI, exported as static files and served by the backend at `/` |
| `Backend/app.py`, `Backend/routes/` | Legacy Flask API (from [LearnBOT-Server](https://github.com/dmsb-dash-labs/LearnBOT-Server)), kept until merge time |

## Local development

### SSH tunnel

The model, the embeddings and the voice service run on the GB10. Keep this tunnel open:

```bash
ssh -N -L 21434:127.0.0.1:11434 -L 8100:127.0.0.1:8100 -L 18000:127.0.0.1:8000 dell@172.20.65.152
```

| Local port | GB10 service |
| --- | --- |
| 21434 | Ollama: chat model (`/v1`) and embeddings (`/api/embed`) |
| 8100 | Voice service (STT/TTS), called by the browser only |
| 18000 | LearnBOT running in the GB10 sandbox |

### Backend and frontend

```bash
cp .env.example .env            # defaults point at the tunnel
npm run setup:app               # Backend/.venv-app with only the allowed packages (Backend/requirements-app.txt)
npm run dev:app                 # FastAPI on http://localhost:8001 (API under /api)
npm run build:web               # static frontend in Frontend/out, served by the backend at /
```

For frontend work with hot reload: `cd Frontend && NEXT_PUBLIC_API_BASE=http://localhost:8001 npm run dev`.
Port 8001 is used locally because 8000 is often taken by an OpenShell forward.

## Legacy Flask stack (running locally)

```
Browser ──► Next.js  :3000 ──┐
   │                         ├──► Postgres :5433   Qdrant :6333
   └──────► Flask    :5050 ──┤
              ▲   │          └──► Redis    :6379   RabbitMQ :5672
              │   ▼
            worker.py (RabbitMQ → Flask)
```

The browser calls Flask directly for login, classes, chat and course materials. Flask owns all
uploaded course files (`Backend/vector_stores/`) and their Qdrant chunks; a few Next.js API routes
query Postgres directly (e.g. password reset). Postgres, Qdrant, Redis and RabbitMQ run in Docker;
the three app processes run on your machine.

### Prerequisites

- Node.js 20+
- Docker with Compose (Docker Desktop, or `brew install colima docker docker-compose`)
- [uv](https://docs.astral.sh/uv/) (recommended) or Python 3.10+

### First time

```bash
export ANTHROPIC_API_KEY=sk-ant-...   # optional, written into the env files for you
npm run setup
```

This writes `Backend/.env` and `Frontend/.env.local` from [`scripts/env/`](scripts/env/), creates
`Backend/.venv`, and installs npm packages. Existing env files are left alone.

Chat needs a model: set `ANTHROPIC_API_KEY` in `Backend/.env`, or be on the Northeastern
network/VPN so the Blackwell lab server is reachable.

### Every day

```bash
npm run dev
```

Starts the Docker services, then Next.js, Flask and the worker with prefixed logs. Ctrl-C stops
the apps; the containers keep running until `npm run infra:down`.

Open http://localhost:3000 and sign in with a seeded account:

| Role | Email | Password |
| --- | --- | --- |
| Faculty | `faculty@northeastern.edu` | `faculty123` |
| Student | `student@northeastern.edu` | `student123` |

The first Flask start downloads the embedding model (~550 MB), so the first chat takes a while.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Docker services + all three apps |
| `npm run dev:web` / `dev:api` / `dev:worker` | One app on its own |
| `npm run infra:up` / `infra:down` | Start / stop the Docker services |
| `npm run infra:logs` | Follow Docker service logs |
| `npm run infra:reset` | **Deletes all local data** and re-creates the database from `Frontend/init-schema.sql` |

### Ports

| Service | URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| Flask API | http://localhost:5050 (5000 is taken by macOS AirPlay) |
| Qdrant dashboard | http://localhost:6333/dashboard |
| RabbitMQ management | http://localhost:15672 (`learnbot` / `learnbot123`) |
| Postgres | `postgresql://learnbot:learnbot_local@localhost:5433/learnbot` |

### Passwords

Passwords are stored as bcrypt hashes (`Backend/utils/passwords.py`, `Frontend/lib/password.ts`).
For a database created before hashing was added, run this once from `Backend/` to hash the
remaining plaintext passwords (`--dry-run` to only count them):

```bash
python scripts/hash_existing_passwords.py
```

Until then, plaintext rows still log in and are upgraded to a hash on each user's next login.
