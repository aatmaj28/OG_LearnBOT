# OG_LearnBOT

Monorepo for LearnBOT.

| Folder | Contents | Source |
| --- | --- | --- |
| [`Frontend/`](Frontend/) | Next.js UI | [dmsb-dash-labs/LearnBot-UI](https://github.com/dmsb-dash-labs/LearnBot-UI) |
| [`Backend/`](Backend/) | Flask API + chat worker | [dmsb-dash-labs/LearnBOT-Server](https://github.com/dmsb-dash-labs/LearnBOT-Server) |

## Running locally

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
