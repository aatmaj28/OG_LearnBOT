# Ollama Integration Setup Guide

This guide will help you set up Ollama with Mistral for local AI inference in your LearnBOT application.

## Prerequisites

- Windows 10/11 (you're already on Windows 10)
- At least 8GB RAM (16GB recommended for Mistral 7B)
- At least 10GB free disk space

## Step 1: Install Ollama

1. Go to [https://ollama.ai](https://ollama.ai)
2. Download the Windows installer
3. Run the installer and follow the setup instructions
4. Ollama will be installed and start automatically

## Step 2: Pull Mistral Model

Open PowerShell or Command Prompt and run:

```bash
# Pull the Mistral 7B Instruct model (recommended)
ollama pull mistral:7b-instruct

# Alternative: Pull the latest Mistral model
ollama pull mistral:latest
```

## Step 3: Verify Installation

1. Start your Next.js development server:
   ```bash
   npm run dev
   ```

2. Visit `http://localhost:3000/api/ollama/status` to check if Ollama is running and the model is available.

## Step 4: Test the Chat

1. Go to the student chat interface
2. Send a message - it should now use Mistral for AI responses
3. The system will automatically fall back to mock responses if Ollama is not available

## Available Models

The system supports these Mistral models:
- `mistral:7b-instruct` (recommended - best balance of performance and quality)
- `mistral:7b` (base model)
- `mistral:latest` (latest version)

## Troubleshooting

### Ollama not starting
- Check if Ollama service is running in Windows Services
- Restart Ollama: `ollama serve`

### Model not found
- Pull the model: `ollama pull mistral:7b-instruct`
- Check available models: `ollama list`

### Out of memory errors
- Try a smaller model or close other applications
- Consider using `mistral:7b` instead of larger models

### Slow responses
- This is normal for local inference
- Consider using a GPU if available (Ollama supports GPU acceleration)

## Configuration

The Ollama service is configured in `lib/ollama-service.ts`:
- Host: `http://localhost:11434` (default Ollama port)
- Model: `mistral:7b-instruct` (can be changed)
- Temperature: 0.7 (creativity level)
- Max tokens: 1000 (response length)

## Benefits of Local Inference

✅ **Privacy**: All data stays on your machine
✅ **No API costs**: No external service fees
✅ **Offline capability**: Works without internet
✅ **Customization**: Can fine-tune models
✅ **Speed**: No network latency (after initial load)

## Next Steps

Once set up, you can:
1. Customize the system prompts in `lib/ollama-service.ts`
2. Add more models for different use cases
3. Implement conversation memory for better context
4. Add model switching in the UI
