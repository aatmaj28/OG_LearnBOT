"""
Health check endpoint
"""
import os
from flask import Blueprint, jsonify

bp = Blueprint("health", __name__)

def _check_qdrant():
    """Check if Qdrant is reachable at QDRANT_URL. Returns dict with status and optional error."""
    url = os.getenv("QDRANT_URL", "").strip()
    if not url:
        return {"qdrant": "not_configured", "message": "QDRANT_URL is not set"}
    try:
        import urllib.request
        # Qdrant uses /readyz for readiness (not /health)
        req = urllib.request.Request(f"{url.rstrip('/')}/readyz", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                return {"qdrant": "reachable", "url": url}
            return {"qdrant": "error", "url": url, "status": resp.status}
    except Exception as e:
        return {"qdrant": "unreachable", "url": url, "error": str(e)}

@bp.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint; includes Qdrant connectivity when QDRANT_URL is set."""
    payload = {"status": "ok", "service": "learnbot-flask-api"}
    payload["qdrant_check"] = _check_qdrant()
    return jsonify(payload)
