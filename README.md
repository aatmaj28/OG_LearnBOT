# LearnBOT - AI-Powered Learning Assistant

A Next.js application that provides AI-powered chat assistance for students and faculty management tools.

## Features

- 🤖 **AI Chat Interface** - RAG-powered chat system for students
- 👨‍🏫 **Faculty Dashboard** - Class management and student monitoring
- 📊 **Analytics** - Student activity tracking and sentiment analysis
- 🔐 **Authentication** - Role-based access control
- 🗄️ **Database Integration** - PostgreSQL with conversation persistence

## Prerequisites

- Node.js 18+ 
- PostgreSQL database
- Python 3.8+ (for RAG system)
- Ollama (optional, for fallback AI)

## Quick Start

### 1. Clone the repository
```bash
git clone <your-repo-url>
cd learn-bot
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up environment variables
```bash
# Copy the example environment file
cp .env.example .env.local

# Edit .env.local with your database credentials
# DB_USER=your_db_user
# DB_HOST=your_db_host  
# DB_NAME=your_db_name
# DB_PASSWORD=your_db_password
# DB_PORT=5432
```

### 4. Set up the database

#### Option A: Use Docker (Recommended for Team Development)
```bash
# Start PostgreSQL and the app with Docker
docker-compose up

# This will:
# - Start PostgreSQL with the correct schema
# - Start the Next.js app
# - Automatically create tables and sample data
```

#### Option B: Use Local PostgreSQL
```bash
# Make sure PostgreSQL is running
# Create a database named 'learnbot' (or whatever you set in DB_NAME)
# The app will automatically create tables on first run
```

#### Option C: Connect to Shared Team Database
```bash
# Get database credentials from your team lead
# Update .env.local with shared database details
# Example:
# DB_HOST=your-team-db-host.com
# DB_USER=learnbot_team
# DB_PASSWORD=shared_password
# DB_NAME=learnbot
# DB_PORT=5432
```

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

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_USER` | PostgreSQL username | `postgres` |
| `DB_HOST` | Database host | `localhost` |
| `DB_NAME` | Database name | `learnbot` |
| `DB_PASSWORD` | Database password | `password` |
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
- Verify PostgreSQL is running
- Check database credentials in `.env.local`
- Ensure database exists

### Build Errors
- Run `npm install` to ensure all dependencies are installed
- Check for TypeScript errors with `npm run lint`

## Database Sharing for Team Development

### Option 1: Docker Setup (Easiest)
The project includes Docker configuration for easy team setup:
- `docker-compose.yml` - Sets up PostgreSQL + Next.js app
- `init-schema.sql` - Database schema and sample data
- `Dockerfile` - Next.js application container

**For teammates:**
```bash
git clone <repo-url>
cd learn-bot
docker-compose up
```

**To view the database (optional):**
1. Install pgAdmin: https://www.pgadmin.org/download/
2. Connect with:
   - Host: `localhost`
   - Port: `5432`
   - Database: `learnbot`
   - Username: `postgres`
   - Password: `password`

### Option 2: Shared Database Access
If you want to share your existing database:

1. **Configure PostgreSQL for network access:**
   ```bash
   # Edit postgresql.conf
   listen_addresses = '*'
   
   # Edit pg_hba.conf
   host all all 0.0.0.0/0 md5
   ```

2. **Create team user:**
   ```sql
   CREATE USER learnbot_team WITH PASSWORD 'secure_password';
   GRANT ALL PRIVILEGES ON DATABASE learnbot TO learnbot_team;
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO learnbot_team;
   ```

3. **Share connection details:**
   - Host: Your public IP
   - Port: 5432
   - Database: learnbot
   - Username: learnbot_team
   - Password: [shared password]

### Option 3: Database Dump
Create a complete database backup:
```bash
# Create dump
pg_dump -h localhost -U postgres -d learnbot > learnbot_backup.sql

# Teammates restore
createdb learnbot
psql -d learnbot < learnbot_backup.sql
```

### Option 4: Cloud Database
Set up a shared cloud database:
- **Supabase** (free tier available)
- **Railway** (simple setup)
- **Neon** (serverless PostgreSQL)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.