@echo off
echo 🚀 LearnBOT Vector Store Setup
echo ==============================

REM Check if vector_store_ra directory exists
if exist "vector_store_ra" (
    echo ✅ vector_store_ra directory already exists
) else (
    echo 📁 Creating vector_store_ra directory...
    mkdir vector_store_ra
)

REM Check for required files
set missing_count=0

if exist "vector_store_ra\config.json" (
    echo ✅ Found: config.json
) else (
    echo ❌ Missing: config.json
    set /a missing_count+=1
)

if exist "vector_store_ra\faiss_index.bin" (
    echo ✅ Found: faiss_index.bin
) else (
    echo ❌ Missing: faiss_index.bin
    set /a missing_count+=1
)

if exist "vector_store_ra\metadata.json" (
    echo ✅ Found: metadata.json
) else (
    echo ❌ Missing: metadata.json
    set /a missing_count+=1
)

if exist "vector_store_ra\metadata.pkl" (
    echo ✅ Found: metadata.pkl
) else (
    echo ❌ Missing: metadata.pkl
    set /a missing_count+=1
)

if %missing_count%==0 (
    echo.
    echo 🎉 All required files are present!
    echo ✅ Your RAG system should work correctly.
) else (
    echo.
    echo ⚠️  Missing files detected
    echo.
    echo 📋 To complete setup:
    echo 1. Contact the project maintainer for the missing files
    echo 2. Or create your own vector store using the VectorStoreManager
    echo 3. Place the files in the vector_store_ra\ directory
    echo.
    echo 💡 The application will fall back to Ollama if RAG is not available.
)

echo.
echo 🔧 Next steps:
echo 1. Run 'npm install' to install dependencies
echo 2. Copy .env.example to .env.local and configure your database
echo 3. Run 'npm run dev' to start the development server
pause
