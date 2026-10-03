-- Database schema initialization for Docker
-- This file will be automatically executed when the PostgreSQL container starts

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  masked_id VARCHAR(64) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'faculty')),
  nuid VARCHAR(50) UNIQUE,
  degree VARCHAR(255),
  major VARCHAR(255),
  ta_mode VARCHAR(20) DEFAULT 'normal',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for masked_id lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_masked_id ON users(masked_id);
CREATE INDEX IF NOT EXISTS idx_users_id_masked ON users(id, masked_id);

-- Create classes table
CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vector_store_folder VARCHAR(255),
  syllabus_vector_store_folder VARCHAR(255),
  ta_mode VARCHAR(20) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create class_students junction table
CREATE TABLE IF NOT EXISTS class_students (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_masked_id VARCHAR(64) NOT NULL,
  enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id, student_id)
);

-- Indexes for class_students
CREATE INDEX IF NOT EXISTS idx_class_students_student_id ON class_students(student_id);
CREATE INDEX IF NOT EXISTS idx_class_students_masked_id ON class_students(student_masked_id);

-- Create chat_sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_masked_id VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  message_count INTEGER DEFAULT 0
);

-- Indexes for chat_sessions
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_masked_id ON chat_sessions(user_masked_id);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_masked_id VARCHAR(64) NOT NULL,
  session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_masked_id ON chat_messages(user_masked_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);

-- Create chat_analytics table
CREATE TABLE IF NOT EXISTS chat_analytics (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_masked_id VARCHAR(64) NOT NULL,
  session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sentiment VARCHAR(50) NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  topics TEXT[],
  duration INTEGER NOT NULL,
  message_count INTEGER NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for chat_analytics
CREATE INDEX IF NOT EXISTS idx_chat_analytics_user_id ON chat_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_masked_id ON chat_analytics(user_masked_id);
CREATE INDEX IF NOT EXISTS idx_chat_analytics_session_id ON chat_analytics(session_id);

-- Create rag_conversations table
CREATE TABLE IF NOT EXISTS rag_conversations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_masked_id VARCHAR(64) NOT NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  current_topic TEXT,
  checkpoint_state JSONB,
  message_history JSONB DEFAULT '[]',
  student_problem_data JSONB,
  cached_context JSONB,
  last_retrieval_topic TEXT,
  cached_sentiment DECIMAL(3,2) DEFAULT 0,
  cached_topics JSONB DEFAULT '[]',
  analytics_last_updated TIMESTAMP,
  conversation_summary TEXT,
  chat_type VARCHAR(50) DEFAULT 'class_material',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for rag_conversations (both user_id and masked_id patterns)
CREATE INDEX IF NOT EXISTS idx_rag_conversations_user_id ON rag_conversations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_rag_conversations_masked_id ON rag_conversations(user_masked_id, status);
CREATE INDEX IF NOT EXISTS idx_rag_conversations_user_class 
ON rag_conversations(user_id, class_id) 
WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_rag_conversations_masked_class 
ON rag_conversations(user_masked_id, class_id) 
WHERE status = 'active';

-- Create rag_conversations_history table - stores ALL conversations (including deleted ones) for reference only
CREATE TABLE IF NOT EXISTS rag_conversations_history (
  id SERIAL PRIMARY KEY,
  original_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  user_masked_id VARCHAR(100) NOT NULL,
  class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  current_topic TEXT,
  checkpoint_state JSONB,
  message_history JSONB DEFAULT '[]',
  student_problem_data JSONB,
  cached_context JSONB,
  last_retrieval_topic TEXT,
  cached_sentiment DECIMAL(3,2) DEFAULT 0,
  cached_topics JSONB DEFAULT '[]',
  analytics_last_updated TIMESTAMP,
  conversation_summary TEXT,
  chat_type VARCHAR(50) DEFAULT 'class_material',
  original_created_at TIMESTAMP,
  original_updated_at TIMESTAMP,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster history queries
CREATE INDEX IF NOT EXISTS idx_rag_conversations_history_original_id 
ON rag_conversations_history(original_id);

CREATE INDEX IF NOT EXISTS idx_rag_conversations_history_user_id 
ON rag_conversations_history(user_id);

-- Create pending_registrations table for email verification
CREATE TABLE IF NOT EXISTS pending_registrations (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'faculty')),
  nuid VARCHAR(50),
  degree VARCHAR(255),
  major VARCHAR(255),
  otp_code VARCHAR(6) NOT NULL,
  otp_expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for pending_registrations
CREATE INDEX IF NOT EXISTS idx_pending_registrations_email 
ON pending_registrations(email);

CREATE INDEX IF NOT EXISTS idx_pending_registrations_expires 
ON pending_registrations(otp_expires_at);

-- Create pending_class_enrollments table for invite-based flow
CREATE TABLE IF NOT EXISTS pending_class_enrollments (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(email, class_id)
);

-- Create indexes for pending_class_enrollments
CREATE INDEX IF NOT EXISTS idx_pending_class_enrollments_email 
ON pending_class_enrollments(email);

-- Canvas imports (tracks each Canvas bundle import per class)
CREATE TABLE IF NOT EXISTS canvas_imports (
  id            SERIAL PRIMARY KEY,
  import_id     VARCHAR(64) NOT NULL UNIQUE,
  class_id      INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  course_name   VARCHAR(512),
  categories    JSONB NOT NULL DEFAULT '{}',
  total_chunks  INTEGER NOT NULL DEFAULT 0,
  imported_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_canvas_imports_class_id ON canvas_imports(class_id);
CREATE INDEX IF NOT EXISTS idx_canvas_imports_imported_at ON canvas_imports(imported_at DESC);

-- Canvas items (individual items within each import)
CREATE TABLE IF NOT EXISTS canvas_items (
  id          SERIAL PRIMARY KEY,
  import_id   VARCHAR(64) NOT NULL REFERENCES canvas_imports(import_id) ON DELETE CASCADE,
  class_id    INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  category    VARCHAR(50) NOT NULL,
  canvas_id   VARCHAR(128),
  title       VARCHAR(1024) NOT NULL,
  body_text   TEXT DEFAULT '',
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_canvas_items_class_id ON canvas_items(class_id);
CREATE INDEX IF NOT EXISTS idx_canvas_items_import_id ON canvas_items(import_id);
CREATE INDEX IF NOT EXISTS idx_canvas_items_class_category ON canvas_items(class_id, category);

-- Corpus files (uploaded PDFs / DOCX / etc. per class, per material type)
CREATE TABLE IF NOT EXISTS corpus_files (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  material_type VARCHAR(50) NOT NULL DEFAULT 'assignments' CHECK (material_type IN ('assignments', 'class_material', 'syllabus', 'announcements', 'modules', 'discussions', 'grades')),
  file_size BIGINT,
  chunk_count INTEGER DEFAULT 0,
  is_indexed BOOLEAN DEFAULT false,
  indexed_at TIMESTAMP,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id, file_name, material_type)
);
CREATE INDEX IF NOT EXISTS idx_corpus_files_class_id ON corpus_files(class_id);
CREATE INDEX IF NOT EXISTS idx_corpus_files_material_type ON corpus_files(material_type);
CREATE INDEX IF NOT EXISTS idx_corpus_files_class_material ON corpus_files(class_id, material_type);

-- Password reset tokens (forgot-password flow)
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Insert sample data (demo logins: student123 / faculty123, stored as bcrypt hashes)
INSERT INTO users (masked_id, email, password, name, role, nuid, degree, major) VALUES
('STUDENT_MASKED_001', 'student@northeastern.edu', '$2b$12$/EZsyX6G66P9xKJbOZta4uWr6K/ud2oXN8J0mn2bufEFnRQZBZvuK', 'John Doe', 'student', '12345678', 'Bachelor of Science', 'Computer Science'),
('FACULTY_MASKED_001', 'faculty@northeastern.edu', '$2b$12$NesM.pVWiuon2jSzXb9HIeNk9i3I3pZRRtt.yfpK93HSqYgwDNdVK', 'Dr. Sarah Williams', 'faculty', NULL, NULL, NULL)
ON CONFLICT (email) DO NOTHING;

-- Create a sample class (idempotent: ON CONFLICT DO NOTHING alone doesn't work because
-- there's no UNIQUE constraint on name/faculty_id and SERIAL auto-increments, so the seed
-- would insert a duplicate on every re-run. Use WHERE NOT EXISTS instead.)
INSERT INTO classes (name, description, faculty_id)
SELECT 'Introduction to Computer Science', 'Learn the fundamentals of programming and computer science', 2
WHERE NOT EXISTS (
  SELECT 1 FROM classes WHERE name = 'Introduction to Computer Science' AND faculty_id = 2
);

-- Add student to class
INSERT INTO class_students (class_id, student_id, student_masked_id) VALUES
(1, 1, 'STUDENT_MASKED_001')
ON CONFLICT (class_id, student_id) DO NOTHING;
