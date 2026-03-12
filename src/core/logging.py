import logging
from src.core.config import config

# Parse log level - extract just the first word to handle comments
log_level = config.log_level.split()[0].upper()

# Validate and set default if invalid
valid_levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']
if log_level not in valid_levels:
    log_level = 'INFO'

class TruncateFilter(logging.Filter):
    """Filter to truncate very long log messages to prevent I/O stalls."""
    def filter(self, record):
        if isinstance(record.msg, str) and len(record.msg) > 10000:
            record.msg = record.msg[:10000] + "... [TRUNCATED]"
        return True

# Logging Configuration
logging_handlers = [logging.StreamHandler()]

# Add file handler
try:
    file_handler = logging.FileHandler('proxy.log', encoding='utf-8')
    logging_handlers.append(file_handler)
except Exception:
    pass

logging.basicConfig(
    level=getattr(logging, log_level),
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=logging_handlers
)
logger = logging.getLogger(__name__)

# Apply truncation filter to all handlers of the root logger
truncate_filter = TruncateFilter()
for handler in logging.root.handlers:
    handler.addFilter(truncate_filter)

# Configure uvicorn to be quieter
for uvicorn_logger in ["uvicorn", "uvicorn.access", "uvicorn.error"]:
    logging.getLogger(uvicorn_logger).setLevel(logging.WARNING)