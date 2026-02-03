# LearnBot Backend

Flask backend API for LearnBot.

## Setup

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Create `.env` file:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
- Database credentials (DB_HOST, DB_PORT=5432 for standard PostgreSQL, DB_NAME, DB_USER, DB_PASSWORD)
- API keys
- Email configuration
- etc.

5. Run the server:
```bash
python app.py
```

The API will be available at http://localhost:5000

## Production Deployment

For production, use Gunicorn:
```bash
gunicorn -c gunicorn_config.py app:app
```

## Environment Variables

See `.env.example` for all required environment variables.

## Project Structure

- `app.py` - Flask application entry point
- `routes/` - API route handlers
- `services/` - Business logic services
- `utils/` - Utility functions

## Frontend

The frontend is in a separate repository: `LearnBot-Frontend`

Make sure CORS is configured to allow your frontend origin.

## API Endpoints

- `/api/auth/*` - Authentication endpoints
- `/api/users/*` - User management
- `/api/classes/*` - Class management
- `/api/chat/*` - Chat and RAG endpoints
- `/api/corpus/*` - Corpus management
- `/api/analytics/*` - Analytics endpoints

<!-- config sync 2026-02-03 -->
<!-- config sync dynamic-update 2026-02-03 -->
