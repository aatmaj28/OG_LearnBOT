import os
import json
import logging
from datetime import datetime
from typing import Optional, Dict, Any
import requests

logger = logging.getLogger(__name__)

class CriticalMonitor:
    def __init__(self):
        self.webhook_url = os.getenv('TEAMS_WEBHOOK_URL', '')
        self.is_production = os.getenv('FLASK_ENV') == 'production'
    
    def send_critical_alert(self, title: str, message: str, service: str, error: Optional[str] = None) -> bool:
        """
        Send critical alert only in production
        """
        # Only send alerts in production
        if not self.is_production:
            logger.info(f"[DEV] Critical alert suppressed: {title}")
            return False
        
        # Validate webhook URL
        if not self.webhook_url:
            logger.error("❌ TEAMS_WEBHOOK_URL not configured")
            return False
        
        try:
            adaptive_card = self._format_critical_alert(title, message, service, error)
            
            response = requests.post(
                self.webhook_url,
                json=adaptive_card,
                headers={'Content-Type': 'application/json'},
                timeout=10
            )
            
            if response.status_code in [200, 202]:
                logger.info(f"✅ Critical alert sent: {title}")
                return True
            else:
                logger.error(f"❌ Failed to send critical alert: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"❌ Error sending critical alert: {str(e)}")
            return False
    
    def _format_critical_alert(self, title: str, message: str, service: str, error: Optional[str] = None) -> Dict[str, Any]:
        """
        Format critical alert as Adaptive Card for Power Automate
        """
        facts = [
            {"title": "Service:", "value": service},
            {"title": "Time:", "value": datetime.now().isoformat()}
        ]
        
        if error:
            facts.append({"title": "Error:", "value": error[:200] + "..." if len(error) > 200 else error})
        
        return {
            "type": "AdaptiveCard",
            "version": "1.0",
            "body": [
                {
                    "type": "TextBlock",
                    "text": f"🚨 {title}",
                    "weight": "Bolder",
                    "size": "Large",
                    "color": "Attention"
                },
                {
                    "type": "TextBlock",
                    "text": message,
                    "wrap": True,
                    "spacing": "Medium"
                },
                {
                    "type": "FactSet",
                    "facts": facts
                }
            ]
        }
    
    # Convenience methods for specific critical failures
    def service_crash(self, service: str, error: str) -> bool:
        return self.send_critical_alert(
            "Service Crash Detected",
            "A critical service has crashed and may be down.",
            service,
            error
        )
    
    def rag_pipeline_failure(self, error: str) -> bool:
        return self.send_critical_alert(
            "RAG Pipeline Critical Error",
            "The RAG pipeline has encountered a critical error that prevents it from functioning.",
            "RAG Pipeline",
            error
        )
    
    def embedding_model_failure(self, error: str) -> bool:
        return self.send_critical_alert(
            "Embedding Model Critical Error",
            "The embedding model has failed to load or initialize properly.",
            "Embedding Model",
            error
        )
    
    def file_processing_failure(self, error: str) -> bool:
        return self.send_critical_alert(
            "File Processing Critical Error",
            "File upload or processing has encountered a critical error.",
            "File Processing",
            error
        )
    
    def gpu_memory_failure(self, error: str) -> bool:
        return self.send_critical_alert(
            "GPU Memory Critical Error",
            "GPU memory allocation or cleanup has failed critically.",
            "GPU Memory",
            error
        )

# Export singleton instance
critical_monitor = CriticalMonitor()

# Export convenience functions
def send_critical_alert(title: str, message: str, service: str, error: Optional[str] = None) -> bool:
    return critical_monitor.send_critical_alert(title, message, service, error)

def alert_service_crash(service: str, error: str) -> bool:
    return critical_monitor.service_crash(service, error)

def alert_rag_pipeline_failure(error: str) -> bool:
    return critical_monitor.rag_pipeline_failure(error)

def alert_embedding_model_failure(error: str) -> bool:
    return critical_monitor.embedding_model_failure(error)

def alert_file_processing_failure(error: str) -> bool:
    return critical_monitor.file_processing_failure(error)

def alert_gpu_memory_failure(error: str) -> bool:
    return critical_monitor.gpu_memory_failure(error)

