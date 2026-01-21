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
# Allow frontend origins (local dev and production)
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://129.10.157.227:3021,http://129.10.157.227:3022").split(",")
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

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    debug = os.getenv("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug)
