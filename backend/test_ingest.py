import asyncio
import json
from httpx import AsyncClient
from main import app

async def test():
    async with AsyncClient(app=app, base_url="http://test") as client:
        try:
            response = await client.post(
                "/ingest/url",
                json={"url": "https://example.com/product/123", "name": "Test", "category": "Tech"}
            )
            print("Status:", response.status_code)
            print("Content:", response.text)
        except Exception as e:
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test())
