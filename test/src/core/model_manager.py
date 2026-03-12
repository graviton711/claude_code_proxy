from src.core.config import config
import logging

logger = logging.getLogger(__name__)

class ModelManager:
    def __init__(self, config):
        self.config = config
    
    def map_claude_model_to_openai(self, claude_model: str) -> str:
        """Map Claude model names to OpenAI model names based on BIG/SMALL pattern"""
        # If it's already an OpenAI model, return as-is
        if claude_model.startswith("gpt-") or claude_model.startswith("o1-"):
            return claude_model

        # If it's other supported models (ARK/Doubao/DeepSeek), return as-is
        if (claude_model.startswith("ep-") or claude_model.startswith("doubao-") or 
            claude_model.startswith("deepseek-")):
            return claude_model
        
        # Map based on model naming patterns
        model_lower = claude_model.lower()
        if 'haiku' in model_lower:
            return self.config.small_model
        elif 'sonnet' in model_lower:
            return self.config.middle_model
        elif 'opus' in model_lower:
            return self.config.big_model
        else:
            # Smart Passthrough: If it doesn't look like a standard Claude model name, 
            # and it's not one of our known prefixes, it might be a custom model ID (especially for providers like iFlow).
            # We return it as-is instead of forcing it to BIG_MODEL.
            logger.debug(f"Unknown model pattern '{claude_model}', using passthrough.")
            return claude_model

model_manager = ModelManager(config)