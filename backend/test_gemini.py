import asyncio
from google import genai
import os

async def main():
    print("Testing gemini...")
    client = genai.Client(api_key="AIzaSyDummyKey...")
    config = {
        "temperature": 0.7,
        "max_output_tokens": 1024,
        "system_instruction": "You are a helpful assistant.",
    }
    print("calling complete...")
    try:
        resp = await client.aio.models.generate_content(
            model="gemini-3.5-flash",
            contents="Hi",
            config=config,
        )
        print("Done:", resp.text)
    except Exception as e:
        print("Error:", e)

if __name__ == "__main__":
    asyncio.run(main())
