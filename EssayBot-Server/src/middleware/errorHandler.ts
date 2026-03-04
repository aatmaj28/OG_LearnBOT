import { Request, Response, NextFunction } from 'express';
import { sendProdError, sendProdNotification } from '../utils/prod-monitor';

/**
 * Global error handling middleware with Teams integration
 */
export const globalErrorHandler = (error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('EssayBot Server Error:', error);
  
  // Determine error severity based on error type and context
  let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM';
  let additionalInfo: Record<string, any> = {};
  
  // Check if it's a database connection error
  if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
    severity = 'CRITICAL';
    additionalInfo = { type: 'Database Connection Error' };
  }
  
  // Check if it's a Python service error
  if (error.message.includes('Python') || error.message.includes('RAG') || error.message.includes('llamaindex')) {
    severity = 'HIGH';
    additionalInfo = { type: 'Python Service Error', component: 'RAG Pipeline' };
  }
  
  // Check if it's an authentication error
  if (error.message.includes('Unauthorized') || error.message.includes('Token')) {
    severity = 'MEDIUM';
    additionalInfo = { type: 'Authentication Error' };
  }
  
  // Check if it's a file upload/processing error
  if (error.message.includes('upload') || error.message.includes('file') || error.message.includes('attachment')) {
    severity = 'MEDIUM';
    additionalInfo = { type: 'File Processing Error' };
  }
  
  // Check if it's a grading system error
  if (error.message.includes('grading') || error.message.includes('rubric') || error.message.includes('score')) {
    severity = 'HIGH';
    additionalInfo = { type: 'Grading System Error' };
  }

  // Send Teams notification for errors (only in production)
  sendProdError(error, {
    endpoint: req.path,
    method: req.method,
    user: (req as any).user?.id || 'Unknown',
    additionalInfo
  });

  // Send appropriate response to client
  if (severity === 'CRITICAL') {
    res.status(503).json({ 
      error: 'Service temporarily unavailable',
      message: 'Critical system error detected. Team has been notified.',
      timestamp: new Date().toISOString()
    });
  } else if (severity === 'HIGH') {
    res.status(500).json({ 
      error: 'Internal server error',
      message: 'High priority error detected. Team has been notified.',
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Async error wrapper for route handlers
 */
export const asyncErrorHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Send manual alert to Teams (only in production)
 */
export const sendTeamsAlert = async (title: string, message: string, severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL' = 'INFO', additionalInfo?: Record<string, any>) => {
  return sendProdNotification(title, message, severity);
};

/**
 * Send RAG pipeline specific alert
 */
export const sendRAGAlert = async (title: string, message: string, severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL' = 'INFO', additionalInfo?: Record<string, any>) => {
  return sendProdNotification(`🤖 RAG: ${title}`, message, severity);
};

/**
 * Send grading system specific alert
 */
export const sendGradingAlert = async (title: string, message: string, severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL' = 'INFO', additionalInfo?: Record<string, any>) => {
  return sendProdNotification(`📊 Grading: ${title}`, message, severity);
};

