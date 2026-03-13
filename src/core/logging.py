import logging
from src.core.config import config

# Parse log level
log_level = config.log_level.split()[0].upper()
valid_levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
if log_level not in valid_levels:
    log_level = 'INFO'

# Filter to truncate very long log messages to prevent terminal clutter
class TruncateFilter(logging.Filter):
    def filter(self, record):
        if isinstance(record.msg, str) and len(record.msg) > 5000:
            record.msg = record.msg[:5000] + "... [TRUNCATED]"
        return True

# Logging Configuration
logger = logging.getLogger("claude-proxy")
logger.setLevel(getattr(logging, log_level))
logger.propagate = False  # Prevent propagating to root logger to avoid double logging

# Handlers
console_handler = logging.StreamHandler()
console_handler.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))

logging_handlers = [console_handler]

# Handlers are solely managed by the Orchestrator via stdout/stderr redirection
# to proxy.log, so we only need a StreamHandler here for the console view.
logging_handlers = [console_handler]

# Clear existing handlers if any and add new ones
logger.handlers.clear()
truncate_filter = TruncateFilter()
for handler in logging_handlers:
    handler.addFilter(truncate_filter)
    logger.addHandler(handler)

# Suppress noise from dependencies
for noise_maker in ["uvicorn", "uvicorn.access", "uvicorn.error", "openai", "httpx", "httpcore"]:
    logging.getLogger(noise_maker).setLevel(logging.WARNING)