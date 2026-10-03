"""LearnBOT FastAPI backend.

This regular package (with __init__.py) takes precedence over the legacy Flask entry point Backend/app.py,
so `import app` / `uvicorn app.main:app` resolve here. The legacy Flask server still runs as `python app.py`.
"""
