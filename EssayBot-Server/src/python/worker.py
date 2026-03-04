import json
import time
import logging
import os
import pika
import redis
import requests
import random
import socket
from typing import Dict, Any, Optional

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class EssayBotWorker:
    def __init__(self):
        self.rabbitmq_url = "amqp://essaybot:essaybot123@localhost:5672"
        self.redis_url = "redis://localhost:6379"
        self.python_service_url = os.environ.get('PYTHON_SERVICE_URL', 'http://localhost:6001')
        # Express API URL for triggering GradingStats linking
        self.express_api_url = os.environ.get('EXPRESS_API_URL', 'http://localhost:4000')
        logger.info(f"🔗 Worker initialized with EXPRESS_API_URL: {self.express_api_url}")
        
        # Get environment-specific queue suffix (for scalability - separate UAT and PROD queues)
        namespace = os.environ.get('NAMESPACE', 'uat')
        self.queue_suffix = '' if namespace == 'prod' else '-uat'
        
        self.connection = None
        self.channel = None
        self.redis_client = None
        
    def wait_for_rabbitmq(self, max_wait=60):
        """Wait for RabbitMQ to be ready by checking if port is open and connection works"""
        logger.info("🔍 Checking if RabbitMQ is ready...")
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            try:
                # First check if port is open
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(2)
                result = sock.connect_ex(('localhost', 5672))
                sock.close()
                
                if result == 0:
                    # Port is open, try a test connection
                    try:
                        test_conn = pika.BlockingConnection(
                            pika.URLParameters(self.rabbitmq_url)
                        )
                        test_channel = test_conn.channel()
                        test_conn.close()
                        logger.info("✅ RabbitMQ is ready")
                        return True
                    except Exception as e:
                        logger.debug(f"RabbitMQ port open but connection failed: {e}")
                        time.sleep(2)
                else:
                    time.sleep(2)
            except Exception as e:
                logger.debug(f"Error checking RabbitMQ: {e}")
                time.sleep(2)
        
        logger.warning(f"⚠️ RabbitMQ not ready after {max_wait} seconds, proceeding anyway...")
        return False
        
    def connect(self):
        """Connect to RabbitMQ and Redis with retry logic and health check"""
        # Wait for RabbitMQ to be ready first
        self.wait_for_rabbitmq()
        
        # Add small random delay to stagger worker connections (0-5 seconds)
        stagger_delay = random.uniform(0, 5)
        logger.info(f"⏳ Staggering connection by {stagger_delay:.2f} seconds to avoid overwhelming RabbitMQ...")
        time.sleep(stagger_delay)
        
        max_retries = 10  # Increased from 3 to handle RabbitMQ restarts
        retry_count = 0
        
        while retry_count < max_retries:
            try:
                # Connect to RabbitMQ with connection timeout
                connection_params = pika.URLParameters(self.rabbitmq_url)
                connection_params.socket_timeout = 10
                connection_params.connection_attempts = 3
                connection_params.retry_delay = 2
                
                self.connection = pika.BlockingConnection(connection_params)
                self.channel = self.connection.channel()
                
                # Auto-setup queues and exchanges (no separate script needed)
                # This will create the queues if they don't exist
                self.setup_queues()
                
                # Connect to Redis
                self.redis_client = redis.Redis.from_url(self.redis_url, decode_responses=True)
                
                logger.info("✅ Connected to RabbitMQ and Redis")
                return
                
            except (pika.exceptions.StreamLostError, pika.exceptions.IncompatibleProtocolError, 
                    ConnectionResetError, OSError) as e:
                # These are connection-level errors, likely RabbitMQ restarting
                retry_count += 1
                logger.warning(f"⚠️ Connection error (attempt {retry_count}/{max_retries}): {e}")
                logger.info("   This usually means RabbitMQ is restarting or not ready yet...")
                
                if retry_count >= max_retries:
                    logger.error("❌ Max connection retries reached")
                    raise
                
                # Wait before retrying with exponential backoff
                wait_time = min(2 ** retry_count, 30)  # Exponential backoff, max 30 seconds
                logger.info(f"⏳ Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)
                
                # Re-check if RabbitMQ is ready before next attempt
                if retry_count % 3 == 0:  # Every 3rd retry
                    self.wait_for_rabbitmq(max_wait=10)
                    
            except Exception as e:
                retry_count += 1
                logger.error(f"❌ Failed to connect (attempt {retry_count}/{max_retries}): {e}")
                
                if retry_count >= max_retries:
                    logger.error("❌ Max connection retries reached")
                    raise
                
                # Wait before retrying
                wait_time = min(2 ** retry_count, 30)  # Exponential backoff, max 30 seconds
                logger.info(f"⏳ Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)
    
    def setup_queues(self):
        """Auto-create queues and exchanges"""
        try:
            namespace = os.environ.get('NAMESPACE', 'uat')
            logger.info(f"📋 Setting up queues for environment: {namespace} (suffix: {self.queue_suffix or 'none'})...")
            
            # Create exchanges (shared across environments)
            self.channel.exchange_declare(exchange='essay.grading', exchange_type='direct', durable=True)
            self.channel.exchange_declare(exchange='essay.notifications', exchange_type='fanout', durable=True)
            
            # Create environment-specific queues
            grading_queue = f'essay.grading.queue{self.queue_suffix}'
            dead_queue = f'essay.grading.dead{self.queue_suffix}'
            notifications_queue = f'essay.notifications{self.queue_suffix}'
            
            self.channel.queue_declare(queue=grading_queue, durable=True, arguments={
                'x-message-ttl': 3600000,  # 1 hour TTL
                'x-max-length': 1000       # Max 1000 messages
            })
            self.channel.queue_declare(queue=dead_queue, durable=True)
            self.channel.queue_declare(queue=notifications_queue, durable=True)
            
            # Bind queues to exchanges
            self.channel.queue_bind(exchange='essay.grading', queue=grading_queue, routing_key='grading')
            self.channel.queue_bind(exchange='essay.grading', queue=dead_queue, routing_key='dead')
            self.channel.queue_bind(exchange='essay.notifications', queue=notifications_queue, routing_key='')
            
            logger.info(f"✅ Queues created: {grading_queue}, {dead_queue}, {notifications_queue}")
            
        except Exception as e:
            logger.error(f"❌ Failed to setup queues: {e}")
            raise
    
    def update_task_status(self, task_id: str, status: str, data: Optional[Dict] = None):
        """Update task status in Redis"""
        try:
            key = f"task:{task_id}"
            existing = self.redis_client.get(key)
            
            if existing:
                task_data = json.loads(existing)
                task_data['status'] = status
                if data:
                    task_data.update(data)
                if status in ['completed', 'failed']:
                    task_data['completedAt'] = int(time.time() * 1000)
                
                self.redis_client.setex(key, 3600, json.dumps(task_data))  # 1 hour TTL
                logger.info(f"🔄 Updated task {task_id} status to {status}")
            
        except Exception as e:
            logger.error(f"❌ Failed to update task status: {e}")
    
    def publish_notification(self, task_id: str, status: str, data: Optional[Dict] = None):
        """Publish notification to WebSocket queue"""
        try:
            notification = {
                'taskId': task_id,
                'status': status,
                'data': data,
                'timestamp': int(time.time() * 1000)
            }
            
            self.channel.basic_publish(
                exchange='essay.notifications',
                routing_key='',
                body=json.dumps(notification),
                properties=pika.BasicProperties(delivery_mode=2)  # Persistent
            )
            
            logger.info(f"📢 Published notification for task {task_id}: {status}")
            
        except Exception as e:
            logger.error(f"❌ Failed to publish notification: {e}")
    
    def process_bulk_grading_task(self, task_data: Dict[str, Any], task_id: str) -> Dict[str, Any]:
        """Process bulk grading task with progress updates and batching"""
        try:
            logger.info(f"📊 Starting bulk grading task {task_id}")
            
            # Update initial progress
            self.update_task_status(task_id, 'processing', {
                'progress': 5,
                'message': 'Starting bulk grading with batching strategy...',
                'totalEssays': 0,
                'completedEssays': 0,
                'failedEssays': 0,
                'currentBatch': 0,
                'totalBatches': 0
            })
            self.publish_notification(task_id, 'processing', {
                'progress': 5,
                'message': 'Starting bulk grading with batching strategy...'
            })
            
            # Add task_id to the request data for progress updates
            task_data_with_id = {
                **task_data,
                'taskId': task_id
            }
            
            # Start progress simulation in a separate thread to keep UI engaged
            import threading
            import time
            
            progress_thread = None
            stop_progress = threading.Event()
            
            def simulate_progress():
                progress = 10
                while not stop_progress.is_set() and progress < 90:
                    try:
                        self.update_task_status(task_id, 'processing', {
                            'progress': progress,
                            'message': f'Grading essays... ({progress}% complete)',
                            'currentBatch': min(progress // 8, 11),  # Estimate batch number
                            'totalBatches': 12
                        })
                        self.publish_notification(task_id, 'processing', {
                            'progress': progress,
                            'message': f'Grading essays... ({progress}% complete)'
                        })
                        progress += 5
                        time.sleep(15)  # Update every 15 seconds
                    except Exception as e:
                        logger.warning(f"Failed to send progress update: {e}")
                        break
            
            # Start progress simulation
            progress_thread = threading.Thread(target=simulate_progress)
            progress_thread.daemon = True
            progress_thread.start()
            
            # Call the existing Flask bulk grading endpoint with extended timeout
            response = requests.post(
                f"{self.python_service_url}/grade_bulk_essays",
                json=task_data_with_id,
                timeout=600  # 10 minute timeout for bulk operations with batching
            )
            response.raise_for_status()
            result = response.json()
            
            # Stop progress simulation
            stop_progress.set()
            if progress_thread:
                progress_thread.join(timeout=2)  # Wait up to 2 seconds for thread to finish
            
            # Update final progress with error handling
            try:
                self.update_task_status(task_id, 'completed', {
                    'progress': 100,
                    'message': 'Bulk grading completed successfully',
                    'result': result
                })
            except Exception as e:
                logger.warning(f"Failed to update task status in Redis: {e}")
            
            try:
                self.publish_notification(task_id, 'completed', {
                    'progress': 100,
                    'message': 'Bulk grading completed successfully',
                    'result': result
                })
            except Exception as e:
                logger.warning(f"Failed to publish notification: {e}")
            
            # Trigger GradingStats linking by calling Express endpoint
            # This ensures the GradingHistory gets linked to GradingStats even if frontend doesn't call it
            # Use updateBulkGradingProgress which doesn't require auth and has the linking logic
            try:
                logger.info(f"🔗 Triggering GradingStats linking for task {task_id}")
                linking_response = requests.post(
                    f"{self.express_api_url}/api/internal/grading/progress-update",
                    json={
                        'taskId': task_id,
                        'status': 'completed',
                        'progress': 100,
                        'message': 'Bulk grading completed successfully',
                        'result': result,
                        'timestamp': int(time.time() * 1000)
                    },
                    timeout=10
                )
                if linking_response.status_code == 200:
                    logger.info(f"✅ Successfully triggered linking for task {task_id}")
                else:
                    logger.warning(f"⚠️ Linking endpoint returned {linking_response.status_code} for task {task_id}: {linking_response.text}")
            except Exception as e:
                # Don't fail the grading if linking trigger fails - it can be done later
                logger.warning(f"⚠️ Failed to trigger linking for task {task_id} (non-fatal): {e}")
            
            logger.info(f"✅ Bulk grading completed for task {task_id}")
            logger.info(f"✅ Completed bulk grading task {task_id}")
            return result
            
        except requests.exceptions.Timeout:
            # Stop progress simulation
            stop_progress.set()
            if progress_thread:
                progress_thread.join(timeout=2)
                
            error_msg = "Bulk grading timed out after 10 minutes"
            logger.error(f"❌ {error_msg} for task {task_id}")
            
            try:
                self.update_task_status(task_id, 'failed', {
                    'error': error_msg,
                    'progress': 0
                })
            except Exception as e:
                logger.warning(f"Failed to update task status in Redis: {e}")
            
            try:
                self.publish_notification(task_id, 'failed', {
                    'error': error_msg,
                    'progress': 0
                })
            except Exception as e:
                logger.warning(f"Failed to publish notification: {e}")
            
            raise Exception(error_msg)
            
        except Exception as e:
            # Stop progress simulation
            stop_progress.set()
            if progress_thread:
                progress_thread.join(timeout=2)
                
            error_msg = f"Failed to process bulk grading task: {str(e)}"
            logger.error(f"❌ {error_msg} for task {task_id}")
            
            try:
                self.update_task_status(task_id, 'failed', {
                    'error': error_msg,
                    'progress': 0
                })
            except Exception as e:
                logger.warning(f"Failed to update task status in Redis: {e}")
            
            try:
                self.publish_notification(task_id, 'failed', {
                    'error': error_msg,
                    'progress': 0
                })
            except Exception as e:
                logger.warning(f"Failed to publish notification: {e}")
            
            # Don't raise the exception - let the task be acknowledged as completed
            # The grading was successful, only the notification failed

    def call_python_service(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Call existing Python Flask service for single essay"""
        max_attempts = 6  # ~1m total with backoff: 1,2,4,8,8,8s
        backoff = [1, 2, 4, 8, 8, 8]
        last_err = None
        for attempt in range(1, max_attempts + 1):
            try:
                response = requests.post(
                    f"{self.python_service_url}/grade_single_essay",
                    json=task_data,
                    timeout=120
                )
                response.raise_for_status()
                return response.json()
            except Exception as e:
                last_err = e
                # Retry on connection issues/timeouts; fail fast on 4xx
                status = getattr(e, 'response', None).status_code if hasattr(e, 'response') and e.response is not None else None
                if status is not None and 400 <= status < 500:
                    logger.error(f"❌ Flask returned {status}, not retrying: {e}")
                    break
                wait = backoff[min(attempt - 1, len(backoff) - 1)]
                logger.warning(f"⚠️ Flask unavailable (attempt {attempt}/{max_attempts}): {e}. Retrying in {wait}s...")
                time.sleep(wait)
        logger.error(f"❌ Failed to call Python service after retries: {last_err}")
        raise last_err

    def call_generate_rubric(self, task_data: Dict[str, Any]) -> Dict[str, Any]:
        """Call Flask rubric generation endpoint with required shape"""
        payload = {
            'courseId': task_data.get('courseId'),
            'question': task_data.get('question'),
            'username': task_data.get('username') or task_data.get('user') or task_data.get('professor') or task_data.get('professor_username'),
            'title': task_data.get('title') or task_data.get('assignmentId'),
            'model': task_data.get('model'),
            'guidelines': task_data.get('guidelines', ''),
        }
        max_attempts = 6
        backoff = [1, 2, 4, 8, 8, 8]
        last_err = None
        for attempt in range(1, max_attempts + 1):
            try:
                response = requests.post(
                    f"{self.python_service_url}/generate_rubric",
                    json=payload,
                    timeout=120
                )
                response.raise_for_status()
                return response.json()
            except Exception as e:
                last_err = e
                status = getattr(e, 'response', None).status_code if hasattr(e, 'response') and e.response is not None else None
                if status is not None and 400 <= status < 500:
                    logger.error(f"❌ Flask returned {status} for generate_rubric, not retrying: {e}")
                    break
                wait = backoff[min(attempt - 1, len(backoff) - 1)]
                logger.warning(f"⚠️ Flask generate_rubric unavailable (attempt {attempt}/{max_attempts}): {e}. Retrying in {wait}s...")
                time.sleep(wait)
        logger.error(f"❌ Failed to call generate_rubric after retries: {last_err}")
        raise last_err
    
    def process_essay_task(self, ch, method, properties, body):
        """Process essay grading task"""
        task_id = None
        
        try:
            # Parse task data
            task = json.loads(body)
            task_id = task['taskId']
            task_type = task['type']
            data = task['data']
            user_id = task['userId']
            
            logger.info(f"🔄 Processing task {task_id} of type {task_type}")
            
            # Update status to processing
            self.update_task_status(task_id, 'processing', {'progress': 0})
            self.publish_notification(task_id, 'processing', {'progress': 0})
            
            # Process based on task type
            if task_type == 'grade-single-essay':
                # Ensure Flask required fields
                if 'username' not in data or not data.get('username'):
                    data['username'] = user_id
                # Normalize rubric payload so Flask never 500s on shape issues
                try:
                    if isinstance(data.get('currentRubric'), dict):
                        cr = dict(data['currentRubric'])
                        # Choose criteria list
                        if isinstance(cr.get('mainCriteria'), list):
                            criteria_list = cr['mainCriteria']
                        elif isinstance(cr.get('criteria'), list):
                            criteria_list = cr['criteria']
                            cr['mainCriteria'] = criteria_list
                        else:
                            criteria_list = []
                        def _norm_levels_to_list(sl):
                            """Match sync path: agents.py expects a LIST of expectations per bracket.
                            Convert dict or invalid input to [full, partial, minimal]."""
                            if isinstance(sl, list):
                                # Ensure at least 3 entries, pad with defaults
                                defaults = [
                                    'Excellent performance in this criterion.',
                                    'Satisfactory performance in this criterion.',
                                    'Minimal performance in this criterion.'
                                ]
                                out = list(sl)[:3]
                                while len(out) < 3:
                                    out.append(defaults[len(out)])
                                return out
                            if isinstance(sl, dict):
                                return [
                                    sl.get('full') or 'Excellent performance in this criterion.',
                                    sl.get('partial') or 'Satisfactory performance in this criterion.',
                                    sl.get('minimal') or 'Minimal performance in this criterion.'
                                ]
                            return [
                                'Excellent performance in this criterion.',
                                'Satisfactory performance in this criterion.',
                                'Minimal performance in this criterion.'
                            ]
                        normalized_criteria = []
                        for c in criteria_list:
                            if isinstance(c, dict):
                                c = dict(c)
                                c['scoringLevels'] = _norm_levels_to_list(c.get('scoringLevels'))
                                normalized_criteria.append(c)
                        if normalized_criteria:
                            cr['mainCriteria'] = normalized_criteria
                        # Sanitize gradingBrackets if present
                        if isinstance(cr.get('gradingBrackets'), list):
                            gb = []
                            for b in cr['gradingBrackets']:
                                if isinstance(b, dict):
                                    label = str(b.get('label') or '').strip() or 'Bracket'
                                    rng = str(b.get('range') or '').strip() or '0-100%'
                                    gb.append({'label': label, 'range': rng})
                            cr['gradingBrackets'] = gb
                        # Debug summary for rubric after normalization
                        try:
                            crit_names = [c.get('name') for c in normalized_criteria if isinstance(c, dict)]
                            logger.info(f"🧪 Normalized rubric criteria: {crit_names}")
                            if isinstance(cr.get('gradingBrackets'), list) and len(cr['gradingBrackets']) > 0:
                                logger.info(f"🧪 First bracket sample (post-normalize): {cr['gradingBrackets'][0]}")
                        except Exception:
                            pass
                        data['currentRubric'] = cr
                    # Also normalize criteria array if present
                    if isinstance(data.get('criteria'), list):
                        fixed = []
                        for c in data['criteria']:
                            if isinstance(c, dict):
                                c = dict(c)
                                c['scoringLevels'] = _norm_levels_to_list(c.get('scoringLevels'))
                                fixed.append(c)
                        if fixed:
                            data['criteria'] = fixed
                            try:
                                logger.info(f"🧪 Normalized criteria (weights) count: {len(fixed)}")
                            except Exception:
                                pass
                except Exception as norm_err:
                    logger.warning(f"Failed to normalize grading payload: {norm_err}")
                result = self.call_python_service(data)
                
                # Update status to completed
                self.update_task_status(task_id, 'completed', {
                    'result': result,
                    'progress': 100
                })
                self.publish_notification(task_id, 'completed', {
                    'result': result,
                    'progress': 100
                })
                
                logger.info(f"✅ Completed single essay task {task_id}")
                
            elif task_type == 'grade-bulk-essays':
                result = self.process_bulk_grading_task(data, task_id)
                # process_bulk_grading_task already handles status updates internally
                logger.info(f"✅ Completed bulk grading task {task_id}")
                
            elif task_type == 'generate-rubric':
                # Ensure required fields are present for Flask
                if 'username' not in data or not data.get('username'):
                    data['username'] = user_id
                if 'title' not in data or not data.get('title'):
                    data['title'] = data.get('assignmentId')

                result = self.call_generate_rubric(data)

                # Normalize rubric shape to match sync expectations
                try:
                    rubric = dict(result) if isinstance(result, dict) else {}

                    # Normalize mainCriteria vs criteria
                    if 'mainCriteria' in rubric and isinstance(rubric['mainCriteria'], list):
                        criteria_list = rubric['mainCriteria']
                    elif 'criteria' in rubric and isinstance(rubric['criteria'], list):
                        criteria_list = rubric['criteria']
                        rubric['mainCriteria'] = criteria_list
                    else:
                        criteria_list = []

                    def _norm_levels(sl):
                        if isinstance(sl, dict):
                            return {
                                'full': sl.get('full') or 'Excellent performance in this criterion.',
                                'partial': sl.get('partial') or 'Satisfactory performance in this criterion.',
                                'minimal': sl.get('minimal') or 'Minimal performance in this criterion.'
                            }
                        if isinstance(sl, list):
                            return {
                                'full': (sl[0] if len(sl) > 0 and sl[0] else 'Excellent performance in this criterion.'),
                                'partial': (sl[1] if len(sl) > 1 and sl[1] else 'Satisfactory performance in this criterion.'),
                                'minimal': (sl[2] if len(sl) > 2 and sl[2] else 'Minimal performance in this criterion.')
                            }
                        return {
                            'full': 'Excellent performance in this criterion.',
                            'partial': 'Satisfactory performance in this criterion.',
                            'minimal': 'Minimal performance in this criterion.'
                        }

                    normalized_criteria = []
                    for c in criteria_list:
                        if isinstance(c, dict):
                            c = dict(c)
                            c['scoringLevels'] = _norm_levels(c.get('scoringLevels'))
                            normalized_criteria.append(c)
                    rubric['mainCriteria'] = normalized_criteria

                    # Normalize gradingBrackets shape if present
                    if 'gradingBrackets' in rubric and isinstance(rubric['gradingBrackets'], list):
                        gb = []
                        for b in rubric['gradingBrackets']:
                            if isinstance(b, dict):
                                label = str(b.get('label') or '').strip() or 'Bracket'
                                rng = str(b.get('range') or '').strip() or '0-100%'
                                gb.append({'label': label, 'range': rng})
                        rubric['gradingBrackets'] = gb

                    result = rubric
                except Exception as norm_err:
                    logger.warning(f"Failed to normalize rubric result: {norm_err}")

                self.update_task_status(task_id, 'completed', {
                    'result': result,
                    'progress': 100
                })
                self.publish_notification(task_id, 'completed', {
                    'result': result,
                    'progress': 100
                })

                logger.info(f"✅ Completed generate rubric task {task_id}")

            else:
                raise ValueError(f"Unknown task type: {task_type}")
            
            # Acknowledge task completion with error handling
            try:
                ch.basic_ack(delivery_tag=method.delivery_tag)
            except Exception as e:
                logger.warning(f"Failed to acknowledge task completion: {e}")
            
        except Exception as e:
            logger.error(f"❌ Failed to process task {task_id}: {e}")
            
            if task_id:
                # Update status to failed with error handling
                try:
                    self.update_task_status(task_id, 'failed', {
                        'error': str(e),
                        'progress': 0
                    })
                except Exception as update_error:
                    logger.warning(f"Failed to update task status in Redis: {update_error}")
                
                try:
                    self.publish_notification(task_id, 'failed', {
                        'error': str(e),
                        'progress': 0
                    })
                except Exception as notify_error:
                    logger.warning(f"Failed to publish notification: {notify_error}")
            
            # Reject task (don't requeue to avoid infinite loops) with error handling
            try:
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            except Exception as e:
                logger.warning(f"Failed to reject task: {e}")
    
    def start_consuming(self):
        """Start consuming tasks from queue with connection recovery"""
        max_retries = 10  # Increased from 5 to handle RabbitMQ restarts
        retry_count = 0
        
        while retry_count < max_retries:
            try:
                # Reconnect if needed - check both connection and channel
                needs_reconnect = (
                    not self.connection or 
                    self.connection.is_closed or 
                    not self.channel or 
                    self.channel.is_closed
                )
                
                if needs_reconnect:
                    logger.info("🔄 Reconnecting to RabbitMQ...")
                    # Clean up old connection if it exists
                    try:
                        if self.channel and not self.channel.is_closed:
                            self.channel.close()
                    except:
                        pass
                    try:
                        if self.connection and not self.connection.is_closed:
                            self.connection.close()
                    except:
                        pass
                    self.connection = None
                    self.channel = None
                    self.connect()
                
                # Set up consumer
                self.channel.basic_qos(prefetch_count=1)  # Process one task at a time
                self.channel.basic_consume(
                    queue=f'essay.grading.queue{self.queue_suffix}',
                    on_message_callback=self.process_essay_task
                )
                
                logger.info("🚀 Worker started, waiting for tasks...")
                logger.info("Press Ctrl+C to stop")
                
                # Start consuming
                self.channel.start_consuming()
                
                # If we get here, consuming stopped normally
                break
                
            except KeyboardInterrupt:
                logger.info("🛑 Worker stopped by user")
                self.stop_consuming()
                break
            except (pika.exceptions.StreamLostError, pika.exceptions.IncompatibleProtocolError,
                    ConnectionResetError, OSError, pika.exceptions.ConnectionClosed) as e:
                # Connection-level errors - RabbitMQ likely restarted
                retry_count += 1
                logger.warning(f"⚠️ Connection lost (attempt {retry_count}/{max_retries}): {e}")
                logger.info("   RabbitMQ may have restarted, will reconnect...")
                
                # Reset connection state
                self.connection = None
                self.channel = None
                
                if retry_count >= max_retries:
                    logger.error("❌ Max retries reached, worker will exit")
                    raise
                
                # Wait before retrying with exponential backoff
                wait_time = min(2 ** retry_count, 30)  # Exponential backoff, max 30 seconds
                logger.info(f"⏳ Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)
                
            except Exception as e:
                retry_count += 1
                logger.error(f"❌ Error in worker (attempt {retry_count}/{max_retries}): {e}")
                
                if retry_count >= max_retries:
                    logger.error("❌ Max retries reached, worker will exit")
                    raise
                
                # Wait before retrying
                wait_time = min(2 ** retry_count, 30)  # Exponential backoff, max 30 seconds
                logger.info(f"⏳ Waiting {wait_time} seconds before retry...")
                time.sleep(wait_time)
    
    def stop_consuming(self):
        """Stop consuming and close connections"""
        try:
            if self.channel:
                self.channel.stop_consuming()
            if self.connection:
                self.connection.close()
            logger.info("🔌 Disconnected from RabbitMQ")
        except Exception as e:
            logger.error(f"❌ Error stopping worker: {e}")

def main():
    """Main function"""
    worker = EssayBotWorker()
    
    try:
        worker.connect()
        worker.start_consuming()
    except Exception as e:
        logger.error(f"❌ Worker failed: {e}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())
