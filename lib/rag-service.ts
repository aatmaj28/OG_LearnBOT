// RAG Service for LearnBot - Custom LLM Integration
import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import fs from 'fs'
import { 
  getRAGConversationById, 
  createRAGConversation, 
  updateRAGConversation,
  addRAGMessage,
  getClassById
} from './db-service'
import { VectorStoreManager } from './vector-store-manager'

// Configuration
const VECTOR_STORE_BASE_PATH = path.join(process.cwd(), 'vector_stores')

// Helper function to get vector store path for a class
const getVectorStorePath = async (classId?: string): Promise<string> => {
  if (!classId) {
    // Fallback to default vector store
    return path.join(process.cwd(), 'vector_store_ra')
  }
  
  try {
    // Get class data to find the vector store folder name
    const classData = await getClassById(classId)
    if (!classData?.vectorStoreFolder) {
      console.warn(`Class ${classId} does not have a vector store folder, using fallback`)
      return path.join(process.cwd(), 'vector_store_ra')
    }
    
    return VectorStoreManager.getVectorStorePathByFolder(classData.vectorStoreFolder)
  } catch (error) {
    console.error('Error getting vector store path:', error)
    return path.join(process.cwd(), 'vector_store_ra')
  }
}

// Types for RAG responses
export interface RAGResponse {
  conversation_id: string
  response: string
  guard_result: any
  retrieval_result: any
  leak_detected: boolean
}

export interface ConversationState {
  conversation_id: string
  user_id: string
  created_at: Date
  last_updated: Date
  title: string
  status: 'active' | 'archived'
  current_topic?: string
  checkpoint_state: {
    checkpoint_1_passed: boolean
    checkpoint_2_passed: boolean
    checkpoint_3_passed: boolean
    understanding_level: number
    awaiting_student_response: boolean
  }
  message_history: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
    metadata?: any
  }>
  student_problem_data: {
    numbers: string[]
    problem_type?: string
    chapter?: string
  }
  cached_context?: any
  last_retrieval_topic?: string
}

// RAG Service Class
export class RAGService {
  private pythonProcess: ChildProcess | null = null
  private isInitialized = false

  constructor() {
    // Initialize asynchronously
    this.initializeService().catch(error => {
      console.error('RAG Service initialization failed:', error)
    })
  }

  private async initializeService(): Promise<void> {
    try {
      // Get the default vector store path
      const defaultVectorStorePath = path.join(process.cwd(), 'vector_store_ra')
      
      // Check if vector store exists
      if (!fs.existsSync(defaultVectorStorePath)) {
        console.error('Vector store not found at:', defaultVectorStorePath)
        return
      }

      // Check required files
      const requiredFiles = ['config.json', 'faiss_index.bin', 'metadata.json', 'metadata.pkl']
      for (const file of requiredFiles) {
        if (!fs.existsSync(path.join(defaultVectorStorePath, file))) {
          console.error(`Required file not found: ${file}`)
          return
        }
      }

      console.log('✓ RAG Service initialized successfully')
      this.isInitialized = true
    } catch (error) {
      console.error('Failed to initialize RAG service:', error)
    }
  }

  // Create a new conversation
  async createConversation(userId: string, classId?: string): Promise<string> {
    try {
      const conversation = await createRAGConversation(userId, 'New Conversation', classId)
      return conversation.id
    } catch (error) {
      console.error('Failed to create conversation:', error)
      throw error
    }
  }

  // Get conversation by ID
  async getConversation(conversationId: string): Promise<ConversationState | null> {
    try {
      const conversation = await getRAGConversationById(conversationId)
      if (!conversation) return null

      // Convert RAGConversation to ConversationState format
      return {
        conversation_id: conversation.id,
        user_id: conversation.userId,
        created_at: conversation.createdAt,
        last_updated: conversation.updatedAt,
        title: conversation.title,
        status: conversation.status,
        checkpoint_state: conversation.checkpointState,
        message_history: (conversation.messageHistory || []).map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata
        })),
        student_problem_data: conversation.studentProblemData,
        cached_context: conversation.cachedContext,
        last_retrieval_topic: conversation.lastRetrievalTopic
      }
    } catch (error) {
      console.error('Failed to get conversation:', error)
      return null
    }
  }

  // Update conversation
  async updateConversation(conversationId: string, updates: Partial<ConversationState>): Promise<void> {
    try {
      const dbUpdates: any = {}
      
      if (updates.title) dbUpdates.title = updates.title
      if (updates.status) dbUpdates.status = updates.status
      if (updates.checkpoint_state) dbUpdates.checkpointState = updates.checkpoint_state
      if (updates.message_history) dbUpdates.messageHistory = updates.message_history
      if (updates.student_problem_data) dbUpdates.studentProblemData = updates.student_problem_data
      if (updates.cached_context) dbUpdates.cachedContext = updates.cached_context
      if (updates.last_retrieval_topic) dbUpdates.lastRetrievalTopic = updates.last_retrieval_topic

      await updateRAGConversation(conversationId, dbUpdates)
    } catch (error) {
      console.error('Failed to update conversation:', error)
      throw error
    }
  }

  // Add message to conversation
  async addMessage(conversationId: string, role: 'user' | 'assistant', content: string, metadata?: any): Promise<void> {
    try {
      console.log(`[RAG] Adding ${role} message to conversation ${conversationId}:`, content.substring(0, 100) + '...')
      await addRAGMessage(conversationId, role, content, metadata)
      console.log(`[RAG] Successfully added ${role} message to conversation ${conversationId}`)
    } catch (error) {
      console.error('Failed to add message:', error)
      throw error
    }
  }

  // Get user's conversations
  async getUserConversations(userId: string, classId?: string): Promise<ConversationState[]> {
    try {
      const conversations = await getRAGConversationsByUser(userId, classId)
      return conversations.map(conversation => ({
        conversation_id: conversation.id,
        user_id: conversation.userId,
        created_at: conversation.createdAt,
        last_updated: conversation.updatedAt,
        title: conversation.title,
        status: conversation.status,
        checkpoint_state: conversation.checkpointState,
        message_history: (conversation.messageHistory || []).map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          metadata: msg.metadata
        })),
        student_problem_data: conversation.studentProblemData,
        cached_context: conversation.cachedContext,
        last_retrieval_topic: conversation.lastRetrievalTopic
      }))
    } catch (error) {
      console.error('Failed to get user conversations:', error)
      return []
    }
  }

  // Archive conversation
  async archiveConversation(conversationId: string): Promise<void> {
    await this.updateConversation(conversationId, { status: 'archived' })
  }

  // Generate response using RAG system
  async generateRAGResponse(
    query: string,
    conversationId: string,
    userId: string,
    classId?: string
  ): Promise<RAGResponse> {
    if (!this.isInitialized) {
      throw new Error('RAG service not initialized')
    }

    try {
      // Get or create conversation
      let conversation = await this.getConversation(conversationId)
      if (!conversation) {
        conversationId = await this.createConversation(userId, classId)
        conversation = await this.getConversation(conversationId)
        if (!conversation) {
          throw new Error('Failed to create conversation')
        }
      }

      // Add user message
      await this.addMessage(conversationId, 'user', query)

      // Update title if first message
      if (conversation.message_history.length === 1) {
        const title = this.generateChatTitle(query)
        await this.updateConversation(conversationId, { title })
      }

      // Call Python RAG system with class-specific vector store
      const ragResponse = await this.callPythonRAGSystem(query, conversationId, userId, classId)

      // Add assistant response
      await this.addMessage(conversationId, 'assistant', ragResponse.response, {
        intent: ragResponse.guard_result?.intent,
        topic: ragResponse.guard_result?.problem_type,
        leak_detected: ragResponse.leak_detected
      })

      return ragResponse
    } catch (error) {
      console.error('RAG response generation failed:', error)
      throw error
    }
  }

  // Call Python RAG system
  private async callPythonRAGSystem(
    query: string,
    conversationId: string,
    userId: string,
    classId?: string
  ): Promise<RAGResponse> {
    return new Promise(async (resolve, reject) => {
      try {
        // Get the vector store path for the class
        const vectorStorePath = await getVectorStorePath(classId)
        
        // Create Python script content
        const pythonScript = `
import os
import sys
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer, CrossEncoder
import requests
import json

# Configuration
VECTOR_STORE_PATH = "${vectorStorePath.replace(/\\/g, '\\\\')}"
OLLAMA_BASE_URL = "http://localhost:11434"
EMBEDDING_MODEL = "nomic-ai/nomic-embed-text-v1.5"
RERANKER_MODEL = "BAAI/bge-reranker-v2-m3"
TOP_K_INITIAL = 30
TOP_K_AFTER_FILTER = 15
TOP_K_FINAL = 5

# Initialize models
try:
    embedder = SentenceTransformer(EMBEDDING_MODEL, trust_remote_code=True, device='cpu')
    reranker = CrossEncoder(RERANKER_MODEL, max_length=512, device='cpu')
    
    # Check if Ollama is available
    try:
        ollama_response = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        if ollama_response.status_code == 200:
            models = ollama_response.json().get('models', [])
            available_models = [model['name'] for model in models]
            print(f"Available Ollama models: {available_models}", file=sys.stderr)
            
            # Use the first available model or default to mistral
            if available_models:
                ollama_model = available_models[0]
            else:
                ollama_model = "mistral:latest"
        else:
            ollama_model = "mistral:latest"
    except:
        ollama_model = "mistral:latest"
        print("Ollama not available, using default model", file=sys.stderr)
    
    # Load FAISS index
    faiss_index = faiss.read_index(os.path.join(VECTOR_STORE_PATH, "faiss_index.bin"))
    with open(os.path.join(VECTOR_STORE_PATH, "metadata.pkl"), 'rb') as f:
        import pickle
        metadata = pickle.load(f)
    
    print("✓ Models loaded successfully", file=sys.stderr)
except Exception as e:
    print(f"Error loading models: {e}", file=sys.stderr)
    sys.exit(1)

# Function to call Ollama for response generation
def call_ollama(prompt, model_name=None):
    try:
        if model_name is None:
            model_name = ollama_model
            
        payload = {
            "model": model_name,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.2,
                "top_p": 0.95,
                "top_k": 40
            }
        }
        
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            result = response.json()
            return result.get('response', '')
        else:
            print(f"Ollama API error: {response.status_code}", file=sys.stderr)
            return None
            
    except Exception as e:
        print(f"Error calling Ollama: {e}", file=sys.stderr)
        return None

# Simplified RAG pipeline for API calls
def simple_rag_pipeline(query: str, conversation_id: str, user_id: str):
    try:
        # Stage 1: Input Guard
        guard_result = {
            "intent": "conceptual_learning",
            "is_checkpoint_response": False,
            "has_specific_numbers": False,
            "is_homework_question": False,
            "bypass_attempt": False,
            "extracted_numbers": [],
            "original_query": query,
            "teaching_query": query,
            "problem_type": "unknown",
            "requires_formula": False
        }
        
        # Stage 2: RAG Retrieval
        query_embedding = embedder.encode(f"search_query: {query}", convert_to_numpy=True, normalize_embeddings=True)
        query_embedding = query_embedding.reshape(1, -1).astype('float32')
        
        distances, indices = faiss_index.search(query_embedding, TOP_K_INITIAL)
        
        # Filter and rerank
        filtered_results = []
        for idx, score in zip(indices[0], distances[0]):
            if idx == -1:
                continue
            chunk_meta = metadata[int(idx)]
            filtered_results.append({
                "metadata": chunk_meta,
                "score": float(score),
                "original_similarity": float(score)
            })
        
        # Rerank using BGE
        if filtered_results:
            pairs = [[query, result["metadata"]["chunk_text"][:2000]] for result in filtered_results]
            rerank_scores = reranker.predict(pairs)
            
            for i, result in enumerate(filtered_results):
                result["rerank_score"] = float(rerank_scores[i])
            
            filtered_results.sort(key=lambda x: x["rerank_score"], reverse=True)
            final_results = filtered_results[:TOP_K_FINAL]
        else:
            final_results = []
        
        # Stage 3: Teaching Response
        if not final_results:
            teaching_response = f"I couldn't find information about '{query}' in our FINA 2201 textbook. This topic may not be covered in our course materials."
        else:
            # Extract context
            context_text = "\\n\\n".join([
                f"[Source {i+1} - {result['metadata'].get('section_title', 'Unknown')}]\\n{result['metadata']['chunk_text'][:1500]}"
                for i, result in enumerate(final_results)
            ])
            
            # Generate response
            prompt = f"""You are LearnBot, a Socratic teaching assistant for FINA 2201.

STUDENT QUERY: {query}

TEXTBOOK CONTEXT:
{context_text}

CRITICAL RULES:
1. OCF = NI + Depreciation + Interest Expense
2. Corporate tax = 21% flat
3. Taxes = (EBIT - Interest) × Tax Rate

STRATEGY:
- Teach concepts, don't solve problems
- Use formulas/tables from context
- Ask follow-up questions
- Guide student thinking

Response:"""
            
            try:
                teaching_response = call_ollama(prompt)
                if teaching_response is None:
                    teaching_response = "I found relevant information but had trouble generating a response. Please try rephrasing your question."
            except Exception as e:
                print(f"Error generating response: {e}", file=sys.stderr)
                teaching_response = "I found relevant information but had trouble generating a response. Please try rephrasing your question."
        
        # Stage 4: Leak Detection (simplified)
        leak_detected = False
        if any(word in teaching_response.lower() for word in ["the answer is", "therefore =", "correct answer"]):
            leak_detected = True
            teaching_response = "Let's work through this step by step. What do you think the first step should be?"
        
        return {
            "conversation_id": conversation_id,
            "response": teaching_response,
            "guard_result": guard_result,
            "retrieval_result": {"results": final_results, "content_found": len(final_results) > 0},
            "leak_detected": leak_detected
        }
        
    except Exception as e:
        return {
            "conversation_id": conversation_id,
            "response": f"I encountered an error processing your question: {str(e)}",
            "guard_result": {},
            "retrieval_result": {"results": [], "content_found": False},
            "leak_detected": False
        }

# Main execution
if __name__ == "__main__":
    query = sys.argv[1]
    conversation_id = sys.argv[2]
    user_id = sys.argv[3]
    class_id = sys.argv[4] if len(sys.argv) > 4 and sys.argv[4] else None
    
    result = simple_rag_pipeline(query, conversation_id, user_id)
    print(json.dumps(result))
`

      // Write Python script to temporary file
      const scriptPath = path.join(process.cwd(), 'temp_rag_script.py')
      fs.writeFileSync(scriptPath, pythonScript)

      // Execute Python script
      const pythonProcess = spawn('python', [scriptPath, query, conversationId, userId, classId || ''], {
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      pythonProcess.on('close', (code) => {
        // Clean up temporary file
        try {
          fs.unlinkSync(scriptPath)
        } catch (e) {
          // Ignore cleanup errors
        }

        console.log(`Python process exited with code: ${code}`)
        console.log(`Python stdout: ${stdout}`)
        console.log(`Python stderr: ${stderr}`)

        if (code === 0) {
          try {
            const result = JSON.parse(stdout)
            console.log('✅ Python RAG response received')
            resolve(result)
          } catch (parseError) {
            console.error('❌ Failed to parse Python output:', parseError)
            console.error('Raw stdout:', stdout)
            reject(new Error(`Failed to parse Python output: ${stdout}`))
          }
        } else {
          console.error('❌ Python script failed:', stderr)
          reject(new Error(`Python script failed with code ${code}: ${stderr}`))
        }
      })

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to start Python process: ${error.message}`))
      })
      
      } catch (error) {
        reject(new Error(`Failed to get vector store path: ${error.message}`))
      }
    })
  }

  // Generate chat title
  private generateChatTitle(firstMessage: string): string {
    // Simple title generation - take first few words
    const words = firstMessage.split(' ').slice(0, 6)
    return words.join(' ') + (firstMessage.split(' ').length > 6 ? '...' : '')
  }

  // Check if RAG service is available
  isAvailable(): boolean {
    return this.isInitialized
  }

  // Wait for initialization to complete
  async waitForInitialization(timeoutMs: number = 5000): Promise<boolean> {
    const startTime = Date.now()
    while (!this.isInitialized && (Date.now() - startTime) < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    return this.isInitialized
  }
}

// Singleton instance
export const ragService = new RAGService()
