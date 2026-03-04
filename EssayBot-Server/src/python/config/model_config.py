"""
Central Model Configuration
===========================
Define all model settings in ONE place to avoid scattered configurations.

To change the model, just update DEFAULT_MODEL below.
"""

# ============================================================================
# PRIMARY MODEL CONFIGURATION - CHANGE HERE ONLY
# ============================================================================

DEFAULT_MODEL = "google/gemma-3-12b-it"  # Default to 12b model (most commonly available)

# Model-specific parameters
MODEL_PARAMETERS = {
    "google/gemma-3-12b-it": {
        "max_tokens": 800,
        "temperature": 0.1,
        "top_p": 0.95,
    },
    "google/gemma-3-27b-it": {
        "max_tokens": 800,
        "temperature": 0.1,
        "top_p": 0.95,
    },
    "meta-llama/Llama-3.3-70B-Instruct": {
        "max_tokens": 800,
        "temperature": 0.1,
        "top_p": 0.95,
    },
}

# ============================================================================
# MODEL ALIASES - Map frontend names to actual model IDs
# ============================================================================

MODEL_ALIASES = {
    # Gemma aliases
    "gemma3:12b": "google/gemma-3-12b-it",
    "gemma-3-12b": "google/gemma-3-12b-it",
    "gemma3:27b": "google/gemma-3-27b-it",
    "gemma-3-27b": "google/gemma-3-27b-it",
    "google/gemma-3-12b-it": "google/gemma-3-12b-it",
    "google/gemma-3-27b-it": "google/gemma-3-27b-it",
    "gemma-3-12b-it": "google/gemma-3-12b-it",
    "gemma-3-27b-it": "google/gemma-3-27b-it",

    # Llama aliases
    "llama3.3:70b": "meta-llama/Llama-3.3-70B-Instruct",
    "llama3.1:8b": "meta-llama/Llama-3.1-8B-Instruct",
    "meta-llama/Llama-3.3-70B-Instruct": "meta-llama/Llama-3.3-70B-Instruct",
    "meta-llama/Llama-3.1-8B-Instruct": "meta-llama/Llama-3.1-8B-Instruct",
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================


def get_model_name(model: str = None) -> str:
    """
    Get the actual model name, resolving aliases.

    Args:
        model: Model name or alias. If None, returns DEFAULT_MODEL.

    Returns:
        Resolved model name
    """
    if not model:
        return DEFAULT_MODEL

    model = str(model).strip()
    return MODEL_ALIASES.get(model, model)


def get_model_parameters(model: str = None) -> dict:
    """
    Get optimal parameters for a given model.

    Args:
        model: Model name or alias. If None, uses DEFAULT_MODEL.

    Returns:
        Dict with max_tokens, temperature, top_p
    """
    resolved_model = get_model_name(model)

    # Return model-specific parameters or defaults
    return MODEL_PARAMETERS.get(resolved_model, {
        "max_tokens": 800,
        "temperature": 0.1,
        "top_p": 0.95,
    })
