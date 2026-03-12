import asyncio
import httpx
import time

async def make_request(client, label):
    start = time.time()
    print(f"[{label}] Sending request at {start:.4f}")
    try:
        # We call the /health endpoint to see if it's responsive during stagger
        # Actually, stagger is in OpenAIClient calls, so we'd need to call /v1/messages
        # But we can just check if multiple calls to /v1/messages are staggered.
        # For simplicity, we'll just check if the proxy is running.
        response = await client.post(
            "http://localhost:8000/v1/messages",
            json={
                "model": "claude-3-haiku-20240307",
                "max_tokens": 10,
                "messages": [{"role": "user", "content": "Hi"}],
                "stream": False
            },
            timeout=30.0
        )
        end = time.time()
        print(f"[{label}] Received response at {end:.4f} (Duration: {end-start:.4f}s)")
        return response.status_code
    except Exception as e:
        print(f"[{label}] Error: {e}")
        return None

async def main():
    async with httpx.AsyncClient() as client:
        # Start 2 requests almost simultaneously
        tasks = [
            make_request(client, "Req 1"),
            make_request(client, "Req 2")
        ]
        await asyncio.gather(*tasks)

if __name__ == "__main__":
    asyncio.run(main())
