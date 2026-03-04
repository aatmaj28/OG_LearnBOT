import axios from 'axios';

interface CriticalAlertData {
  title: string;
  message: string;
  service: string;
  error?: string;
  timestamp: string;
}

class CriticalMonitor {
  private webhookUrl: string;
  private isProduction: boolean;

  constructor() {
    this.webhookUrl = process.env.TEAMS_WEBHOOK_URL || '';
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  /**
   * Send critical alert only in production
   */
  async sendCriticalAlert(data: CriticalAlertData): Promise<boolean> {
    // Only send alerts in production
    if (!this.isProduction) {
      console.log(`[DEV] Critical alert suppressed: ${data.title}`);
      return false;
    }

    // Validate webhook URL
    if (!this.webhookUrl) {
      console.error('❌ TEAMS_WEBHOOK_URL not configured');
      return false;
    }

    try {
      const adaptiveCard = this.formatCriticalAlert(data);
      
      const response = await axios.post(this.webhookUrl, adaptiveCard, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.status === 200 || response.status === 202) {
        console.log(`✅ Critical alert sent: ${data.title}`);
        return true;
      } else {
        console.error(`❌ Failed to send critical alert: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error('❌ Error sending critical alert:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Format critical alert as Adaptive Card for Power Automate
   */
  private formatCriticalAlert(data: CriticalAlertData) {
    return {
      type: "AdaptiveCard",
      version: "1.0",
      body: [
        {
          type: "TextBlock",
          text: `🚨 ${data.title}`,
          weight: "Bolder",
          size: "Large",
          color: "Attention"
        },
        {
          type: "TextBlock",
          text: data.message,
          wrap: true,
          spacing: "Medium"
        },
        {
          type: "FactSet",
          facts: [
            {
              title: "Service:",
              value: data.service
            },
            {
              title: "Time:",
              value: data.timestamp
            }
          ]
        }
      ]
    };
  }

  /**
   * Convenience methods for specific critical failures
   */
  async serviceCrash(service: string, error: string): Promise<boolean> {
    return this.sendCriticalAlert({
      title: "Service Crash Detected",
      message: `A critical service has crashed and may be down.`,
      service,
      error,
      timestamp: new Date().toISOString()
    });
  }

  async databaseFailure(error: string): Promise<boolean> {
    return this.sendCriticalAlert({
      title: "Database Connection Failed",
      message: `Database connection has failed. This may affect all database operations.`,
      service: "Database",
      error,
      timestamp: new Date().toISOString()
    });
  }

  async ragPipelineFailure(error: string): Promise<boolean> {
    return this.sendCriticalAlert({
      title: "RAG Pipeline Critical Error",
      message: `The RAG pipeline has encountered a critical error that prevents it from functioning.`,
      service: "RAG Pipeline",
      error,
      timestamp: new Date().toISOString()
    });
  }

  async authenticationFailure(error: string): Promise<boolean> {
    return this.sendCriticalAlert({
      title: "Authentication System Failure",
      message: `The authentication system has encountered a critical error.`,
      service: "Authentication",
      error,
      timestamp: new Date().toISOString()
    });
  }

  async fileProcessingFailure(error: string): Promise<boolean> {
    return this.sendCriticalAlert({
      title: "File Processing Critical Error",
      message: `File upload or processing has encountered a critical error.`,
      service: "File Processing",
      error,
      timestamp: new Date().toISOString()
    });
  }
}

// Export singleton instance
export const criticalMonitor = new CriticalMonitor();

// Export convenience functions
export const sendCriticalAlert = (data: CriticalAlertData) => criticalMonitor.sendCriticalAlert(data);
export const alertServiceCrash = (service: string, error: string) => criticalMonitor.serviceCrash(service, error);
export const alertDatabaseFailure = (error: string) => criticalMonitor.databaseFailure(error);
export const alertRagPipelineFailure = (error: string) => criticalMonitor.ragPipelineFailure(error);
export const alertAuthenticationFailure = (error: string) => criticalMonitor.authenticationFailure(error);
export const alertFileProcessingFailure = (error: string) => criticalMonitor.fileProcessingFailure(error);
