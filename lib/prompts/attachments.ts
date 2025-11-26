/**
 * Attachment Handling Prompts
 * 
 * These prompts handle file/photo uploads and guide the AI to:
 * - Acknowledge attachments when provided
 * - Process and incorporate attachment content into responses
 * - Handle cases with and without attachments gracefully
 */

/**
 * Get attachment acknowledgment and processing instructions
 * This is appended to the system prompt when attachments are present
 */
export function getAttachmentHandlingInstructions(
  attachments: Array<{ name: string; type: string }>,
  deepThinkingEnabled: boolean = false
): string {
  if (!attachments || attachments.length === 0) {
    return '' // No attachments, no special instructions needed
  }

  const imageAttachments = attachments.filter(att => att.type.startsWith('image/'))
  const documentAttachments = attachments.filter(att => 
    att.type === 'application/pdf' || 
    att.type.includes('document') || 
    att.type === 'text/plain'
  )

  let instructions = `

[ATTACHMENT(S) PROVIDED BY STUDENT${deepThinkingEnabled ? ' - DEEP THINKING MODE ACTIVE' : ''}]

The student has attached the following file(s) to their query:
`

  // List all attachments
  attachments.forEach((att, index) => {
    const fileType = att.type.startsWith('image/') 
      ? 'image' 
      : att.type === 'application/pdf' 
        ? 'PDF document' 
        : att.type.includes('document') 
          ? 'document' 
          : 'file'
    
    instructions += `${index + 1}. ${att.name} (${fileType})\n`
  })

  instructions += `
CRITICAL INSTRUCTIONS FOR HANDLING ATTACHMENTS:

1. ACKNOWLEDGMENT (REQUIRED):
   - Always acknowledge the attachment(s) at the beginning of your response
   - Use a friendly, natural acknowledgment like: "Thanks for providing [filename]! I can see..."
   - If multiple attachments, acknowledge all of them
   - Example: "Thanks for sharing the diagram in [filename] and the problem statement in [filename2]! I can see..."

2. CONTENT PROCESSING:
   - Carefully analyze the content from the attachment(s)
   - Extract relevant information, data, diagrams, formulas, or text from the attachments
   - Incorporate this information into your response as context
   - If the attachment contains a problem, diagram, or question, use it to better understand what the student is asking

3. INTEGRATION WITH QUERY:
   - The attachment(s) provide additional context to the student's question
   - Use the attachment content to provide more accurate and relevant responses
   - If the attachment shows a problem, diagram, or specific content, reference it in your explanation
   - Connect the attachment content with the student's text query

4. RESPONSE QUALITY:
   - Be specific about what you see in the attachment(s)
   - If the attachment contains visual information (diagrams, charts, graphs), describe what you observe
   - If the attachment contains text (PDF, document), reference specific parts when relevant
   - Use the attachment content to enhance your teaching and explanations

5. LIMITATIONS:
   - If you cannot clearly see or understand something in an attachment, acknowledge it and ask for clarification
   - If the attachment quality is poor or unclear, mention this politely
   - If the attachment seems unrelated to the question, gently point this out

REMEMBER: The student attached these files because they provide important context for their question. Always acknowledge them and use their content to provide better, more contextual responses.${deepThinkingEnabled ? `

DEEP THINKING MODE + ATTACHMENTS:
When Deep Thinking Mode is enabled with attachments, you should:
- Provide even more thorough analysis of the attachment content
- Break down visual elements (diagrams, charts, graphs) step-by-step with detailed explanations
- Analyze document content from multiple angles and perspectives
- Connect attachment content to broader concepts and principles
- Provide comprehensive context about what the attachment shows and why it matters
- Go beyond surface-level observations to explain underlying patterns, relationships, and implications
- Use the attachment as a foundation for deeper educational exploration` : ''}`

  // Add specific instructions for images vs documents
  if (imageAttachments.length > 0) {
    instructions += `

SPECIFIC INSTRUCTIONS FOR IMAGE ATTACHMENTS:
- Carefully examine the image(s) for diagrams, charts, graphs, handwritten notes, or visual problem representations
- Describe what you see in the image(s) in your response
- If the image contains a problem or question, use it to understand the student's query better
- Reference specific elements in the image when explaining concepts
- If the image shows work or calculations, acknowledge and discuss them`
  }

  if (documentAttachments.length > 0) {
    instructions += `

SPECIFIC INSTRUCTIONS FOR DOCUMENT ATTACHMENTS:
- Extract and reference relevant text, formulas, or information from the document(s)
- If the document contains a problem statement, use it to understand the context
- Quote or paraphrase relevant sections when helpful
- Connect the document content with the student's question`
  }

  return instructions
}

/**
 * Get instructions for when no attachments are provided
 * This ensures the AI knows to respond normally without looking for attachments
 */
export function getNoAttachmentInstructions(): string {
  return `

[NO ATTACHMENTS PROVIDED]

The student has not attached any files to their query. Respond normally based on their text question and conversation context. Do not mention or ask about attachments.`
}

