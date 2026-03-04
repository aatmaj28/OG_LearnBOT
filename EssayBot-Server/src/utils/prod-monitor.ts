import axios from 'axios';

/**
 * Production monitoring utility for Teams notifications
 * Only sends notifications when in production environment
 */
class ProdMonitor {
  private webhookUrl: string;
  private isProduction: boolean;

  constructor() {
    this.webhookUrl = process.env.TEAMS_WEBHOOK_URL || '';
    this.isProduction = process.env.NODE_ENV === 'production';
  }

  /**
   * Send error notification (only in production)
   */
  async sendError(error: Error | string, context?: any): Promise<boolean> {
    if (!this.isProduction) {
      return false;
    }

    if (!this.webhookUrl) {
      return false;
    }

    try {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Send Adaptive Card for production monitoring
      const card = {
        type: "AdaptiveCard",
        version: "1.0",
        body: [
          {
            type: "TextBlock",
            text: "🚨 Production Error Alert",
            weight: "Bolder",
            size: "Large"
          },
          {
            type: "TextBlock",
            text: `Error: ${errorMessage}`,
            wrap: true,
            spacing: "Medium"
          },
          {
            type: "TextBlock",
            text: "Service: EssayBot Server",
            wrap: true,
            spacing: "Small"
          },
          {
            type: "TextBlock",
            text: "Environment: PRODUCTION",
            wrap: true,
            spacing: "Small"
          },
          {
            type: "TextBlock",
            text: `Time: ${new Date().toISOString()}`,
            wrap: true,
            spacing: "Small"
          }
        ]
      };

      // Send Adaptive Card to Power Automate
      const response = await axios.post(this.webhookUrl, card, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      if (response.status === 200 || response.status === 202) {
        console.log('✅ Production error notification sent to Teams');
        return true;
      } else {
        console.error('❌ Failed to send Teams notification:', response.status);
        return false;
      }
    } catch (err) {
      console.error('❌ Error sending Teams notification:', err);
      return false;
    }
  }

  /**
   * Send system notification (only in production)
   */
  async sendNotification(title: string, message: string, severity: 'INFO' | 'WARNING' | 'ERROR' = 'INFO'): Promise<boolean> {
    if (!this.isProduction) {
      return false;
    }

    if (!this.webhookUrl) {
      return false;
    }

    try {
      // Send Adaptive Card for system notifications
      const card = {
        type: "AdaptiveCard",
        version: "1.0",
        body: [
          {
            type: "TextBlock",
            text: title,
            weight: "Bolder",
            size: "Large"
          },
          {
            type: "TextBlock",
            text: message,
            wrap: true,
            spacing: "Medium"
          },
          {
            type: "FactSet",
            facts: [
              { name: "Service", value: "EssayBot Server" },
              { name: "Environment", value: "PRODUCTION" },
              { name: "Severity", value: severity },
              { name: "Time", value: new Date().toISOString() }
            ]
          }
        ]
      };

      // Send Adaptive Card to Power Automate
      const response = await axios.post(this.webhookUrl, card, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });

      return response.status === 200 || response.status === 202;
    } catch (err) {
      console.error('❌ Error sending Teams notification:', err);
      return false;
    }
  }

  /**
   * Check if monitor is active
   */
  isActive(): boolean {
    return this.isProduction && !!this.webhookUrl;
  }
}

// Export singleton instance
export const prodMonitor = new ProdMonitor();

// Export convenience functions
export const sendProdError = (error: Error | string, context?: any) => 
  prodMonitor.sendError(error, context);

export const sendProdNotification = (title: string, message: string, severity?: any) => 
  prodMonitor.sendNotification(title, message, severity);
