import { type NextRequest, NextResponse } from "next/server"
import { getRAGConversationsByUser } from "@/lib/db-service"
import { ensureDatabaseInitialized } from "@/lib/init-db"

export async function POST(request: NextRequest) {
  try {
    await ensureDatabaseInitialized()
    
    const { userId, classId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 })
    }

    // Get all conversations for the user
    const conversations = await getRAGConversationsByUser(userId, classId)
    
    if (conversations.length === 0) {
      return NextResponse.json({ sentiment: 0, analysis: "No conversations found" })
    }

    // Extract all user messages
    const allUserMessages = []
    conversations.forEach(conversation => {
      const messages = conversation.messageHistory || []
      messages.forEach(message => {
        if (message.role === 'user') {
          allUserMessages.push({
            content: message.content,
            timestamp: message.timestamp,
            conversationTitle: conversation.title
          })
        }
      })
    })

    if (allUserMessages.length === 0) {
      return NextResponse.json({ sentiment: 0, analysis: "No user messages found" })
    }

    // Prepare messages for LLM analysis with context length management
    let messagesText = allUserMessages.map((msg, index) => 
      `Message ${index + 1} (${msg.conversationTitle}): ${msg.content}`
    ).join('\n\n')

    // Check if content is too long (rough estimate: 1 token ≈ 4 characters)
    // Most models have context limits around 32k-128k tokens
    const maxContextLength = 50000 // Conservative limit for safety
    if (messagesText.length > maxContextLength) {
      console.log('Content too long for LLM, using keyword fallback')
      return NextResponse.json({ 
        sentiment: calculateSimpleSentiment(allUserMessages),
        analysis: "Sentiment analysis using keyword matching (content too long for LLM)",
        method: "fallback",
        reason: "context_length"
      })
    }

    // Create prompt for sentiment analysis
    const prompt = `Analyze the sentiment and mood of the following student chat messages. Consider the overall emotional tone, engagement level, and learning attitude.

Messages:
${messagesText}

Please provide:
1. Overall sentiment score (-1 to +1, where -1 is very negative, 0 is neutral, +1 is very positive)
2. Brief analysis of the student's mood and engagement level
3. Key indicators that influenced your assessment

Respond in JSON format:
{
  "sentiment": 0.7,
  "analysis": "The student shows positive engagement with helpful language and clear questions...",
  "indicators": ["Uses positive language", "Asks clarifying questions", "Shows appreciation"]
}`

    // Call Ollama for sentiment analysis with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    try {
      const ollamaResponse = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral:latest', // or whatever model is available
          prompt: prompt,
          stream: false,
          options: {
            temperature: 0.3, // Lower temperature for more consistent analysis
            top_p: 0.9
          }
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!ollamaResponse.ok) {
        console.error('Ollama sentiment analysis failed:', ollamaResponse.status)
        // Fallback to simple keyword analysis
        return NextResponse.json({ 
          sentiment: calculateSimpleSentiment(allUserMessages),
          analysis: "Sentiment analysis using keyword matching (LLM unavailable)",
          method: "fallback",
          reason: "ollama_error"
        })
      }

      const ollamaData = await ollamaResponse.json()
      const responseText = ollamaData.response

      // Try to parse JSON response
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0])
          return NextResponse.json({
            sentiment: analysis.sentiment,
            analysis: analysis.analysis,
            indicators: analysis.indicators,
            method: "llm"
          })
        }
      } catch (parseError) {
        console.error('Failed to parse LLM response:', parseError)
      }

      // Fallback if JSON parsing fails
      return NextResponse.json({
        sentiment: calculateSimpleSentiment(allUserMessages),
        analysis: "Sentiment analysis completed but response format was unexpected",
        method: "fallback",
        reason: "parse_error"
      })

    } catch (error) {
      clearTimeout(timeoutId)
      
      if (error.name === 'AbortError') {
        console.error('Ollama request timed out')
        return NextResponse.json({ 
          sentiment: calculateSimpleSentiment(allUserMessages),
          analysis: "Sentiment analysis using keyword matching (LLM timeout)",
          method: "fallback",
          reason: "timeout"
        })
      }
      
      console.error('Ollama request failed:', error)
      return NextResponse.json({ 
        sentiment: calculateSimpleSentiment(allUserMessages),
        analysis: "Sentiment analysis using keyword matching (LLM error)",
        method: "fallback",
        reason: "request_error"
      })
    }

  } catch (error) {
    console.error("[v0] Sentiment analysis error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// Fallback sentiment analysis using keywords
function calculateSimpleSentiment(messages: any[]): number {
  if (messages.length === 0) return 0
  
  let positiveCount = 0
  let negativeCount = 0
  let totalCount = 0
  
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'helpful', 'thanks', 'thank you', 'yes', 'correct', 'right', 'understand', 'clear', 'perfect', 'awesome', 'brilliant', 'love', 'appreciate']
  const negativeWords = ['bad', 'wrong', 'confused', 'difficult', 'hard', 'no', 'incorrect', 'unclear', 'problem', 'error', 'stuck', 'help', 'don\'t understand', 'terrible', 'awful', 'hate', 'frustrated', 'annoying']
  
  messages.forEach(message => {
    const content = message.content.toLowerCase()
    const positiveMatches = positiveWords.filter(word => content.includes(word)).length
    const negativeMatches = negativeWords.filter(word => content.includes(word)).length
    
    positiveCount += positiveMatches
    negativeCount += negativeMatches
    totalCount += 1
  })
  
  if (totalCount === 0) return 0
  
  const sentiment = (positiveCount - negativeCount) / totalCount
  return Math.max(-1, Math.min(1, sentiment))
}
