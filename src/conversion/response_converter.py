import json
import uuid
from fastapi import HTTPException, Request
from src.core.constants import Constants
from src.models.claude import ClaudeMessagesRequest


def convert_openai_to_claude_response(
    openai_response: dict, original_request: ClaudeMessagesRequest
) -> dict:
    """Convert OpenAI response to Claude format."""

    # Extract response data
    choices = openai_response.get("choices", [])
    if not choices:
        raise HTTPException(status_code=500, detail="No choices in OpenAI response")

    choice = choices[0]
    message = choice.get("message", {})

    # Build Claude content blocks
    content_blocks = []

    # Add thinking/reasoning content if present (OpenAI o1/o3)
    reasoning_content = message.get("reasoning_content")
    if reasoning_content:
        content_blocks.append({"type": "thinking", "thinking": reasoning_content, "signature": None})

    # Add text content
    text_content = message.get("content")
    if text_content is not None:
        content_blocks.append({"type": Constants.CONTENT_TEXT, "text": text_content})

    # Add tool calls
    tool_calls = message.get("tool_calls", []) or []
    for tool_call in tool_calls:
        if tool_call.get("type") == Constants.TOOL_FUNCTION:
            function_data = tool_call.get(Constants.TOOL_FUNCTION, {})
            try:
                arguments = json.loads(function_data.get("arguments", "{}"))
            except json.JSONDecodeError:
                arguments = {"raw_arguments": function_data.get("arguments", "")}

            content_blocks.append(
                {
                    "type": Constants.CONTENT_TOOL_USE,
                    "id": tool_call.get("id", f"tool_{uuid.uuid4()}"),
                    "name": function_data.get("name", ""),
                    "input": arguments,
                }
            )

    # Ensure at least one content block
    if not content_blocks:
        content_blocks.append({"type": Constants.CONTENT_TEXT, "text": ""})

    # Map finish reason
    finish_reason = choice.get("finish_reason", "stop")
    stop_reason = {
        "stop": Constants.STOP_END_TURN,
        "length": Constants.STOP_MAX_TOKENS,
        "tool_calls": Constants.STOP_TOOL_USE,
        "function_call": Constants.STOP_TOOL_USE,
    }.get(finish_reason, Constants.STOP_END_TURN)

    # Build Claude response
    claude_response = {
        "id": openai_response.get("id", f"msg_{uuid.uuid4()}"),
        "type": "message",
        "role": Constants.ROLE_ASSISTANT,
        "model": original_request.model,
        "content": content_blocks,
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {
            "input_tokens": openai_response.get("usage", {}).get("prompt_tokens", 0),
            "output_tokens": openai_response.get("usage", {}).get(
                "completion_tokens", 0
            ),
        },
    }

    return claude_response


async def convert_openai_streaming_to_claude(
    openai_stream, original_request: ClaudeMessagesRequest, logger
):
    """Convert OpenAI streaming response to Claude streaming format."""

    message_id = f"msg_{uuid.uuid4().hex[:24]}"

    # Send initial SSE event (message_start must be first)
    logger.info(f"[STREAM] Starting Claude streaming conversion (ID: {message_id})")
    yield f"event: {Constants.EVENT_MESSAGE_START}\ndata: {json.dumps({'type': Constants.EVENT_MESSAGE_START, 'message': {'id': message_id, 'type': 'message', 'role': Constants.ROLE_ASSISTANT, 'model': original_request.model, 'content': [], 'stop_reason': None, 'stop_sequence': None, 'usage': {'input_tokens': 0, 'output_tokens': 0}}}, ensure_ascii=False)}\n\n"
    yield f"event: {Constants.EVENT_PING}\ndata: {json.dumps({'type': Constants.EVENT_PING}, ensure_ascii=False)}\n\n"

    # State machine for content blocks
    current_block_type = None  # None, "text", or "thinking"
    current_block_index = -1
    tool_block_counter = 0
    current_tool_calls = {}
    final_stop_reason = Constants.STOP_END_TURN
    chunk_count = 0

    def start_block(index, btype):
        nonlocal current_block_type, current_block_index
        logger.info(f"[STREAM] Initializing content block: index={index}, type={btype}")
        current_block_type = btype
        current_block_index = index
        if btype == "thinking":
            return f"event: {Constants.EVENT_CONTENT_BLOCK_START}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_START, 'index': index, 'content_block': {'type': 'thinking', 'thinking': '', 'signature': None}}, ensure_ascii=False)}\n\n"
        else:
            return f"event: {Constants.EVENT_CONTENT_BLOCK_START}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_START, 'index': index, 'content_block': {'type': Constants.CONTENT_TEXT, 'text': ''}}, ensure_ascii=False)}\n\n"

    def stop_block(index):
        logger.info(f"[STREAM] Closing content block: index={index}")
        return f"event: {Constants.EVENT_CONTENT_BLOCK_STOP}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_STOP, 'index': index}, ensure_ascii=False)}\n\n"

    try:
        async for line in openai_stream:
            if not line.strip(): 
                logger.debug("[STREAM] Heartbeat (empty line) received")
                continue
            if not line.startswith("data: "): continue
            
            chunk_data = line[6:]
            if chunk_data.strip() == "[DONE]": 
                logger.info("[STREAM] Provider signaled [DONE]")
                break

            chunk_count += 1
            try:
                chunk = json.loads(chunk_data)
                choices = chunk.get("choices", [])
                if not choices: continue
            except json.JSONDecodeError:
                continue

            choice = choices[0]
            delta = choice.get("delta", {})
            finish_reason = choice.get("finish_reason")

            # 1. Handle Thinking/Reasoning (usually comes first)
            if delta.get("reasoning_content"):
                if current_block_type != "thinking":
                    if current_block_type is not None:
                        yield stop_block(current_block_index)
                    yield start_block(current_block_index + 1, "thinking")
                
                yield f"event: {Constants.EVENT_CONTENT_BLOCK_DELTA}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_DELTA, 'index': current_block_index, 'delta': {'type': 'thinking_delta', 'thinking': delta['reasoning_content']}}, ensure_ascii=False)}\n\n"

            # 2. Handle Text Content
            elif delta.get("content"):
                if current_block_type != "text":
                    if current_block_type is not None:
                        yield stop_block(current_block_index)
                    yield start_block(current_block_index + 1, "text")
                
                yield f"event: {Constants.EVENT_CONTENT_BLOCK_DELTA}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_DELTA, 'index': current_block_index, 'delta': {'type': Constants.DELTA_TEXT, 'text': delta['content']}}, ensure_ascii=False)}\n\n"

            # 2. Handle Tool Calls
            if "tool_calls" in delta and delta["tool_calls"]:
                # If we were in a text/thinking block, we must close it before starting tools
                if current_block_type is not None:
                    yield stop_block(current_block_index)
                    current_block_type = None

                for tc_delta in delta["tool_calls"]:
                    tc_index = tc_delta.get("index", 0)
                    if tc_index not in current_tool_calls:
                        current_tool_calls[tc_index] = {"id": None, "name": None, "claude_index": None, "started": False}
                    
                    tool_call = current_tool_calls[tc_index]
                    if tc_delta.get("id"): tool_call["id"] = tc_delta["id"]
                    
                    function_data = tc_delta.get(Constants.TOOL_FUNCTION, {})
                    if function_data.get("name"): tool_call["name"] = function_data["name"]
                    
                    if tool_call["id"] and tool_call["name"] and not tool_call["started"]:
                        tool_block_counter += 1
                        claude_index = max(0, current_block_index) + tool_block_counter
                        tool_call["claude_index"] = claude_index
                        tool_call["started"] = True
                        yield f"event: {Constants.EVENT_CONTENT_BLOCK_START}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_START, 'index': claude_index, 'content_block': {'type': Constants.CONTENT_TOOL_USE, 'id': tool_call['id'], 'name': tool_call['name'], 'input': {}}}, ensure_ascii=False)}\n\n"
                    
                    if "arguments" in function_data and tool_call["started"] and function_data["arguments"] is not None:
                        yield f"event: {Constants.EVENT_CONTENT_BLOCK_DELTA}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_DELTA, 'index': tool_call['claude_index'], 'delta': {'type': Constants.DELTA_INPUT_JSON, 'partial_json': function_data['arguments']}}, ensure_ascii=False)}\n\n"

            if finish_reason:
                logger.info(f"[STREAM] Finish reason: {finish_reason} (after {chunk_count} chunks)")
                final_stop_reason = {
                    "length": Constants.STOP_MAX_TOKENS,
                    "tool_calls": Constants.STOP_TOOL_USE,
                    "function_call": Constants.STOP_TOOL_USE,
                    "stop": Constants.STOP_END_TURN
                }.get(finish_reason, Constants.STOP_END_TURN)
                break

    except Exception as e:
        logger.error(f"[STREAM] Critical conversion error: {e}", exc_info=True)
        yield f"event: error\ndata: {json.dumps({'type': 'error', 'error': {'type': 'api_error', 'message': f'Streaming error: {str(e)}'}}, ensure_ascii=False)}\n\n"

    # Finalize any open blocks
    if current_block_type is not None:
        yield stop_block(current_block_index)
    
    for tool_data in current_tool_calls.values():
        if tool_data.get("started"):
            yield f"event: {Constants.EVENT_CONTENT_BLOCK_STOP}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_STOP, 'index': tool_data['claude_index']}, ensure_ascii=False)}\n\n"

    yield f"event: {Constants.EVENT_MESSAGE_DELTA}\ndata: {json.dumps({'type': Constants.EVENT_MESSAGE_DELTA, 'delta': {'stop_reason': final_stop_reason, 'stop_sequence': None}, 'usage': {'input_tokens': 0, 'output_tokens': 0}}, ensure_ascii=False)}\n\n"
    yield f"event: {Constants.EVENT_MESSAGE_STOP}\ndata: {json.dumps({'type': Constants.EVENT_MESSAGE_STOP}, ensure_ascii=False)}\n\n"


async def convert_openai_streaming_to_claude_with_cancellation(
    openai_stream,
    original_request: ClaudeMessagesRequest,
    logger,
    http_request: Request,
    openai_client,
    request_id: str,
):
    """Convert OpenAI streaming response to Claude streaming format with cancellation support."""

    message_id = f"msg_{uuid.uuid4().hex[:24]}"

    # Send initial SSE event
    logger.info(f"[STREAM] Starting Claude streaming conversion with cancellation (ID: {message_id}, Req: {request_id})")
    yield f"event: {Constants.EVENT_MESSAGE_START}\ndata: {json.dumps({'type': Constants.EVENT_MESSAGE_START, 'message': {'id': message_id, 'type': 'message', 'role': Constants.ROLE_ASSISTANT, 'model': original_request.model, 'content': [], 'stop_reason': None, 'stop_sequence': None, 'usage': {'input_tokens': 0, 'output_tokens': 0}}}, ensure_ascii=False)}\n\n"
    yield f"event: {Constants.EVENT_PING}\ndata: {json.dumps({'type': Constants.EVENT_PING}, ensure_ascii=False)}\n\n"

    # State machine for content blocks
    current_block_type = None  # None, "text", or "thinking"
    current_block_index = -1
    tool_block_counter = 0
    current_tool_calls = {}
    final_stop_reason = Constants.STOP_END_TURN
    usage_data = {"input_tokens": 0, "output_tokens": 0}
    chunk_count = 0

    def start_block(index, btype):
        nonlocal current_block_type, current_block_index
        logger.info(f"[STREAM] Initializing content block: index={index}, type={btype}")
        current_block_type = btype
        current_block_index = index
        if btype == "thinking":
            return f"event: {Constants.EVENT_CONTENT_BLOCK_START}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_START, 'index': index, 'content_block': {'type': 'thinking', 'thinking': '', 'signature': None}}, ensure_ascii=False)}\n\n"
        else:
            return f"event: {Constants.EVENT_CONTENT_BLOCK_START}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_START, 'index': index, 'content_block': {'type': Constants.CONTENT_TEXT, 'text': ''}}, ensure_ascii=False)}\n\n"

    def stop_block(index):
        logger.info(f"[STREAM] Closing content block: index={index}")
        return f"event: {Constants.EVENT_CONTENT_BLOCK_STOP}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_STOP, 'index': index}, ensure_ascii=False)}\n\n"

    try:
        async for line in openai_stream:
            # Check if client disconnected
            if await http_request.is_disconnected():
                logger.info(f"[STREAM] Client disconnected, cancelling request {request_id}")
                openai_client.cancel_request(request_id)
                break

            if not line.strip(): 
                logger.debug("[STREAM] Heartbeat (empty line) received")
                continue
            if not line.startswith("data: "): continue
            
            chunk_data = line[6:]
            if chunk_data.strip() == "[DONE]": 
                logger.info("[STREAM] Provider signaled [DONE]")
                break

            chunk_count += 1
            try:
                chunk = json.loads(chunk_data)
                usage = chunk.get("usage", None)
                if usage:
                    cache_read_input_tokens = 0
                    prompt_tokens_details = usage.get('prompt_tokens_details', {})
                    if prompt_tokens_details:
                        cache_read_input_tokens = prompt_tokens_details.get('cached_tokens', 0)
                    usage_data = {
                        'input_tokens': usage.get('prompt_tokens', 0),
                        'output_tokens': usage.get('completion_tokens', 0),
                        'cache_read_input_tokens': cache_read_input_tokens
                    }
                choices = chunk.get("choices", [])
                if not choices: continue
            except json.JSONDecodeError:
                continue

            choice = choices[0]
            delta = choice.get("delta", {})
            finish_reason = choice.get("finish_reason")

            # 1. Handle Thinking/Reasoning
            if delta.get("reasoning_content"):
                if current_block_type != "thinking":
                    if current_block_type is not None:
                        yield stop_block(current_block_index)
                    yield start_block(current_block_index + 1, "thinking")
                
                yield f"event: {Constants.EVENT_CONTENT_BLOCK_DELTA}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_DELTA, 'index': current_block_index, 'delta': {'type': 'thinking_delta', 'thinking': delta['reasoning_content']}}, ensure_ascii=False)}\n\n"

            # 2. Handle Text Content
            elif delta.get("content"):
                if current_block_type != "text":
                    if current_block_type is not None:
                        yield stop_block(current_block_index)
                    yield start_block(current_block_index + 1, "text")
                
                yield f"event: {Constants.EVENT_CONTENT_BLOCK_DELTA}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_DELTA, 'index': current_block_index, 'delta': {'type': Constants.DELTA_TEXT, 'text': delta['content']}}, ensure_ascii=False)}\n\n"

            # 3. Handle Tool Calls
            if "tool_calls" in delta and delta["tool_calls"]:
                if current_block_type is not None:
                    yield stop_block(current_block_index)
                    current_block_type = None

                for tc_delta in delta["tool_calls"]:
                    tc_index = tc_delta.get("index", 0)
                    if tc_index not in current_tool_calls:
                        current_tool_calls[tc_index] = {"id": None, "name": None, "claude_index": None, "started": False}
                    
                    tool_call = current_tool_calls[tc_index]
                    if tc_delta.get("id"): tool_call["id"] = tc_delta["id"]
                    function_data = tc_delta.get(Constants.TOOL_FUNCTION, {})
                    if function_data.get("name"): tool_call["name"] = function_data["name"]
                    
                    if tool_call["id"] and tool_call["name"] and not tool_call["started"]:
                        tool_block_counter += 1
                        claude_index = max(0, current_block_index) + tool_block_counter
                        tool_call["claude_index"] = claude_index
                        tool_call["started"] = True
                        yield f"event: {Constants.EVENT_CONTENT_BLOCK_START}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_START, 'index': claude_index, 'content_block': {'type': Constants.CONTENT_TOOL_USE, 'id': tool_call['id'], 'name': tool_call['name'], 'input': {}}}, ensure_ascii=False)}\n\n"
                    
                    if "arguments" in function_data and tool_call["started"] and function_data["arguments"] is not None:
                        yield f"event: {Constants.EVENT_CONTENT_BLOCK_DELTA}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_DELTA, 'index': tool_call['claude_index'], 'delta': {'type': Constants.DELTA_INPUT_JSON, 'partial_json': function_data['arguments']}}, ensure_ascii=False)}\n\n"

            if finish_reason:
                logger.info(f"[STREAM] Finish reason: {finish_reason} (after {chunk_count} chunks)")
                final_stop_reason = {
                    "length": Constants.STOP_MAX_TOKENS,
                    "tool_calls": Constants.STOP_TOOL_USE,
                    "function_call": Constants.STOP_TOOL_USE,
                    "stop": Constants.STOP_END_TURN
                }.get(finish_reason, Constants.STOP_END_TURN)
                break

    except HTTPException as e:
        if e.status_code == 499:
            logger.info(f"[STREAM] Request {request_id} was cancelled by proxy")
            yield f"event: error\ndata: {json.dumps({'type': 'error', 'error': {'type': 'cancelled', 'message': 'Request was cancelled by client'}}, ensure_ascii=False)}\n\n"
            return
        else: raise
    except Exception as e:
        logger.error(f"[STREAM] Critical conversion error: {e}", exc_info=True)
        yield f"event: error\ndata: {json.dumps({'type': 'error', 'error': {'type': 'api_error', 'message': f'Streaming error: {str(e)}'}}, ensure_ascii=False)}\n\n"

    if current_block_type is not None:
        yield stop_block(current_block_index)
    for tool_data in current_tool_calls.values():
        if tool_data.get("started"):
            yield f"event: {Constants.EVENT_CONTENT_BLOCK_STOP}\ndata: {json.dumps({'type': Constants.EVENT_CONTENT_BLOCK_STOP, 'index': tool_data['claude_index']}, ensure_ascii=False)}\n\n"

    yield f"event: {Constants.EVENT_MESSAGE_DELTA}\ndata: {json.dumps({'type': Constants.EVENT_MESSAGE_DELTA, 'delta': {'stop_reason': final_stop_reason, 'stop_sequence': None}, 'usage': usage_data}, ensure_ascii=False)}\n\n"
    yield f"event: {Constants.EVENT_MESSAGE_STOP}\ndata: {json.dumps({'type': Constants.EVENT_MESSAGE_STOP}, ensure_ascii=False)}\n\n"
