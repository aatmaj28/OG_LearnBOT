/**
 * Flask API Client
 * 
 * Centralized API client for calling Flask backend
 * Replace all /api/* calls with this client
 */

const FLASK_API_URL = (process.env.NEXT_PUBLIC_FLASK_API_URL || 'http://localhost:5000').replace(/\/$/, '')

/**
 * Base fetch function with error handling
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const url = `${FLASK_API_URL}${path}`

  const defaultHeaders: HeadersInit = {
    'Content-Type': 'application/json',
  }

  // Add session ID to headers if available
  if (typeof window !== 'undefined') {
    const sessionId = localStorage.getItem('sessionId')
    if (sessionId) {
      defaultHeaders['X-Session-Id'] = sessionId
    }
  }

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  }

  try {
    console.log(`[Flask API] Calling ${url}`, { method: options.method || 'GET' })
    const response = await fetch(url, config)

    // Handle non-JSON responses
    const contentType = response.headers.get('content-type')
    if (!contentType?.includes('application/json')) {
      const text = await response.text()
      throw new Error(text || `HTTP ${response.status}`)
    }

    const data = await response.json()

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`)
    }

    return data as T
  } catch (error: any) {
    console.error(`[Flask API] Error calling ${endpoint}:`, error)

    // Provide more helpful error messages for network/connection failures
    const msg = error?.message ?? ''
    if (
      msg === 'Failed to fetch' ||
      msg.includes('Failed to fetch') ||
      (error?.name === 'TypeError' && msg.toLowerCase().includes('fetch'))
    ) {
      throw new Error(
        `Cannot connect to the login server at ${FLASK_API_URL}. Make sure the backend is running (e.g. LearnBot-Backend on port 5000).`
      )
    }

    throw error
  }
}

/**
 * Auth API endpoints
 */
export const authApi = {
  /**
   * Login
   */
  login: async (email: string, password: string, role?: string) => {
    return apiRequest<{
      success: boolean
      sessionId: string
      user: {
        id: string
        email: string
        name: string
        role: string
        nuid?: string
        degree?: string
        major?: string
      }
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, role }),
    })
  },

  /**
   * Get session
   */
  getSession: async (sessionId: string) => {
    return apiRequest<{
      success: boolean
      user: {
        id: string
        email: string
        name: string
        role: string
      }
    }>('/api/auth/session', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })
  },

  /**
   * Logout
   */
  logout: async (sessionId: string) => {
    return apiRequest<{ success: boolean }>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    })
  },

  /**
   * Register (when implemented)
   */
  register: async (data: {
    email: string
    password: string
    name: string
    role: string
    nuid?: string
    degree?: string
    major?: string
  }) => {
    return apiRequest<{ success: boolean; user: any }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * Send OTP for registration verification
   */
  sendOtp: async (email: string, password: string, name: string, role: string, nuid?: string, degree?: string, major?: string) => {
    return apiRequest<{ success: boolean; error?: string }>('/api/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, role, nuid, degree, major }),
    })
  },

  /**
   * Verify OTP (when implemented)
   */
  verifyOtp: async (email: string, otp: string) => {
    return apiRequest<{ success: boolean }>('/api/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    })
  },
}

/**
 * Users API endpoints
 */
export const usersApi = {
  getUsers: async (role?: string, id?: string, email?: string) => {
    const params = new URLSearchParams()
    if (role) params.append('role', role)
    if (id) params.append('id', id)
    if (email) params.append('email', email)
    const query = params.toString()
    return apiRequest(`/api/users${query ? `?${query}` : ''}`)
  },

  getTaMode: async (userId: string) => {
    return apiRequest(`/api/users/ta-mode?userId=${userId}`)
  },

  updateTaMode: async (userId: string, taMode: 'lenient' | 'normal' | 'strict') => {
    return apiRequest('/api/users/ta-mode', {
      method: 'PUT',
      body: JSON.stringify({ userId, taMode }),
    })
  },
}

/**
 * Students API endpoints
 */
export const studentsApi = {
  createStudent: async (data: {
    name: string
    email: string
    password?: string
    nuid?: string
    degree?: string
    major?: string
  }) => {
    return apiRequest('/api/students', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

/**
 * Classes API endpoints
 */
export const classesApi = {
  getClasses: async (facultyId?: string, studentId?: string) => {
    const params = new URLSearchParams()
    if (facultyId) params.append('facultyId', facultyId)
    if (studentId) params.append('studentId', studentId)
    return apiRequest(`/api/classes?${params.toString()}`)
  },

  createClass: async (data: {
    name: string
    description?: string
    facultyId: string
  }) => {
    return apiRequest('/api/classes', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  addStudent: async (classId: string, studentId: string) => {
    return apiRequest('/api/classes/add-student', {
      method: 'POST',
      body: JSON.stringify({ classId, studentId }),
    })
  },

  removeStudent: async (classId: string, studentId: string) => {
    return apiRequest('/api/classes/remove-student', {
      method: 'POST',
      body: JSON.stringify({ classId, studentId }),
    })
  },

  deleteClass: async (classId: string) => {
    return apiRequest(`/api/classes/delete?classId=${classId}`, {
      method: 'DELETE',
    })
  },

  getAssignments: async (classId: string, userId: string) => {
    return apiRequest(`/api/classes/assignments?classId=${classId}`, {
      headers: { 'X-User-Id': userId },
    })
  },

  createAssignment: async (formData: FormData) => {
    const sessionId = typeof window !== 'undefined' ? localStorage.getItem('sessionId') : null
    return fetch(`${FLASK_API_URL}/api/classes/assignments`, {
      method: 'POST',
      headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      body: formData,
    }).then(res => res.json())
  },

  deleteAssignment: async (classId: string, assignmentId: string, userId: string) => {
    return apiRequest(`/api/classes/assignments?classId=${classId}&assignmentId=${assignmentId}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId },
    })
  },

  downloadAssignment: async (classId: string, assignmentId: string) => {
    return fetch(`${FLASK_API_URL}/api/classes/assignments/download?classId=${classId}&assignmentId=${assignmentId}`)
      .then(res => res.blob())
  },

  getResources: async (classId: string, userId: string) => {
    return apiRequest(`/api/classes/resources?classId=${classId}`, {
      headers: { 'X-User-Id': userId },
    })
  },

  uploadResources: async (classId: string, files: File[], userId: string) => {
    const formData = new FormData()
    formData.append('classId', classId)
    files.forEach(file => formData.append('files', file))

    const sessionId = typeof window !== 'undefined' ? localStorage.getItem('sessionId') : null
    return fetch(`${FLASK_API_URL}/api/classes/resources?classId=${classId}`, {
      method: 'POST',
      headers: sessionId ? { 'X-Session-Id': sessionId, 'X-User-Id': userId } : { 'X-User-Id': userId },
      body: formData,
    }).then(res => res.json())
  },

  deleteResource: async (classId: string, fileName: string, userId: string) => {
    return apiRequest(`/api/classes/resources?classId=${classId}&fileName=${encodeURIComponent(fileName)}`, {
      method: 'DELETE',
      headers: { 'X-User-Id': userId },
    })
  },

  downloadResource: async (classId: string, fileName: string) => {
    const response = await fetch(`${FLASK_API_URL}/api/classes/resources/download?classId=${classId}&fileName=${encodeURIComponent(fileName)}`)
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `Failed to download resource: ${response.statusText}` }))
      throw new Error(errorData.error || `Failed to download resource: ${response.statusText}`)
    }
    return response.blob()
  },

  sendReminder: async (emails: string[], className: string, facultyName?: string) => {
    return apiRequest('/api/classes/send-reminder', {
      method: 'POST',
      body: JSON.stringify({ emails, className, facultyName }),
    })
  },
}

/**
 * Chat API endpoints
 */
export const chatApi = {
  getConversations: async (userId: string, classId?: string, chatType?: string) => {
    const params = new URLSearchParams()
    params.append('userId', userId)
    if (classId) params.append('classId', classId)
    if (chatType) params.append('chatType', chatType)
    return apiRequest(`/api/chat/conversations?${params.toString()}`)
  },

  createConversation: async (data: {
    userId: string
    title?: string
    classId?: string
    chatType?: string
  }) => {
    return apiRequest('/api/chat/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  getConversation: async (conversationId: string) => {
    return apiRequest(`/api/chat/conversations/${conversationId}`)
  },

  updateConversation: async (conversationId: string, updates: any) => {
    return apiRequest(`/api/chat/conversations/${conversationId}`, {
      method: 'PUT',
      body: JSON.stringify({ updates }),
    })
  },

  deleteConversation: async (conversationId: string) => {
    return apiRequest(`/api/chat/conversations/${conversationId}`, {
      method: 'DELETE',
    })
  },

  getMessages: async (sessionId: string) => {
    return apiRequest(`/api/chat/messages?sessionId=${sessionId}`)
  },

  sendMessage: async (data: {
    userId: string
    sessionId: string
    message: string
    classId?: string
    chatType?: string
    preferredModel?: string
    stream?: boolean
    deepThinking?: boolean
    attachments?: File[]
  }) => {
    if (data.attachments && data.attachments.length > 0) {
      // Use FormData for file uploads
      const formData = new FormData()
      formData.append('message', data.message)
      formData.append('userId', data.userId)
      formData.append('sessionId', data.sessionId)
      if (data.classId) formData.append('classId', data.classId)
      if (data.chatType) formData.append('chatType', data.chatType)
      if (data.preferredModel) formData.append('preferredModel', data.preferredModel)
      if (data.stream) formData.append('stream', 'true')
      if (data.deepThinking) formData.append('deepThinking', 'true')
      data.attachments.forEach(file => formData.append('attachments', file))

      const sessionId = typeof window !== 'undefined' ? localStorage.getItem('sessionId') : null
      return fetch(`${FLASK_API_URL}/api/chat/ai-response`, {
        method: 'POST',
        headers: sessionId ? { 'X-Session-Id': sessionId } : {},
        body: formData,
      }).then(async res => {
        if (data.stream) {
          return res // Return response for streaming
        }
        return res.json()
      })
    } else {
      // Use JSON for text-only
      return apiRequest('/api/chat/ai-response', {
        method: 'POST',
        body: JSON.stringify(data),
      })
    }
  },

  getSessions: async (userId: string) => {
    return apiRequest(`/api/chat/sessions?userId=${userId}`)
  },

  createSession: async (userId: string, title?: string, classId?: string) => {
    return apiRequest('/api/chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ userId, title, classId }),
    })
  },

  preloadRAG: async (userId: string, userRole: string) => {
    return apiRequest('/api/chat/rag/preload', {
      method: 'POST',
      body: JSON.stringify({ userId, userRole }),
    })
  },

  getRAGStatus: async () => {
    return apiRequest('/api/chat/rag/status')
  },
}

/**
 * Corpus API endpoints
 */
export const corpusApi = {
  upload: async (classId: string, files: File[], materialType: string = 'class_material') => {
    const formData = new FormData()
    files.forEach(file => formData.append('files', file))

    const sessionId = typeof window !== 'undefined' ? localStorage.getItem('sessionId') : null
    return fetch(`${FLASK_API_URL}/api/corpus/upload?classId=${classId}&materialType=${materialType}`, {
      method: 'POST',
      headers: sessionId ? { 'X-Session-Id': sessionId } : {},
      body: formData,
    }).then(res => res.json())
  },

  index: async (classId: string, materialType: string = 'class_material') => {
    return apiRequest('/api/corpus/index', {
      method: 'POST',
      body: JSON.stringify({ classId, materialType }),
    })
  },

  getFiles: async (classId: string, materialType?: string) => {
    const params = new URLSearchParams()
    params.append('classId', classId)
    if (materialType) params.append('materialType', materialType)
    return apiRequest(`/api/corpus/files?${params.toString()}`)
  },

  deleteFile: async (classId: string, filename: string, materialType: string = 'class_material') => {
    return apiRequest(`/api/corpus/files?classId=${classId}&filename=${encodeURIComponent(filename)}&materialType=${materialType}`, {
      method: 'DELETE',
    })
  },

  mergeAll: async (classIds: string[], classNames: string[]) => {
    return apiRequest('/api/corpus/merge-all', {
      method: 'POST',
      body: JSON.stringify({ classIds, classNames }),
    })
  },

  getStats: async (collectionName: string) => {
    return apiRequest(`/api/corpus/stats?collectionName=${collectionName}`)
  },

  /** For student portal: check if class has indexed PDFs (enables chat box). */
  getClassCorpusStats: async (classId: string, materialType: string = 'class_material', studentId?: string) => {
    const params = new URLSearchParams()
    params.append('classId', classId)
    params.append('materialType', materialType)
    if (studentId) params.append('studentId', studentId)
    return apiRequest(`/api/corpus/stats?${params.toString()}`) as Promise<{
      pdfCount?: number
      chunkCount?: number
      isEnrolled?: boolean
      hasIndexedFiles?: boolean
      canChat?: boolean
    }>
  },
}

/**
 * Analytics API endpoints
 */
export const analyticsApi = {
  getClassActivity: async (classId: string) => {
    return apiRequest(`/api/analytics/class-activity?classId=${classId}`)
  },

  getClassSummary: async (classId: string) => {
    return apiRequest(`/api/analytics/class-summary?classId=${classId}`)
  },

  getSentiment: async (userId: string, classId?: string) => {
    return apiRequest('/api/analytics/sentiment', {
      method: 'POST',
      body: JSON.stringify({ userId, classId }),
    })
  },
}

/**
 * Export default for convenience
 */
export default {
  auth: authApi,
  users: usersApi,
  students: studentsApi,
  classes: classesApi,
  chat: chatApi,
  corpus: corpusApi,
  analytics: analyticsApi,
}
