import os
from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

# Import your routes module
try:
    from routes import create_blueprints
except ImportError:
    print("⚠️  routes module not found, creating basic Flask app")
    create_blueprints = None

# Load environment variables conditionally based on NODE_ENV
load_dotenv()  # Always load .env first
if os.environ.get('NODE_ENV') == 'development':
    load_dotenv('.env.local', override=True)  # Override with .env.local in development


def create_app():
    """Initialize Flask app and register blueprints."""
    app = Flask(__name__)

    # Configure CORS for internal API calls from Node.js
    CORS(app, origins=['http://localhost:8001', 'http://localhost:8002', 'http://127.0.0.1:8001', 'http://127.0.0.1:8002'])

    # Basic health check route for internal monitoring
    @app.route('/health')
    def health():
        return {
            "status": "healthy",
            "service": "essaybot-flask-internal",
            "port": os.environ.get('FLASK_PORT', 6001),
            "note": "Internal API for Node.js"
        }

    @app.route('/')
    def hello():
        return {
            "message": "ESSAYBOT Flask Internal API",
            "service": "python-internal-api",
            "blueprints_loaded": create_blueprints is not None,
            "note": "This API is called internally by Node.js Express server"
        }

    # ✅ Register all blueprints if routes module exists
    if create_blueprints:
        for blueprint in create_blueprints():
            app.register_blueprint(blueprint)
            print(f"✅ Registered blueprint: {blueprint.name}")
    else:
        print("⚠️  No blueprints to register")

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get('FLASK_PORT', 6001))
    debug_mode = os.environ.get('FLASK_ENV', 'production') != 'production'

    print(f"🚀 Starting Flask Internal API on port {port}")
    print(f"🔗 This API will be called internally by Node.js Express server")
    app.run(debug=debug_mode, host="127.0.0.1",
            port=port)  # Only localhost access
