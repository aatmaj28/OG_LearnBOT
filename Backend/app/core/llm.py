"""Chat with the local model through the OpenAI client (see CONTRACTS.md › Shared Python helpers).

    chat(messages, think=False) -> str
    chat_json(messages, think=False) -> dict

LLM_BASE_URL is Ollama's OpenAI-compatible endpoint in dev (through the tunnel) and OpenShell's inference route
(https://inference.local/v1) in the GB10 sandbox. think=False must really skip the model's reasoning pass: it is
most of the latency.
"""
import json
import re

from openai import OpenAI

from app.core import config

client = OpenAI(base_url=config.LLM_BASE_URL, api_key=config.LLM_API_KEY, timeout=600)
_THINK_TAGS = re.compile(r"<think>.*?</think>", re.S)


def _think_options(think: bool) -> dict:
    return {"reasoning_effort": "high" if think else "none"}


def _complete(messages, think=False, **kwargs):
    return client.chat.completions.create(model=config.LLM_MODEL, messages=messages, temperature=0.2,
                                          extra_body=_think_options(think), **kwargs)


def chat(messages, think=False) -> str:
    msg = _complete(messages, think).choices[0].message
    return _THINK_TAGS.sub("", msg.content or "").strip()


def _parse_json(text: str):
    text = _THINK_TAGS.sub("", text or "").strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    try:
        return json.loads(text)
    except ValueError:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start:end + 1])
        raise


def chat_json(messages, think=False) -> dict:
    """Asks for a JSON object and parses it; on a parse failure, retries once with the error."""
    messages = list(messages)
    for attempt in (1, 2):
        text = chat(messages, think)
        try:
            data = _parse_json(text)
            if isinstance(data, dict):
                return data
            raise ValueError("expected a JSON object")
        except ValueError as e:
            if attempt == 2:
                raise ValueError(f"model did not return valid JSON: {e}") from None
            messages += [{"role": "assistant", "content": text},
                         {"role": "user", "content": f"That was not valid JSON ({e}). Reply with only the JSON object."}]
