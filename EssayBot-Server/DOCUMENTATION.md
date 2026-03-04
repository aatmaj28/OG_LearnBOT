# EssayBot Server Documentation

## Overview

EssayBot Server is a full-stack backend application that provides AI-powered essay grading and analysis capabilities. It consists of two main services: a Node.js/Express.js API server and a Python Flask server for AI/ML processing.

## Tech Stack

### Backend Services

- **Node.js/Express.js** (Port 8001) - Main API server

  - TypeScript for type safety
  - MongoDB with Mongoose ODM
  - JWT authentication
  - File upload handling with Multer
  - MinIO integration for file storage (S3-compatible)
  - CORS enabled for cross-domain requests

- **Python Flask** (Port 6000) - AI/ML Processing Server
  - Flask with CORS support
  - LlamaIndex for RAG (Retrieval-Augmented Generation)
  - LangChain for AI workflows
  - PyTorch for machine learning
  - FAISS for vector similarity search
  - PDF processing with PyMuPDF and PyPDF2

### Key Dependencies

#### Node.js Dependencies

```json
{
  "express": "^4.21.2",
  "mongoose": "^8.12.1",
  "jsonwebtoken": "^9.0.2",
  "multer": "^1.4.5-lts.1",
  "@aws-sdk/client-s3": "^3.774.0",
  "bcryptjs": "^3.0.2",
  "cors": "^2.8.5"
}
```

#### Python Dependencies

```
llama-index>=0.12.0
langchain
transformers
sentence-transformers
torch (CUDA 12.8)
PyMuPDF==1.23.26
Flask
flask_cors
```

## Project Structure

```
EssayBot-Server/
├── src/
│   ├── config/
│   │   └── db.ts                 # MongoDB connection
│   ├── controllers/               # Express.js route handlers
│   │   ├── assignments/          # Assignment management
│   │   ├── attachments/          # File upload handling
│   │   ├── auth/                 # Authentication
│   │   ├── courses/              # Course management
│   │   ├── grading/              # Essay grading
│   │   ├── reports/              # Analytics
│   │   └── users/                # User management
│   ├── middleware/               # Express middleware
│   │   ├── authenticateToken.ts
│   │   └── requireApiAuth.ts
│   ├── models/                   # MongoDB schemas
│   │   ├── Assignment.ts
│   │   ├── Attachment.ts
│   │   ├── Course.ts
│   │   ├── GradingHistory.ts
│   │   └── GradingStats.ts
│   ├── python/                   # Flask AI/ML server
│   │   ├── app.py               # Flask application
│   │   ├── agents.py            # AI agents
│   │   ├── llamaindex_rag/      # RAG implementation
│   │   ├── routes/              # Flask blueprints
│   │   └── requirements.txt     # Python dependencies
│   ├── routes/                   # Express.js routes
│   ├── scripts/                  # Database migrations
│   ├── types/                    # TypeScript type definitions
│   ├── utils/                    # Utility functions
│   └── index.ts                  # Express.js entry point
├── deploy.sh                     # Production deployment script
├── nginx.conf                    # Nginx configuration
└── package.json                  # Node.js dependencies
```

## Environment Configuration

### Development Setup

Create `.env.local` file for development:

```env
NODE_ENV=development
PORT=8001
MONGO_URI=mongodb://localhost:27017/dash_portal
JWT_SECRET=your_jwt_secret
MINIO_ENDPOINT=http://localhost:9000
MINIO_ACCESS_KEY=your_minio_access_key
MINIO_SECRET_KEY=your_minio_secret_key
MINIO_BUCKET=essaybotbucket
```

### Production Environment

The production server uses environment variables configured in `/opt/Essaybot-server/.env`

## Local Development

### Prerequisites

- Node.js 18+ and npm
- Python 3.8+ and pip
- MongoDB running locally
- MinIO server running locally (for file uploads)

### Setup Instructions

1. **Clone and Install Dependencies**

```bash
git clone <repository-url>
cd EssayBot-Server
npm install
```

2. **Setup Python Environment**

```bash
cd src/python
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
deactivate
```

3. **Configure Environment**

```bash
cp .env.example .env.local
# Edit .env.local with your configuration
```

4. **Start Development Servers**

```bash
# Terminal 1: Start Express.js server
npm run dev

# Terminal 2: Start Flask server
cd src/python
source venv/bin/activate
python app.py
```

### Development Scripts

```bash
npm run dev          # Start Express.js with nodemon
npm run migrate      # Run database migrations
```

## Production Deployment

### Server Information

- **Location**: `/opt/Essaybot-server`
- **Deploy User**: `deploy`
- **Services**: PM2 managed processes

### Deployment Process

1. **Access Server**

```bash
ssh user@server
sudo -u deploy /opt/Essaybot-server/deploy.sh
```

2. **Manual Deployment Steps**

```bash
cd /opt/Essaybot-server
git fetch --all
git checkout main
git pull
npm install
cd src/python
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ../..
```

### Service Management

#### Start Services

```bash
# Express.js server (Port 8001)
PORT=8001 pm2 start "npx ts-node src/index.ts" --name essaybot-express

# Flask server (Port 6000)
FLASK_PORT=6000 pm2 start src/python/app.py --name essaybot-flask --interpreter src/python/venv/bin/python
```

#### Monitor Services

```bash
# View all services
pm2 status

# View logs
sudo -u deploy pm2 logs essaybot-express
sudo -u deploy pm2 logs essaybot-flask

# View error logs
sudo -u deploy pm2 logs essaybot-express --err --lines 200
sudo -u deploy pm2 logs essaybot-flask --err --lines 200

# Restart services
sudo -u deploy pm2 restart essaybot-express
sudo -u deploy pm2 restart essaybot-flask
```

### Nginx Configuration

- **Domain**: `api.essaybot.dashlab.studio`
- **SSL**: Let's Encrypt certificates
- **Proxy**: Routes `/api/*` to Express.js and AI routes to Flask

## API Endpoints

### Express.js API (Port 8001)

- **Base URL**: `https://api.essaybot.dashlab.studio/api`
- **Health Check**: `GET /health`

#### Main Endpoints

- `/auth/*` - Authentication routes
- `/courses/*` - Course management
- `/assignments/*` - Assignment management
- `/attachments/*` - File upload handling
- `/grading/*` - Essay grading
- `/users/*` - User management
- `/reports/*` - Analytics

### Flask AI API (Port 6000)

- **Base URL**: `https://api.essaybot.dashlab.studio`
- **Health Check**: `GET /flask-health`

#### AI/ML Endpoints

- `/generate_prompt` - Generate AI prompts
- `/grade_bulk_essays` - Bulk essay grading
- `/grade_single_essay` - Single essay grading
- `/generate_rubric` - Generate grading rubrics
- `/index` - Document indexing
- `/analyze_grading` - Grading performance analysis

## Database Schema

### MongoDB Collections

- **users** - User accounts and profiles
- **courses** - Course information
- **assignments** - Essay assignments
- **attachments** - File metadata
- **grading_history** - Grading records
- **grading_stats** - Grading statistics

## File Storage

### MinIO Integration

- File uploads stored in MinIO buckets (S3-compatible)
- Supports PDF, DOCX, and other document formats
- Automatic file processing and indexing
- Uses AWS SDK for S3-compatible operations

## Security Features

### Authentication

- JWT-based authentication
- Cross-domain cookie support
- Session management

### CORS Configuration

- Configured for multiple client domains
- Credentials enabled for cross-domain requests
- Production and development environments supported

## Monitoring and Logging

### Health Checks

- Express.js: `GET /health`
- Flask: `GET /flask-health`

### Log Locations

- Nginx: `/var/log/nginx/api_access.log`, `/var/log/nginx/api_error.log`
- PM2: Managed through PM2 logs command

## Troubleshooting

### Common Issues

1. **Service Not Starting**

```bash
# Check PM2 status
pm2 status

# View detailed logs
pm2 logs essaybot-express --err --lines 50
```

2. **Database Connection Issues**

```bash
# Check MongoDB status
sudo systemctl status mongod

# Test connection
mongo --host localhost --port 27017
```

3. **Python Environment Issues**

```bash
# Recreate virtual environment
cd src/python
rm -rf venv
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

4. **Nginx Configuration**

```bash
# Test nginx config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

## Development Guidelines

### Code Structure

- TypeScript for type safety
- Modular controller structure
- Middleware for authentication
- Separate concerns between Express.js and Flask

### Best Practices

- Use environment variables for configuration
- Implement proper error handling
- Follow RESTful API conventions
- Maintain consistent logging

### Testing

- Manual testing through API endpoints
- Health check endpoints for monitoring
- Log analysis for debugging

## Contact Information

For technical issues or questions about the backend:

- Check PM2 logs for service issues
- Review nginx logs for proxy issues
- Contact backend team for deployment questions
