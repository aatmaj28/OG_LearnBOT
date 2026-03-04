import os
import requests
from datetime import datetime
from typing import Optional, Any, Union

class ProdMonitor:
    """
    Production monitoring utility for Python services
    Only sends Teams notifications when in production environment
    """
    
    def __init__(self):
        self.webhook_url = os.getenv('TEAMS_WEBHOOK_URL', '')
        # Check both NODE_ENV and FLASK_ENV for production
        self.is_production = (os.getenv('NODE_ENV') == 'production' or 
                             os.getenv('FLASK_ENV') == 'production' or
                             os.getenv('ENVIRONMENT') == 'production')
        
        # Debug logging
        print(f"🔍 ProdMonitor initialized:")
        print(f"   - NODE_ENV: {os.getenv('NODE_ENV', 'not set')}")
        print(f"   - FLASK_ENV: {os.getenv('FLASK_ENV', 'not set')}")
        print(f"   - ENVIRONMENT: {os.getenv('ENVIRONMENT', 'not set')}")
        print(f"   - Is Production: {self.is_production}")
        print(f"   - Webhook URL: {'set' if self.webhook_url else 'not set'}")
    
    def send_error(self, error: Union[Exception, str], context: Optional[Any] = None) -> bool:
        """Send error notification (only in production)"""
        if not self.is_production:
            return False
            
        if not self.webhook_url:
            return False
            
        try:
            error_message = str(error) if isinstance(error, Exception) else error
            
            # Send Adaptive Card for production monitoring
            card = {
                "type": "AdaptiveCard",
                "version": "1.0",
                "body": [
                    {
                        "type": "TextBlock",
                        "text": "🚨 Production Error Alert",
                        "weight": "Bolder",
                        "size": "Large"
                    },
                    {
                        "type": "TextBlock",
                        "text": f"Error: {error_message}",
                        "wrap": True,
                        "spacing": "Medium"
                    },
                    {
                        "type": "TextBlock",
                        "text": "Service: EssayBot Python Service",
                        "wrap": True,
                        "spacing": "Small"
                    },
                    {
                        "type": "TextBlock",
                        "text": "Environment: PRODUCTION",
                        "wrap": True,
                        "spacing": "Small"
                    },
                    {
                        "type": "TextBlock",
                        "text": f"Time: {datetime.now().isoformat()}",
                        "wrap": True,
                        "spacing": "Small"
                    }
                ]
            }
            
            # Send Adaptive Card to Power Automate
            response = requests.post(self.webhook_url, json=card, timeout=5)
            
            if response.status_code in [200, 202]:
                print("✅ Production error notification sent to Teams")
                return True
            else:
                print(f"❌ Failed to send Teams notification: {response.status_code}")
                return False
                
        except Exception as err:
            print(f"❌ Error sending Teams notification: {err}")
            return False
    
    def send_notification(self, title: str, message: str, severity: str = "INFO") -> bool:
        """Send system notification (only in production)"""
        if not self.is_production:
            return False
            
        if not self.webhook_url:
            return False
            
        try:
            # Send Adaptive Card for system notifications
            card = {
                "type": "AdaptiveCard",
                "version": "1.0",
                "body": [
                    {
                        "type": "TextBlock",
                        "text": title,
                        "weight": "Bolder",
                        "size": "Large"
                    },
                    {
                        "type": "TextBlock",
                        "text": message,
                        "wrap": True,
                        "spacing": "Medium"
                    },
                    {
                        "type": "FactSet",
                        "facts": [
                            {"name": "Service", "value": "EssayBot Python Service"},
                            {"name": "Environment", "value": "PRODUCTION"},
                            {"name": "Severity", "value": severity},
                            {"name": "Time", "value": datetime.now().isoformat()}
                        ]
                    }
                ]
            }
            
            # Send Adaptive Card to Power Automate
            response = requests.post(self.webhook_url, json=card, timeout=5)
            
            return response.status_code in [200, 202]
            
        except Exception as err:
            print(f"❌ Error sending Teams notification: {err}")
            return False
    
    def is_active(self) -> bool:
        """Check if monitor is active"""
        return self.is_production and bool(self.webhook_url)

# Create singleton instance
prod_monitor = ProdMonitor()

# Convenience functions
def send_prod_error(error: Union[Exception, str], context: Optional[Any] = None) -> bool:
    return prod_monitor.send_error(error, context)

def send_prod_notification(title: str, message: str, severity: str = "INFO") -> bool:
    return prod_monitor.send_notification(title, message, severity)
