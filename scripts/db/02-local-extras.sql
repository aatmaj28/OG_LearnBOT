-- Tables the apps create lazily at runtime but Frontend/init-schema.sql does not include.
-- Creating them up front means Flask routes work even before a Next.js route has run
-- initializeDatabase() (Frontend/lib/db.ts) or Flask has created auth_sessions.

CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  due_date TIMESTAMP NOT NULL,
  canvas_link TEXT,
  pdf_file_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_assignments_class_id ON assignments(class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_faculty_id ON assignments(faculty_id);

CREATE TABLE IF NOT EXISTS resources (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  faculty_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_resources_class_id ON resources(class_id);
CREATE INDEX IF NOT EXISTS idx_resources_faculty_id ON resources(faculty_id);

-- Backend/services/db_service.py
CREATE TABLE IF NOT EXISTS auth_sessions (
  id VARCHAR(128) PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL
);
