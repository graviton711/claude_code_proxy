import hashlib
import json
from typing import Dict, Optional


class VisionCache:
    """Simple in-memory cache for vision analysis reports."""

    def __init__(self):
        self._cache: Dict[str, str] = {}

    def _get_hash(self, content: any) -> str:
        """Generate a stable SHA-256 hash for the content (URL or base64 data)."""
        # Content is typically a list of dicts for multimodal messages
        content_str = json.dumps(content, sort_keys=True)
        return hashlib.sha256(content_str.encode("utf-8")).hexdigest()

    def get_report(self, content: any) -> Optional[str]:
        """Retrieve a cached report for the given image content."""
        cache_key = self._get_hash(content)
        return self._cache.get(cache_key)

    def set_report(self, content: any, report: str):
        """Store a report in the cache."""
        cache_key = self._get_hash(content)
        self._cache[cache_key] = report


# Global singleton
vision_cache = VisionCache()
