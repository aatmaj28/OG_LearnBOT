import express, { Request, Response } from "express";
import axios from "axios";

const router = express.Router();

// Reverse mapping: API model names -> frontend-friendly aliases
// This should match the MODEL_ALIASES in model_config.py but in reverse
const API_TO_FRONTEND_MAPPING: { [key: string]: string } = {
        "google/gemma-3-12b-it": "gemma3:12b",
        "google/gemma-3-27b-it": "gemma3:27b",
        "meta-llama/Llama-3.3-8B-Instruct": "llama3.3:8b",
        "meta-llama/Llama-3.3-70B-Instruct": "llama3.3:70b",
  "meta-llama/Llama-3.1-8B-Instruct": "llama3.1:8b",
};

// GET /api/list-models - Get list of available models from vLLM service
router.get("/list-models", async (req: Request, res: Response): Promise<void> => {
  const ollamaModelUrl = process.env.OLLAMA_MODEL_URL;
  const ollamaUrl = process.env.OLLAMA_URL;
  
  // Debug: Log environment variables (without exposing full values)
  console.log("🔍 Model URL Configuration:");
  console.log(`  OLLAMA_MODEL_URL: ${ollamaModelUrl ? `${ollamaModelUrl.substring(0, 30)}... (length: ${ollamaModelUrl.length})` : 'NOT SET'}`);
  console.log(`  OLLAMA_URL: ${ollamaUrl ? `${ollamaUrl.substring(0, 30)}... (length: ${ollamaUrl.length})` : 'NOT SET'}`);
  
  const vllmUrl = ollamaModelUrl || ollamaUrl?.replace('/v1/completions', '') || "http://129.10.156.97:8000";
  
  // Remove /v1/completions if present in URL
  const baseUrl = vllmUrl.replace('/v1/completions', '').replace(/\/$/, '');
  const modelsEndpoint = `${baseUrl}/v1/models`;
  
  console.log(`  Using base URL: ${baseUrl}`);
  console.log(`  Fetching models from: ${modelsEndpoint}`);

  try {
    const response = await axios.get<{ data: Array<{ id: string }> }>(modelsEndpoint, {
      timeout: 5000, // 5 second timeout
    });

    // Extract model names from vLLM response
    // vLLM returns: { data: [{ id: "model-name", ... }, ...] }
    const apiModels = response.data.data?.map((model) => model.id) || [];

    if (apiModels.length === 0) {
      console.warn("⚠️ No models found in vLLM response");
      res.status(200).json([]);
      return;
    }

    // Map vLLM model names to frontend-friendly names
    // If a model is in the mapping, use the frontend name; otherwise use the API name
    const frontendModels = apiModels.map((apiModel: string) => {
      return API_TO_FRONTEND_MAPPING[apiModel] || apiModel;
    });

    console.log(`✅ Fetched ${frontendModels.length} models from vLLM:`, frontendModels);
    console.log(`   Note: This is just listing available models. The actual model used is determined by DEFAULT_MODEL or request parameter.`);
    res.status(200).json(frontendModels);
  } catch (error: any) {
    console.error("❌ Failed to fetch models from vLLM:", error.message);
    console.error(`  URL attempted: ${modelsEndpoint}`);
    if (error.response) {
      console.error(`  Response status: ${error.response.status}`);
      console.error(`  Response data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    }
    if (error.code) {
      console.error(`  Error code: ${error.code}`);
    }
    
    // Return empty array instead of error to allow UI to still function
    // The UI should handle empty model list gracefully
    res.status(200).json([]);
  }
});

export default router;
