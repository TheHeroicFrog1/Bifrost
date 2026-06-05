from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import json
import httpx
from openai import AsyncOpenAI

app = FastAPI(title="NexusAI Backend Proxy")

# Allow your future React frontend to talk to this backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Message(BaseModel):
    role: str  # "user", "assistant", or "system"
    content: str

class ChatRequest(BaseModel):
    provider: str  # "openai", "groq", or "ollama"
    model: str     
    messages: List[Message]
    temperature: Optional[float] = 0.7

async def stream_cloud_provider(api_key: str, base_url: Optional[str], model: str, messages: list, temperature: float):
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    try:
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            stream=True
        )
        async for chunk in response:
            content = chunk.choices[0].delta.content
            if content:
                yield f"data: {json.dumps({'content': content})}\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'error': str(e)})}\n\n"

async def stream_local_ollama(model: str, messages: list, temperature: float):
    ollama_url = "http://localhost:11434/api/chat"
    payload = {
        "model": model,
        "messages": [{"role": m["role"], "content": m["content"]} for m in messages],
        "options": {"temperature": temperature},
        "stream": True
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            async with client.stream("POST", ollama_url, json=payload) as response:
                if response.status_code != 200:
                    yield f"data: {json.dumps({'error': 'Ollama error status'})}\n\n"
                    return
                async for line in response.aiter_lines():
                    if line:
                        data = json.loads(line)
                        content = data.get("message", {}).get("content", "")
                        if content:
                            yield f"data: {json.dumps({'content': content})}\n\n"
        except httpx.ConnectError:
            yield f"data: {json.dumps({'error': 'Ollama not running on localhost:11434'})}\n\n"

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, authorization: Optional[str] = Header(None)):
    raw_messages = [m.model_dump() for m in request.messages]
    
    if request.provider == "ollama":
        return StreamingResponse(
            stream_local_ollama(request.model, raw_messages, request.temperature),
            media_type="text/event-stream"
        )
        
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing API key")
    
    api_key = authorization.split(" ")[1]
    
    if request.provider == "openai":
        return StreamingResponse(
            stream_cloud_provider(api_key, None, request.model, raw_messages, request.temperature),
            media_type="text/event-stream"
        )
    elif request.provider == "groq":
        return StreamingResponse(
            stream_cloud_provider(api_key, "https://api.groq.com/openai/v1", request.model, raw_messages, request.temperature),
            media_type="text/event-stream"
        )
    else:
        raise HTTPException(status_code=400, detail="Unsupported provider")