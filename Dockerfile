FROM node:20

WORKDIR /app

## Install system dependencies for Python-based RAG/Indexing
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip build-essential && \
    rm -rf /var/lib/apt/lists/*

# Python libs for indexing and RAG
RUN pip3 install --no-cache-dir faiss-cpu sentence-transformers pypdf numpy requests

# Copy package files and install Node dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "dev"]
