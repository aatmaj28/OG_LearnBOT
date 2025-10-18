// AI utilities for chat and analytics
import { createChatAnalytics } from "./mock-db"
import { generateOllamaResponse, checkOllamaStatus } from "./ollama-service"

// Generate AI response using Ollama (with fallback to mock responses)
export const generateChatResponse = async (message: string): Promise<string> => {
  try {
    // Check if Ollama is available
    const { isRunning, modelAvailable } = await checkOllamaStatus()
    
    if (isRunning && modelAvailable) {
      // Use Ollama for AI response
      return await generateOllamaResponse(message, 'mistral:latest')
    } else {
      console.warn('Ollama not available, using fallback responses')
      return await generateFallbackResponse(message)
    }
  } catch (error) {
    console.error('Error generating AI response:', error)
    return await generateFallbackResponse(message)
  }
}

// Fallback mock responses when Ollama is not available
const generateFallbackResponse = async (message: string): Promise<string> => {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1000))

  // Simple mock responses based on keywords
  const lowerMessage = message.toLowerCase()

  if (lowerMessage.includes("hello") || lowerMessage.includes("hi")) {
    return "Hello! I'm here to help you with your studies. What would you like to learn about today?"
  }

  if (lowerMessage.includes("math") || lowerMessage.includes("algebra")) {
    return "I can help you with math! Whether it's algebra, calculus, or geometry, feel free to ask me specific questions or problems you'd like to work through."
  }

  if (lowerMessage.includes("science") || lowerMessage.includes("physics")) {
    return "Science is fascinating! I can assist with physics, chemistry, biology, and more. What specific topic are you interested in?"
  }

  if (lowerMessage.includes("programming") || lowerMessage.includes("code")) {
    return "Programming is a great skill to learn! I can help with concepts like variables, loops, functions, and more. What programming topic would you like to explore?"
  }

  return "That's an interesting question! I'm here to help you learn. Could you provide more details about what you'd like to know?"
}

// Analyze chat content for sentiment and topics
export const analyzeChatContent = (
  messages: string[],
): {
  sentiment: "positive" | "neutral" | "negative"
  topics: string[]
} => {
  const content = messages.join(" ").toLowerCase()

  // Simple sentiment analysis
  const positiveWords = ["great", "good", "thanks", "helpful", "understand", "clear", "excellent"]
  const negativeWords = ["confused", "difficult", "hard", "don't understand", "stuck", "frustrated"]

  const positiveCount = positiveWords.filter((word) => content.includes(word)).length
  const negativeCount = negativeWords.filter((word) => content.includes(word)).length

  let sentiment: "positive" | "neutral" | "negative" = "neutral"
  if (positiveCount > negativeCount) sentiment = "positive"
  else if (negativeCount > positiveCount) sentiment = "negative"

  // Simple topic extraction
  const topicKeywords = {
    Mathematics: ["math", "algebra", "calculus", "geometry", "equation", "number"],
    Science: ["science", "physics", "chemistry", "biology", "experiment"],
    Programming: ["code", "programming", "function", "variable", "algorithm", "javascript", "python"],
    History: ["history", "war", "ancient", "civilization", "historical"],
    Literature: ["book", "novel", "poem", "literature", "author", "writing"],
  }

  const topics: string[] = []
  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some((keyword) => content.includes(keyword))) {
      topics.push(topic)
    }
  }

  return { sentiment, topics: topics.length > 0 ? topics : ["General"] }
}

// Calculate session duration and create analytics
export const createSessionAnalytics = (
  userId: string,
  sessionId: string,
  messages: string[],
  startTime: Date,
  endTime: Date,
) => {
  const duration = Math.round((endTime.getTime() - startTime.getTime()) / 60000) // minutes
  const { sentiment, topics } = analyzeChatContent(messages)

  return createChatAnalytics({
    userId,
    sessionId,
    sentiment,
    topics,
    duration,
    messageCount: messages.length,
  })
}
