import { Pool } from 'pg'

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'learnbot',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432'),
  client_encoding: 'UTF8',
})

export { pool }
export default pool

// Database schema initialization
export const initializeDatabase = async () => {
  const client = await pool.connect()
  
  try {
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('student', 'faculty')),
        nuid VARCHAR(50) UNIQUE,
        degree VARCHAR(255),
        major VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create classes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS classes (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        vector_store_folder VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    // Add vector_store_folder column if it doesn't exist (for existing databases)
    try {
      await client.query('ALTER TABLE classes ADD COLUMN IF NOT EXISTS vector_store_folder VARCHAR(255)')
    } catch (error) {
      console.log('vector_store_folder column already exists or could not be added')
    }
    
    // Add syllabus_vector_store_folder column if it doesn't exist (for existing databases)
    try {
      await client.query('ALTER TABLE classes ADD COLUMN IF NOT EXISTS syllabus_vector_store_folder VARCHAR(255)')
    } catch (error) {
      console.log('syllabus_vector_store_folder column already exists or could not be added')
    }

    // Create class_students junction table
    await client.query(`
      CREATE TABLE IF NOT EXISTS class_students (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(class_id, student_id)
      )
    `)

    // Create chat_sessions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        message_count INTEGER DEFAULT 0
      )
    `)

    // Create chat_messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        role VARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create chat_analytics table
    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_analytics (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id INTEGER NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        sentiment VARCHAR(50) NOT NULL CHECK (sentiment IN ('positive', 'neutral', 'negative')),
        topics TEXT[],
        duration INTEGER NOT NULL,
        message_count INTEGER NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create rag_conversations table
    await client.query(`
      CREATE TABLE IF NOT EXISTS rag_conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
    
    // Add chat_type column if it doesn't exist (for existing databases)
    try {
      await client.query(`ALTER TABLE rag_conversations ADD COLUMN IF NOT EXISTS chat_type VARCHAR(50) DEFAULT 'class_material'`)
    } catch (error) {
      console.log('chat_type column already exists or could not be added')
    }

    // Add conversation_summary column if it doesn't exist (for existing databases)
    try {
      await client.query(`ALTER TABLE rag_conversations ADD COLUMN IF NOT EXISTS conversation_summary TEXT`)
    } catch (error) {
      console.log('conversation_summary column already exists or could not be added')
    }

    // Create rag_conversations_history table - stores ALL conversations (including deleted ones) for reference only
    // This table is NOT used by any functionality, only for historical reference
    await client.query(`
      CREATE TABLE IF NOT EXISTS rag_conversations_history (
        id SERIAL PRIMARY KEY,
        original_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
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
      )
    `)

    // Create index for faster history queries
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rag_conversations_history_user 
      ON rag_conversations_history(user_id, archived_at DESC)
    `)

    // Create pending_registrations table for email verification
    await client.query(`
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
      )
    `)

    // Create indexes for pending_registrations
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pending_registrations_email 
      ON pending_registrations(email)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_pending_registrations_expires 
      ON pending_registrations(otp_expires_at)
    `)

    // Create assignments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS assignments (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        due_date TIMESTAMP NOT NULL,
        canvas_link TEXT,
        pdf_file_name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create indexes for assignments
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_assignments_class_id 
      ON assignments(class_id)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_assignments_faculty_id 
      ON assignments(faculty_id)
    `)

    // Create resources table
    await client.query(`
      CREATE TABLE IF NOT EXISTS resources (
        id SERIAL PRIMARY KEY,
        class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
        faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_name VARCHAR(255) NOT NULL,
        file_size BIGINT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // Create indexes for resources
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_resources_class_id 
      ON resources(class_id)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_resources_faculty_id 
      ON resources(faculty_id)
    `)

    // Add unique constraint to nuid if it doesn't exist (for existing databases)
    try {
      await client.query('ALTER TABLE users ADD CONSTRAINT users_nuid_unique UNIQUE (nuid)')
    } catch (error) {
      // Constraint might already exist, ignore the error
      console.log('NUID unique constraint already exists or could not be added')
    }

    // Insert sample data if tables are empty
    const userCount = await client.query('SELECT COUNT(*) FROM users')
    if (userCount.rows[0].count === '0') {
      await client.query(`
        INSERT INTO users (email, password, name, role, nuid, degree, major) VALUES
        ('student@northeastern.edu', 'student123', 'John Doe', 'student', '12345678', 'Bachelor of Science', 'Computer Science'),
        ('faculty@northeastern.edu', 'faculty123', 'Dr. Sarah Williams', 'faculty', NULL, NULL, NULL)
        ON CONFLICT (email) DO NOTHING
      `)
      
      // Create a sample class
      await client.query(`
        INSERT INTO classes (name, description, faculty_id) VALUES
        ('Introduction to Computer Science', 'Learn the fundamentals of programming and computer science', 2)
        ON CONFLICT DO NOTHING
      `)
      
      // Add student to class
      await client.query(`
        INSERT INTO class_students (class_id, student_id) VALUES
        (1, 1)
        ON CONFLICT (class_id, student_id) DO NOTHING
      `)
      
      console.log('Sample data inserted successfully')
    }

    console.log('Database tables created successfully')
  } catch (error) {
    console.error('Error initializing database:', error)
    throw error
  } finally {
    client.release()
  }
}
