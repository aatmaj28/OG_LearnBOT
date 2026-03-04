import torch

if torch.cuda.is_available():
    torch.cuda.empty_cache()
    print("HuggingFace model cache cleared from GPU")
else:
    print("No GPU available")

