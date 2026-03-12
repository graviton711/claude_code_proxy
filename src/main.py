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
    if len(sys.argv) > 1 and sys.argv[1] == "--help":
        print("Claude-to-OpenAI API Proxy v1.0.0")
        print("")
        print("Usage: python src/main.py")
        print("")
        print("Required environment variables:")
        print("  OPENAI_API_KEY - Your OpenAI API key")
        print("")
        print("Optional environment variables:")
        print("  ANTHROPIC_API_KEY - Expected Anthropic API key for client validation")
        print("                      If set, clients must provide this exact API key")
        print(
            f"  OPENAI_BASE_URL - OpenAI API base URL (default: https://api.openai.com/v1)"
        )
        print(f"  BIG_MODEL - Model for opus requests (default: gpt-4o)")
        print(f"  MIDDLE_MODEL - Model for sonnet requests (default: gpt-4o)")
        print(f"  SMALL_MODEL - Model for haiku requests (default: gpt-4o-mini)")
        print(f"  HOST - Server host (default: 0.0.0.0)")
        print(f"  PORT - Server port (default: 8082)")
        print(f"  LOG_LEVEL - Logging level (default: WARNING)")
        print(f"  MAX_TOKENS_LIMIT - Token limit (default: 4096)")
        print(f"  MIN_TOKENS_LIMIT - Minimum token limit (default: 100)")
        print(f"  REQUEST_TIMEOUT - Request timeout in seconds (default: 90)")
        print("")
        print("Model mapping:")
        print(f"  Claude haiku models -> {config.small_model}")
        print(f"  Claude sonnet/opus models -> {config.big_model}")
        sys.exit(0)

    # Premium Startup UI
    try:
        from rich.console import Console
        from rich.panel import Panel
        from rich.table import Table
        from rich import box
        import pyfiglet
        
        console = Console()
        
        # ASCII Art Banner
        banner_text = pyfiglet.figlet_format("CLAUDE PROXY", font="slant")
        console.print(f"[bold cyan]{banner_text}[/bold cyan]")
        
        # Configuration Table
        table = Table(title="System Configuration", box=box.ROUNDED, border_style="bright_blue")
        table.add_column("Parameter", style="cyan")
        table.add_column("Value", style="green")
        
        table.add_row("OpenAI Base URL", config.openai_base_url)
        table.add_row("Big Model (opus)", config.big_model)
        table.add_row("Middle Model (sonnet)", config.middle_model)
        table.add_row("Small Model (haiku)", config.small_model)
        table.add_row("Max Tokens Limit", str(config.max_tokens_limit))
        table.add_row("Request Timeout", f"{config.request_timeout}s")
        table.add_row("Stagger Delay", f"{config.iflow_stagger_delay}s")
        table.add_row("Server Address", f"{config.host}:{config.port}")
        table.add_row("Client Validation", "Enabled" if config.anthropic_api_key else "Disabled")
        
        console.print(Panel(table, title="[bold green]Ready to Proxy[/bold green]", expand=False))
        console.print("")
    except ImportError:
        # Fallback to simple print if rich/pyfiglet not installed
        print("Claude-to-OpenAI API Proxy v1.0.0")
        print(f"Configuration loaded successfully")
        print(f"   OpenAI Base URL: {config.openai_base_url}")
        print(f"   Big Model (opus): {config.big_model}")
        print(f"   Middle Model (sonnet): {config.middle_model}")
        print(f"   Small Model (haiku): {config.small_model}")
        print(f"   Max Tokens Limit: {config.max_tokens_limit}")
        print(f"   Request Timeout: {config.request_timeout}s")
        print(f"   Server: {config.host}:{config.port}")
        print(f"   Client API Key Validation: {'Enabled' if config.anthropic_api_key else 'Disabled'}")
        print("")

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
