from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from src.api.endpoints import router as api_router
import uvicorn
import sys
from src.core.config import config

app = FastAPI(title="Claude-to-OpenAI API Proxy", version="1.0.0")

app.include_router(api_router)

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    from src.core.logging import logger
    body = await request.body()
    logger.error(f"422 Validation Error: {exc.errors()}")
    logger.error(f"Request body: {body.decode('utf-8', errors='replace')}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": body.decode('utf-8', errors='replace')},
    )


def main():
    # Backend starts silently; UI is handled by the Node.js Orchestrator

    # Parse log level - extract just the first word to handle comments
    log_level = config.log_level.split()[0].lower()
    
    # Validate and set default if invalid
    valid_levels = ['debug', 'info', 'warning', 'error', 'critical']
    if log_level not in valid_levels:
        log_level = 'info'

    # Suppress noise from libraries even in DEBUG mode
    import logging
    for loud_lib in ["openai", "httpx", "httpcore"]:
        logging.getLogger(loud_lib).setLevel(logging.WARNING)

    # Start server
    uvicorn.run(
        "src.main:app",
        host=config.host,
        port=config.port,
        log_level=log_level,
        reload=False,
    )


if __name__ == "__main__":
    main()
