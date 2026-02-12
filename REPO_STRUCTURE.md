# LearnBot repo structure – where to push what

## Your workflow (correct)

| What you change | Where to edit | Where to push |
|-----------------|---------------|----------------|
| **Backend** (Python, Flask, DB, routes, services) | **`LearnBot-Backend/`** folder | **LearnBOT-Server** repo: https://github.com/dmsb-dash-labs/LearnBOT-Server.git |
| **UI** (Next.js, pages, components, API routes) | **Repo root**: `app/`, `components/`, `lib/`, etc. | **LearnBot-UI** repo: https://github.com/dmsb-dash-labs/LearnBot-UI.git |

## Deployment: what actually gets built and run

- **LearnBOT-Server** is fine as-is. It’s a separate repo; the **LearnBot-Backend/** folder in this repo is a **git submodule** pointing to it. Backend deployment clones **LearnBOT-Server** to `/opt/Learnbot-Server` (or `-UAT`) and runs from there. No duplicate UI/backend mix.

- **LearnBot-UI** deployment uses the **root** of this repo only. The GitHub Actions workflow checks out the repo, then runs `npm ci`, `npm run build`, and `pm2 start` from the repo root (e.g. `/var/www/Learnbot-UI`). So the **actual files that matter for deployment** are at the root: `app/`, `components/`, `lib/`, `app/api/`, `package.json`, `next.config.mjs`, `ecosystem.config.js`. The root is the source of truth for the UI.

- **LearnBot-Frontend/** was a duplicate/legacy copy of UI code; it has been **removed**. Deployment has always used the repo root only.

## How it works

- **LearnBot-Backend** is a **git submodule**. Its `origin` is **LearnBOT-Server**. So:
  - **Pushes from LearnBot-Backend go to LearnBOT-Server**—any `git push` you do from inside `LearnBot-Backend/` shows up in the LearnBOT-Server repo (same branches, same commits).
  - When you `cd LearnBot-Backend` and run `git push origin main` (or `dynamic-update`), you are pushing to **LearnBOT-Server**.
  - The server deploys from that repo: PROD = `/opt/Learnbot-Server` (main), UAT = `/opt/Learnbot-Server-UAT` (dynamic-update).

- **flask-backend** was a duplicate/leftover backend folder; it has been **removed**. All backend work is in **LearnBot-Backend** (submodule) and pushed to **LearnBOT-Server**.

## Summary

- **LearnBOT-Server**: Backend repo; **LearnBot-Backend/** here is a submodule. Deploy uses LearnBOT-Server only. No issue.
- **LearnBot-UI**: Deploy uses **repo root only** (app/, components/, lib/, app/api/, etc.). Edit root for all UI changes. (LearnBot-Frontend and flask-backend have been removed.)
