#!/usr/bin/env python3
"""
Test Blackwell (vLLM) chat completions FROM THE SERVER.
Run on dash-server: cd /opt/Learnbot-Server && python3 scripts/test_blackwell_chat.py

This checks if the backend can reach 129.10.224.226:8000 and get a response.
"""
import os
import sys

# Load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

url = os.getenv("REMOTE_BLACKWELL_URL", "http://129.10.224.226:8000/v1/chat/completions")
model = os.getenv("REMOTE_BLACKWELL_MODEL", "google/gemma-3-12b-it")

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
