# Feature Implementation Checklist

## Status: All Three Features Are **NOT IMPLEMENTED**

---

## 1. File/Photo Upload Feature ❌

### Current State
- Chat interfaces only support text input
- No file upload UI, attachment handling, or image preview
- File upload exists only for class resources (PDFs), not chat messages

### Files That Need Changes

#### Frontend Components
- ✅ `components/student-chat-interface.tsx`
  - Add file upload button/icon
  - Add hidden file input (`<input type="file" accept="image/*,.pdf,.doc,.docx">`)
  - Add attachment preview UI (thumbnails, file names, remove buttons)
  - Modify `sendMessage()` to include attachments in request
  - Add state: `const [attachments, setAttachments] = useState<File[]>([])`

- ✅ `components/faculty-chat-tab.tsx`
  - Same changes as above

- ✅ `components/chat-message.tsx`
  - Add rendering for file/image attachments in messages
  - Display image thumbnails, file icons, download links

#### Type Definitions
- ✅ `lib/types.ts`
  - Extend `ChatMessage` interface:
    ```typescript
    attachments?: Array<{
      type: 'file' | 'image'
      url: string
      name: string
      mimeType: string
      size?: number
    }>
    ```
  - Extend `RAGConversation.messageHistory` to support attachments

#### Backend API
- ✅ `app/api/chat/ai-response/route.ts`
  - Accept `attachments` array in request body
  - Handle file uploads (multipart/form-data or base64)
  - Pass attachments to RAG service

- ✅ `lib/rag-service.ts`
  - Process file attachments (image OCR, file text extraction)
  - Include file content in RAG context
  - Modify `generateRAGResponse()` and `generateRAGStreamingResponse()` to accept attachments

- ✅ `lib/llamaindex-rag-service.py`
  - Handle file attachments in Python backend
  - Image processing (OCR, vision models)
  - File parsing (PDF, DOCX, etc.)

- ✅ `lib/db-service.ts`
  - Store file attachments in database
  - New table: `chat_attachments` or extend `chat_messages` table
  - Functions: `saveChatAttachment()`, `getChatAttachments()`

- ⚠️ **Optional**: `app/api/chat/upload/route.ts` (new file)
  - Separate endpoint for file uploads (if uploading separately before sending message)

---

## 2. Deep Thinking Mode ❌

### Current State
- No UI toggle or backend parameter for extended reasoning
- No special processing for deeper analysis

### Files That Need Changes

#### Frontend Components
- ✅ `components/student-chat-interface.tsx`
  - Add toggle/button for deep thinking mode
  - Add state: `const [deepThinking, setDeepThinking] = useState(false)`
  - Pass `deepThinking` flag in API request

- ✅ `components/faculty-chat-tab.tsx`
  - Same changes as above

#### Backend API
- ✅ `app/api/chat/ai-response/route.ts`
  - Accept `deepThinking?: boolean` parameter in request body
  - Pass to RAG service

- ✅ `lib/rag-service.ts`
  - Accept `deepThinking` parameter
  - Pass to Python backend
  - Adjust prompts/parameters for extended reasoning

- ✅ `lib/llamaindex-rag-service.py`
  - Implement extended reasoning logic:
    - Chain-of-thought prompting
    - Multiple reasoning passes
    - Extended context window
    - More detailed analysis

- ⚠️ **Optional**: `lib/prompts/*.ts` (lenient.ts, normal.ts, strict.ts)
  - Add deep thinking instructions to prompts
  - Or create separate deep thinking prompt variants

---

## 3. Voice Input Mode ❌

### Current State
- No microphone button, speech-to-text, or audio recording
- No audio input handling

### Files That Need Changes

#### Frontend Components
- ✅ `components/student-chat-interface.tsx`
  - Add microphone button/icon
  - Add audio recording UI (recording indicator, stop button)
  - Add state: `const [isRecording, setIsRecording] = useState(false)`
  - Integrate Web Speech API or external speech-to-text service
  - Convert audio to text and populate input field

- ✅ `components/faculty-chat-tab.tsx`
  - Same changes as above

- ✅ **New**: `lib/speech-to-text.ts` (new file)
  - Speech-to-text utility
  - Web Speech API wrapper
  - Handle browser compatibility
  - Error handling

#### Backend API
- ⚠️ **Optional**: `app/api/chat/transcribe/route.ts` (new file)
  - Audio transcription endpoint (if using server-side transcription)
  - Accept audio file (WAV, MP3, etc.)
  - Return transcribed text
  - Use OpenAI Whisper or similar service

- ⚠️ **Optional**: `app/api/chat/ai-response/route.ts`
  - Handle audio transcription if done server-side
  - Process transcribed text

- ⚠️ **Optional**: `lib/rag-service.ts`
  - Process transcribed text (if transcription happens server-side)

---

## Implementation Priority Recommendations

1. **File/Photo Upload** (Most Complex)
   - Requires database schema changes
   - Requires file storage (local filesystem or cloud storage)
   - Requires image/file processing in Python backend
   - **Estimated Complexity**: High

2. **Deep Thinking Mode** (Medium Complexity)
   - Primarily prompt engineering and parameter tuning
   - No database changes needed
   - **Estimated Complexity**: Medium

3. **Voice Input Mode** (Lowest Complexity)
   - Can use browser Web Speech API (client-side only)
   - No backend changes required if using client-side transcription
   - **Estimated Complexity**: Low (client-side) to Medium (server-side)

---

## Notes

- All three features are currently **NOT IMPLEMENTED**
- File upload exists for class resources but not for chat messages
- Consider using existing libraries:
  - **File Upload**: `react-dropzone` for drag-and-drop
  - **Voice Input**: Web Speech API (built-in browser API)
  - **Deep Thinking**: Prompt engineering + model parameters

