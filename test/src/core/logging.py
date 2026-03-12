import logging
from rich.logging import RichHandler
from rich.console import Console
from src.core.config import config

# Initialize Rich Console
console = Console()

# Parse log level
log_level = config.log_level.split()[0].upper()
valid_levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
if log_level not in valid_levels:
    log_level = 'INFO'

class TruncateFilter(logging.Filter):
    """Filter to truncate very long log messages to prevent terminal clutter."""
    def filter(self, record):
        if isinstance(record.msg, str) and len(record.msg) > 5000:
            record.msg = record.msg[:5000] + "... [TRUNCATED]"
        return True

# Logging Configuration
# Use RichHandler for professional, colorized terminal output
logging_handlers = [
    RichHandler(
        console=console,
        rich_tracebacks=True,
        markup=True,
        show_time=True,
        show_path=False
    )
]

# Add file handler for persistence
try:
    file_prefix = "[FILE] "
    file_formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(message)s')
    file_handler = logging.FileHandler('proxy.log', encoding='utf-8')
    file_handler.setFormatter(file_formatter)
    logging_handlers.append(file_handler)
except Exception:
    pass

logging.basicConfig(
    level=getattr(logging, log_level),
    format="%(message)s",
    datefmt="[%X]",
    handlers=logging_handlers
)

logger = logging.getLogger("claude-proxy")

# Apply truncation filter
truncate_filter = TruncateFilter()
for handler in logging.root.handlers:
    handler.addFilter(truncate_filter)

# Suppress noise from dependencies
for noise_maker in ["uvicorn", "uvicorn.access", "uvicorn.error", "openai", "httpx", "httpcore"]:
    logging.getLogger(noise_maker).setLevel(logging.WARNING)