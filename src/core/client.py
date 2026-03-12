import asyncio
import json
from fastapi import HTTPException
from typing import Optional, AsyncGenerator, Dict, Any
from openai import AsyncOpenAI, AsyncAzureOpenAI
from openai._exceptions import APIError, RateLimitError, AuthenticationError, BadRequestError
from src.core.logging import logger


class OpenAIClient:
    def __init__(self, api_key: str, base_url: str, timeout: int = 90, api_version: Optional[str] = None, custom_headers: Optional[Dict[str, str]] = None):
        self.api_key = api_key
        self.base_url = base_url
        self.timeout = timeout
        self.custom_headers = custom_headers or {}

        default_headers = {}
        all_headers = {**default_headers, **self.custom_headers}

        if api_version:
            self.client = AsyncAzureOpenAI(api_key=api_key, azure_endpoint=base_url, api_version=api_version, timeout=timeout, default_headers=all_headers)
        else:
            self.client = AsyncOpenAI(api_key=api_key, base_url=base_url, timeout=timeout, default_headers=all_headers)

        self.active_requests: Dict[str, asyncio.Event] = {}

    async def create_chat_completion(self, request: Dict[str, Any], request_id: Optional[str] = None) -> Dict[str, Any]:
        if request_id:
            self.active_requests[request_id] = asyncio.Event()
        try:
            completion_task = asyncio.create_task(self.client.chat.completions.create(**request))
            if request_id:
                cancel_task = asyncio.create_task(self.active_requests[request_id].wait())
                done, pending = await asyncio.wait([completion_task, cancel_task], return_when=asyncio.FIRST_COMPLETED)
                for task in pending:
                    task.cancel()
                    try:
                        await task
                    except asyncio.CancelledError:
                        pass
                if cancel_task in done:
                    completion_task.cancel()
                    raise HTTPException(status_code=499, detail="Request cancelled by client")
                completion = await completion_task
            else:
                completion = await completion_task
            return completion.model_dump()
        except AuthenticationError as e:
            raise HTTPException(status_code=401, detail=self.classify_openai_error(str(e)))
        except RateLimitError as e:
            raise HTTPException(status_code=429, detail=self.classify_openai_error(str(e)))
        except BadRequestError as e:
            raise HTTPException(status_code=400, detail=self.classify_openai_error(str(e)))
        except APIError as e:
            raise HTTPException(status_code=getattr(e, 'status_code', 500), detail=self.classify_openai_error(str(e)))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")
        finally:
            if request_id and request_id in self.active_requests:
                del self.active_requests[request_id]

    async def create_chat_completion_stream(self, request: Dict[str, Any], request_id: Optional[str] = None) -> AsyncGenerator[str, None]:
        if request_id:
            self.active_requests[request_id] = asyncio.Event()
        try:
            request.pop("stream", None)  # with_streaming_response handles this
            async with self.client.chat.completions.with_streaming_response.create(**request, stream=True) as response:
                logger.debug(f"[{request_id}] RESPONSE STATUS: {response.status_code}")
                async for line in response.iter_lines():
                    logger.debug(f"[{request_id}] LINE: {repr(line[:80])}")
                    if request_id and request_id in self.active_requests:
                        if self.active_requests[request_id].is_set():
                            raise HTTPException(status_code=499, detail="Request cancelled by client")
                    if not line.strip():
                        continue
                    
                    # Check for non-SSE JSON error responses (e.g., from iflow.cn)
                    if not line.startswith("data:"):
                        try:
                            error_json = json.loads(line)
                            if "status" in error_json or "error" in error_json:
                                error_msg = error_json.get("msg") or error_json.get("message") or str(error_json)
                                yield f"data: {json.dumps({'type': 'error', 'error': {'type': 'api_error', 'message': error_msg}}, ensure_ascii=False)}\n\n"
                                return
                        except json.JSONDecodeError:
                            pass

                    if line.startswith("data:"):
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk_dict = json.loads(data)
                            yield f"data: {json.dumps(chunk_dict, ensure_ascii=False)}\n\n"
                        except json.JSONDecodeError:
                            continue
            yield "data: [DONE]\n\n"
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"[{request_id}] Streaming error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Streaming error: {str(e)}")
        finally:
            if request_id and request_id in self.active_requests:
                del self.active_requests[request_id]

    def classify_openai_error(self, error_detail: Any) -> str:
        error_str = str(error_detail).lower()
        if "unsupported_country_region_territory" in error_str:
            return "OpenAI API is not available in your region."
        if "invalid_api_key" in error_str or "unauthorized" in error_str:
            return "Invalid API key."
        if "rate_limit" in error_str or "quota" in error_str:
            return "Rate limit exceeded."
        if "model" in error_str and ("not found" in error_str or "does not exist" in error_str):
            return "Model not found."
        if "billing" in error_str or "payment" in error_str:
            return "Billing issue."
        return str(error_detail)

    def cancel_request(self, request_id: str) -> bool:
        if request_id in self.active_requests:
            self.active_requests[request_id].set()
            return True
        return False