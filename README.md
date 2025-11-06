# LearnBot - AI-Powered Learning Assistant

A Next.js application that provides AI-powered chat assistance for students and faculty management tools.

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
| `DB_HOST` | Supabase database host | `your-project.supabase.co` |
| `DB_NAME` | Database name | `postgres` |
| `DB_PASSWORD` | Supabase database password | (from Supabase dashboard) |
| `DB_PORT` | Database port | `5432` |

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