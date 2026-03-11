"""
LearnBot Flask Backend
Main application entry point
"""
from flask import Flask
from flask_cors import CORS
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Create Flask app
app = Flask(__name__)

# Configure CORS
# Allow frontend origins (local dev and production); strip whitespace so "origin1, origin2" works
_allowed_default = "https://learnbot.dashlab.studio,http://learnbot.dashlab.studio,http://localhost:3000,http://129.10.224.227:3030,http://129.10.224.227:3031"
allowed_origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _allowed_default).split(",") if o.strip()]
CORS(app, resources={
    r"/api/*": {
        "origins": allowed_origins,
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization", "X-Session-Id", "X-User-Id"]
    }
})

# Import routes
try:
    from routes import health
    app.register_blueprint(health.bp)
except ImportError:
    pass

try:
    from routes import auth
    app.register_blueprint(auth.bp, url_prefix="/api/auth")
except ImportError:
    pass

try:
    from routes import users
    app.register_blueprint(users.bp, url_prefix="/api/users")
except ImportError:
    pass

try:
    from routes import students
    app.register_blueprint(students.bp, url_prefix="/api/students")
except ImportError:
    pass

try:
    from routes import classes
    app.register_blueprint(classes.bp, url_prefix="/api/classes")
except ImportError:
    pass

try:
    from routes import chat
    app.register_blueprint(chat.bp, url_prefix="/api/chat")
    # Register RAG endpoints under /api/rag for backward compatibility
    if hasattr(chat, 'rag_bp'):
        app.register_blueprint(chat.rag_bp, url_prefix="/api/rag")
    # Load RAG module at startup so embedding + vector store preload start immediately (reduces first-request TTFT)
    if hasattr(chat, 'trigger_rag_preload_at_startup'):
        chat.trigger_rag_preload_at_startup()
except ImportError:
    pass

try:
    from routes import corpus
    app.register_blueprint(corpus.bp, url_prefix="/api/corpus")
except ImportError:
    pass

try:
    from routes import analytics
    app.register_blueprint(analytics.bp, url_prefix="/api/analytics")
except ImportError:
    pass

@app.route("/")
def index():
    return {"status": "ok", "message": "LearnBot Flask API"}

def run_migrations():
    """Run database migrations on startup - creates tables if they don't exist"""
    try:
        from services.db_service import get_connection, return_connection
        conn = get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS pending_class_enrollments (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(255) NOT NULL,
                    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
                    faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT NOW(),
                    UNIQUE(email, class_id)
                );
                CREATE INDEX IF NOT EXISTS idx_pending_class_enrollments_email 
                ON pending_class_enrollments(email);
            """)
            conn.commit()
            print("✅ Database migrations completed successfully")
        except Exception as e:
            conn.rollback()
            print(f"⚠️ Database migration warning: {e}")
        finally:
            return_connection(conn)
    except Exception as e:
        print(f"⚠️ Could not run migrations: {e}")

if __name__ == "__main__":
    run_migrations()
    # Log the persistent file storage path so operators can verify it
    from routes.classes import FILE_STORAGE_PATH
    print(f"📂 FILE_STORAGE_PATH = {FILE_STORAGE_PATH}")
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)

# Test change for CI/CD troubleshooting - 2026-03-11
# No functional impact
