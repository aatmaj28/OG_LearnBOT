import { Pool } from 'pg'

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'learnbot',
  password: process.env.DB_PASSWORD || 'password',
  port: parseInt(process.env.DB_PORT || '5432'),
})

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)

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
        title VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
        current_topic TEXT,
        checkpoint_state JSONB,
        message_history JSONB DEFAULT '[]',
        student_problem_data JSONB,
        cached_context JSONB,
        last_retrieval_topic TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
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
