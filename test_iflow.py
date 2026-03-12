import os
from dotenv import load_dotenv
import httpx
import json

def test_iflow():
    load_dotenv(override=True)
    api_key = os.environ.get("OPENAI_API_KEY")
    base_url = os.environ.get("OPENAI_BASE_URL", "https://apis.iflow.cn/v1")
    
    if not api_key:
        print("Error: OPENAI_API_KEY not found in environment")
        return

    print(f"Testing with API Key: {api_key[:6]}...{api_key[-4:]} (length: {len(api_key)})")
    print(f"Base URL: {base_url}")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "kimi-k2-0905",
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 5
    }
    
    url = f"{base_url}/chat/completions"
    print(f"Request URL: {url}")
    
    try:
        response = httpx.post(url, headers=headers, json=payload, timeout=30.0)
        print(f"Status Code: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        print(f"Response Body: {response.text}")
    except Exception as e:
        print(f"Error during request: {e}")

if __name__ == "__main__":
    test_iflow()
