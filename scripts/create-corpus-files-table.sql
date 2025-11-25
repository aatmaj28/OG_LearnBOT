-- Create corpus_files table if it doesn't exist
CREATE TABLE IF NOT EXISTS corpus_files (
  id SERIAL PRIMARY KEY,
  class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  material_type VARCHAR(50) NOT NULL DEFAULT 'class_material' CHECK (material_type IN ('class_material', 'syllabus')),
  file_size BIGINT,
  chunk_count INTEGER DEFAULT 0,
  is_indexed BOOLEAN DEFAULT false,
  indexed_at TIMESTAMP,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id, file_name, material_type)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_corpus_files_class_id ON corpus_files(class_id);
CREATE INDEX IF NOT EXISTS idx_corpus_files_material_type ON corpus_files(material_type);
CREATE INDEX IF NOT EXISTS idx_corpus_files_class_material ON corpus_files(class_id, material_type);

