#!/usr/bin/env python3
"""
Test Blackwell (vLLM) chat completions FROM THE SERVER.
Run on dash-server: cd /opt/Learnbot-Server && python3 scripts/test_blackwell_chat.py

This checks if the backend can reach 129.10.224.226:8000 and get a response.
"""
import os
import sys

# Load .env from project root (parent of scripts/) so it works from any cwd
_script_dir = os.path.dirname(os.path.abspath(__file__))
_project_root = os.path.dirname(_script_dir)
_env_path = os.path.join(_project_root, ".env")
try:
    from dotenv import load_dotenv
    load_dotenv(_env_path)
except ImportError:
    pass

url = (os.getenv("REMOTE_BLACKWELL_URL") or "http://129.10.224.226:8000/v1/chat/completions").strip()
model = (os.getenv("REMOTE_BLACKWELL_MODEL") or "google/gemma-3-12b-it").strip()

def main():
    import requests
    print(f"POST {url}", file=sys.stderr)
    print(f"model={model}", file=sys.stderr)
    try:
        r = requests.post(
            url,
            json={
                "model": model,
                "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
                "max_tokens": 50,
                "stream": False,
            },
            timeout=30,
        )
        print(f"status={r.status_code}", file=sys.stderr)
        print(r.text[:1000])
        if r.status_code == 200:
            data = r.json()
            content = (data.get("choices") or [{}])[0].get("message", {}).get("content", "")
            print(f"\n-> content: {content!r}", file=sys.stderr)
        else:
            print(f"\n-> non-200, check URL/model", file=sys.stderr)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
