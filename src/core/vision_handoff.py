import copy
from fastapi import HTTPException


VISION_SYSTEM_PROMPT = (
    "You are a high-fidelity vision analyst. Extract all relevant information from the image(s) with minimal loss. "
    "Use English. Do not invent missing details. If uncertain, explicitly say uncertain. "
    "Return concise structured markdown with sections: Scene, OCR Text, Objects, UI/Layout, Numbers/Units, Errors/Warnings, Uncertainties."
)


def _extract_text_from_vision_response(response: dict) -> str:
    """Extract assistant text content from OpenAI-style response."""
    if not isinstance(response, dict):
        raise HTTPException(status_code=502, detail="Vision model returned non-JSON response")

    choices = response.get("choices") or []
    if not choices:
        status = response.get("status")
        msg = response.get("msg")
        detail = f"Vision model returned no choices"
        if status or msg:
            detail = f"Vision model error (status={status}): {msg}"
        raise HTTPException(status_code=502, detail=detail)

    message = choices[0].get("message") or {}
    content = message.get("content", "")

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                if item.get("type") == "text" and item.get("text"):
                    parts.append(item["text"])
                elif item.get("text"):
                    parts.append(str(item["text"]))
        return "\n".join(parts).strip()

    return str(content).strip()


def _message_has_image(message: dict) -> bool:
    content = message.get("content")
    if not isinstance(content, list):
        return False
    return any(isinstance(item, dict) and item.get("type") == "image_url" for item in content)


def _extract_text_blocks(content_list) -> str:
    text_parts = []
    for item in content_list:
        if isinstance(item, dict) and item.get("type") == "text" and item.get("text"):
            text_parts.append(item["text"])
    return "\n".join(text_parts).strip()


from src.core.vision_cache import vision_cache


async def apply_vision_handoff(openai_request: dict, openai_client, config, logger) -> dict:
    """
    For user messages that contain image_url content, call vision model first,
    then replace multimodal content with a text report for downstream non-vision model.
    """
    routed = {k: v for k, v in openai_request.items() if k != "messages"}
    messages = list(openai_request.get("messages") or [])
    routed["messages"] = messages

    for idx, msg in enumerate(messages):
        if msg.get("role") != "user":
            continue
        if not _message_has_image(msg):
            continue

        # Create a deepcopy of the message content to avoid modifying the original request
        source_content = copy.deepcopy(msg.get("content"))

        # Check cache first
        cached_report = vision_cache.get_report(source_content)
        if cached_report:
            logger.info(f"Using cached vision report for user message index={idx}")
            vision_report = cached_report
        else:
            vision_request = {
                "model": config.vision_model,
                "messages": [
                    {"role": "system", "content": VISION_SYSTEM_PROMPT},
                    {"role": "user", "content": source_content},
                ],
                "max_tokens": config.vision_handoff_max_tokens,
                "temperature": 0.1,
                "stream": False,
            }

            vision_response = await openai_client.create_chat_completion(vision_request)
            vision_report = _extract_text_from_vision_response(vision_response)
            
            # Store in cache
            vision_cache.set_report(source_content, vision_report)
            logger.info(f"Vision handoff applied and cached for user message index={idx}")

        original_user_text = _extract_text_blocks(source_content)

        combined = "Image Analysis Report:\n" + (vision_report or "(no details extracted)")
        if original_user_text:
            combined += "\n\nOriginal User Text:\n" + original_user_text

        # Replace the message in the shallow-copied list with a modified copy
        msg_copy = copy.deepcopy(msg)
        msg_copy["content"] = combined
        messages[idx] = msg_copy

    return routed
