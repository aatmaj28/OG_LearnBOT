#!/bin/bash

# Setup script for LearnBOT vector store
# This script helps set up the required vector_store_ra directory

echo "🚀 LearnBOT Vector Store Setup"
echo "=============================="

# Check if vector_store_ra directory exists
if [ -d "vector_store_ra" ]; then
    echo "✅ vector_store_ra directory already exists"
else
    echo "📁 Creating vector_store_ra directory..."
    mkdir vector_store_ra
fi

# Check for required files
required_files=("config.json" "faiss_index.bin" "metadata.json" "metadata.pkl")
missing_files=()

for file in "${required_files[@]}"; do
    if [ -f "vector_store_ra/$file" ]; then
        echo "✅ Found: $file"
    else
        echo "❌ Missing: $file"
        missing_files+=("$file")
    fi
done

if [ ${#missing_files[@]} -eq 0 ]; then
    echo ""
    echo "🎉 All required files are present!"
    echo "✅ Your RAG system should work correctly."
else
    echo ""
    echo "⚠️  Missing files detected:"
    for file in "${missing_files[@]}"; do
        echo "   - $file"
    done
    echo ""
    echo "📋 To complete setup:"
    echo "1. Contact the project maintainer for the missing files"
    echo "2. Or create your own vector store using the VectorStoreManager"
    echo "3. Place the files in the vector_store_ra/ directory"
    echo ""
    echo "💡 The application will fall back to Ollama if RAG is not available."
fi

echo ""
echo "🔧 Next steps:"
echo "1. Run 'npm install' to install dependencies"
echo "2. Copy .env.example to .env.local and configure your database"
echo "3. Run 'npm run dev' to start the development server"
