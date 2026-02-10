#!/usr/bin/env python3
"""
Test Claude (Anthropic) chat FROM THE SERVER.
Run on dash-server: cd /opt/Learnbot-Server && python3 scripts/test_claude_chat.py

This checks if the backend can reach api.anthropic.com and get a response.
"""
import os
import sys

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

api_key = os.getenv("ANTHROPIC_API_KEY", "")
model = os.getenv("CLAUDE_MODEL_ID", "claude-sonnet-4-20250514")

def main():
    if not api_key or "your-" in api_key or "sk-ant-" not in api_key:
        print("ERROR: ANTHROPIC_API_KEY not set or invalid in .env", file=sys.stderr)
        sys.exit(1)
    import requests
    url = "https://api.anthropic.com/v1/messages"
    print(f"POST {url}", file=sys.stderr)
    print(f"model={model}", file=sys.stderr)
    try:
        r = requests.post(
            url,
            headers={
                "Content-Type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            json={
                "model": model,
                "max_tokens": 50,
                "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
                "temperature": 0.1,
            },
            timeout=30,
        )
        print(f"status={r.status_code}", file=sys.stderr)
        print(r.text[:1500])
        if r.status_code == 200:
            data = r.json()
            text = (data.get("content") or [{}])[0].get("text", "")
            print(f"\n-> content: {text!r}", file=sys.stderr)
        else:
            print(f"\n-> non-200, check key/network", file=sys.stderr)
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
