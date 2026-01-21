"""
Configuration settings for Flask app
"""
import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Base configuration"""
    # Database
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", 5432))
    DB_NAME = os.getenv("DB_NAME", "learnbot")
    DB_USER = os.getenv("DB_USER", "postgres")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "")
    
    # Gmail
    GMAIL_USER = os.getenv("GMAIL_USER", "")
    GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
    
    # LLM APIs
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
    CLAUDE_MODEL_ID = os.getenv("CLAUDE_MODEL_ID", "claude-haiku-4-5-20251001")
    REMOTE_OLLAMA_URL = os.getenv("REMOTE_OLLAMA_URL", "http://localhost:5001/api/generate")
    REMOTE_OLLAMA_MODEL = os.getenv("REMOTE_OLLAMA_MODEL", "gemma3:27b")
    REMOTE_BLACKWELL_URL = os.getenv("REMOTE_BLACKWELL_URL", "http://129.10.156.97:8000/v1/chat/completions")
    REMOTE_BLACKWELL_MODEL = os.getenv("REMOTE_BLACKWELL_MODEL", "google/gemma-3-12b-it")
    
    # RAG Configuration
    ENABLE_RERANKING = os.getenv("ENABLE_RERANKING", "false").lower() == "true"
    ENABLE_LLM_GUARDS = os.getenv("ENABLE_LLM_GUARDS", "false").lower() == "true"
    ENABLE_LLM_ANALYTICS = os.getenv("ENABLE_LLM_ANALYTICS", "true").lower() == "true"
    
    # Qdrant
    QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
    QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")
    
    # Flask
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    PORT = int(os.getenv("PORT", 5000))
    DEBUG = os.getenv("FLASK_ENV") == "development"
    
    # CORS
    ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
