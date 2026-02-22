# LearnBot - AI-Powered Learning Assistant

A Next.js application that provides AI-powered chat assistance for students and faculty management tools.

<!-- deployment trigger -->

## Features

- 🤖 **AI Chat Interface** - RAG-powered chat system for students
- 👨‍🏫 **Faculty Dashboard** - Class management and student monitoring
- 📊 **Analytics** - Student activity tracking and sentiment analysis
- 🔐 **Authentication** - Role-based access control
- 🗄️ **Database Integration** - PostgreSQL with conversation persistence

## Prerequisites

- Node.js 18+ 
- Python 3.8+ (for RAG system)
- Supabase account (for database)
- Ollama (optional, for fallback AI)

## Quick Start

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd learn-bot
```

### 2. Install Node.js dependencies
```bash
npm install
```

### 3. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 4. Set up environment variables
```bash
# Copy the example environment file
cp env.local.example .env.local

# Edit .env.local with your Supabase database credentials
# Get these from your Supabase project settings > Database
```

Your `.env.local` should look like:
```bash
DB_HOST=your-project.supabase.co
DB_USER=postgres
DB_NAME=postgres
DB_PASSWORD=your-supabase-password
DB_PORT=5432
```

**Note**: For teammates, share the `.env.local` credentials securely (via password manager, secure chat, etc.)

### 5. Set up the RAG system (Required)
The application requires a `vector_store_ra/` directory with the following files:
- `config.json` - Configuration file
- `faiss_index.bin` - FAISS vector index
- `metadata.json` - Document metadata
- `metadata.pkl` - Pickled metadata

**Quick Setup:**
```bash
# Run the setup script to check your vector store
# On Linux/Mac:
chmod +x setup-vector-store.sh
./setup-vector-store.sh

# On Windows:
setup-vector-store.bat
```

**Manual Setup:**
1. Create the directory: `mkdir vector_store_ra`
2. Add the required files (contact the project maintainer for these files)
3. Or set up your own vector store using the VectorStoreManager

**Note**: This directory is not included in the repository due to size. The application will fall back to Ollama if RAG is not available.

### 6. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 7. (Optional) Run the Flask backend locally
Login and other auth use the Flask API. To run it locally:

```bash
cd LearnBot-Backend
# Create a virtualenv and install deps (see LearnBot-Backend README)
pip install -r requirements.txt
# Set DB and other env (or use same .env.local from repo root)
python app.py   # or: flask run (typically port 5000)
```

Keep this running in a separate terminal. Set `NEXT_PUBLIC_FLASK_API_URL=http://localhost:5000` in `.env.local` (see `env.local.example`).

## Project Structure

```
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   ├── faculty/           # Faculty dashboard pages
│   ├── login/             # Authentication pages
│   └── student/           # Student pages
├── components/            # React components
│   └── ui/               # Reusable UI components
├── lib/                   # Utility libraries
│   ├── db.ts             # Database connection
│   ├── rag-service.ts    # RAG AI service
│   └── auth.ts           # Authentication logic
├── files/                 # Course materials (PDFs, docs)
└── vector_store_ra/       # RAG vector store (not in git)
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_HOST` | Database host | `localhost` or Supabase host |
| `DB_NAME` | Database name | `postgres` |
| `DB_PASSWORD` | Database password | (from Supabase or your DB) |
| `DB_PORT` | Database port | `5432` or `5433` (if tunnelled) |
| `GMAIL_USER` | Gmail address (for OTP & password reset emails) | `your@gmail.com` |
| `GMAIL_APP_PASSWORD` | Gmail app password (16-char) | See `env.local.example` |
| `NEXT_PUBLIC_APP_URL` | Full URL of this app (for reset links in email) | `http://localhost:3000` (local) |
| `NEXT_PUBLIC_FLASK_API_URL` | Flask backend URL (for login, etc.) | `http://localhost:5000` (local) |

## Running and testing locally (before production)

**Minimal run (UI only):**
1. Copy env: `cp env.local.example .env.local` and fill in at least `DB_*` (and optionally `GMAIL_*`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_FLASK_API_URL`).
2. Install and run:
   ```bash
   npm install
   npm run dev
   ```
3. Open **http://localhost:3000**.  
   - If the Flask backend is not running, **login will fail**, but you can still test the **Forgot password** flow (dialog, request reset, and reset page).

**Full run (login + forgot password end-to-end):**
1. **Database**: Ensure PostgreSQL is reachable (local or SSH tunnel to Supabase). Set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` in `.env.local`.
2. **Next.js**: `npm install` then `npm run dev` (port 3000).
3. **Flask backend** (for login): Run from `LearnBot-Backend/` on port 5000; set `NEXT_PUBLIC_FLASK_API_URL=http://localhost:5000` in `.env.local`.
4. **Forgot password emails**: In `.env.local` set `GMAIL_USER` and `GMAIL_APP_PASSWORD` (see `env.local.example`). If these are missing, the reset link is only printed in the server console.
5. **Reset link URL**: Set `NEXT_PUBLIC_APP_URL=http://localhost:3000` so the link in the email points to your local app.

**Quick test – Forgot password (no email):**
- Run Next.js and ensure DB is connected.
- Go to http://localhost:3000/login (or `?role=faculty`).
- Click **Forgot password?** → enter an email that exists in your `users` table → **Send reset link**.
- If Gmail is not configured, check the **terminal** where `npm run dev` is running; the reset URL is logged there. Open that URL in the browser, set a new password, then log in (Flask must be running for login).

## Deployment

The project is configured for Vercel deployment:

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy automatically on push to main branch

## Troubleshooting

### RAG System Not Working
- Ensure `vector_store_ra/` directory exists with all required files
- Check Python dependencies are installed
- Verify Ollama is running (for fallback)

### Database Connection Issues
- Verify Supabase credentials in `.env.local`
- Check that your Supabase database is active
- Ensure you're using the correct connection string from Supabase dashboard

### Build Errors
- Run `npm install` to ensure all dependencies are installed
- Check for TypeScript errors with `npm run lint`

### Python Dependencies Not Found
- Make sure Python 3.8+ is installed
- Run `pip install -r requirements.txt` to install all Python packages

## Team Development Setup

This project uses **Supabase** for the shared database, making team collaboration simple:

1. **Database is already hosted**: The project uses a cloud-hosted PostgreSQL database on Supabase
2. **Shared credentials**: Get the `.env.local` file from your team lead
3. **No local database needed**: Everyone connects to the same Supabase instance
4. **No Docker required**: Just install Node.js and Python dependencies

**For new team members:**
1. Clone the repository
2. Run `npm install` and `pip install -r requirements.txt`
3. Get `.env.local` credentials from team lead
4. Run `npm run dev`

**Benefits:**
- ✅ No Docker setup needed
- ✅ No local PostgreSQL installation
- ✅ Everyone sees the same data in real-time
- ✅ Database managed through Supabase dashboard

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.

<!-- config sync 2026-02-03 -->
<!-- config sync 2026-02-03 v2 -->