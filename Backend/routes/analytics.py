"""
Analytics endpoints
Migrated from app/api/analytics/*/route.ts
"""
from flask import Blueprint, request, jsonify
from services import db_service
from datetime import datetime, timedelta

bp = Blueprint("analytics", __name__)

def calculate_simple_sentiment(messages: list) -> float:
    """Simple keyword-based sentiment analysis"""
    if not messages:
        return 0.0
    
    positive_words = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'helpful', 'thanks', 'thank you', 'yes', 'correct', 'right', 'understand', 'clear', 'perfect', 'awesome', 'brilliant', 'love', 'appreciate']
    negative_words = ['bad', 'wrong', 'confused', 'difficult', 'hard', 'no', 'incorrect', 'unclear', 'problem', 'error', 'stuck', 'help', "don't understand", 'terrible', 'awful', 'hate', 'frustrated', 'annoying']
    
    positive_count = 0
    negative_count = 0
    total_count = 0
    
    for message in messages:
        content = str(message.get('content', '')).lower()
        positive_matches = sum(1 for word in positive_words if word in content)
        negative_matches = sum(1 for word in negative_words if word in content)
        
        positive_count += positive_matches
        negative_count += negative_matches
        total_count += 1
    
    if total_count == 0:
        return 0.0
    
    sentiment = (positive_count - negative_count) / total_count
    return max(-1.0, min(1.0, sentiment))

@bp.route("/class-activity", methods=["GET"])
def class_activity():
    """Class activity endpoint - migrated from app/api/analytics/class-activity/route.ts"""
    try:
        class_id = request.args.get("classId")
        if not class_id:
            return jsonify({"error": "Class ID required"}), 400
        
        cls = db_service.get_class_by_id(class_id)
        if not cls:
            return jsonify({"error": "Class not found"}), 404
        
        activities = []
        for student_id in cls.get('studentIds', []):
            student = db_service.get_user_by_id_internal(student_id)
            activity = db_service.get_student_activity(student_id, class_id, skip_llm_analysis=False)
            conversations = db_service.get_rag_conversations_by_user(student_id, class_id)
            
            sessions = [{
                'id': conv['id'],
                'userId': conv['userId'],
                'title': conv['title'],
                'createdAt': conv['createdAt'].isoformat() if hasattr(conv['createdAt'], 'isoformat') else str(conv['createdAt']),
                'updatedAt': conv['updatedAt'].isoformat() if hasattr(conv['updatedAt'], 'isoformat') else str(conv['updatedAt']),
                'status': conv['status'],
                'messageCount': len(conv.get('messageHistory', []))
            } for conv in conversations]
            
            activities.append({
                'student': student,
                **activity,
                'sessions': sessions
            })
        
        return jsonify({"activities": activities})
    except Exception as error:
        print(f"[ANALYTICS] CLASS ACTIVITY ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/class-summary", methods=["GET"])
def class_summary():
    """Class summary endpoint - migrated from app/api/analytics/class-summary/route.ts"""
    try:
        class_id = request.args.get("classId")
        if not class_id:
            return jsonify({"error": "Class ID required"}), 400
        
        cls = db_service.get_class_by_id(class_id)
        if not cls:
            return jsonify({"error": "Class not found"}), 404
        
        student_activities = []
        for student_id in cls.get('studentIds', []):
            student = db_service.get_user_by_id_internal(student_id)
            activity = db_service.get_student_activity(student_id, class_id, skip_llm_analysis=False)
            conversations = db_service.get_rag_conversations_by_user(student_id, class_id)
            
            student_activities.append({
                'student': student,
                'activity': activity,
                'conversations': conversations
            })
        
        total_students = len(student_activities)
        total_chat_time = sum(s['activity'].get('totalChatTime', 0) for s in student_activities)
        total_sessions = sum(s['activity'].get('totalSessions', 0) for s in student_activities)
        average_sentiment = sum(s['activity'].get('averageSentiment', 0) for s in student_activities) / total_students if total_students > 0 else 0
        
        # Sentiment distribution
        sentiment_counts = {'Positive': 0, 'Neutral': 0, 'Negative': 0}
        for s in student_activities:
            sentiment = s['activity'].get('averageSentiment', 0)
            if sentiment > 0.3:
                sentiment_counts['Positive'] += 1
            elif sentiment < -0.3:
                sentiment_counts['Negative'] += 1
            else:
                sentiment_counts['Neutral'] += 1
        
        sentiment_distribution = [{'sentiment': k, 'count': v} for k, v in sentiment_counts.items()]
        
        # Topic distribution
        topic_counts = {}
        for s in student_activities:
            for topic in s['activity'].get('topTopics', []):
                topic_name = topic.get('topic', '') if isinstance(topic, dict) else str(topic)
                topic_counts[topic_name] = topic_counts.get(topic_name, 0) + topic.get('count', 1) if isinstance(topic, dict) else topic_counts.get(topic_name, 0) + 1
        
        topic_distribution = sorted(
            [{'topic': k, 'count': v} for k, v in topic_counts.items()],
            key=lambda x: x['count'],
            reverse=True
        )[:5]
        
        # Activity over time: last 7 days, sessions and minutes per day for all students in class
        def _parse_date(ts):
            if ts is None:
                return None
            if hasattr(ts, 'date'):
                return ts.date()
            try:
                s = str(ts).replace('Z', '+00:00')
                dt = datetime.fromisoformat(s)
                return dt.date()
            except Exception:
                return None

        activity_over_time = []
        today = datetime.now().date()
        for i in range(6, -1, -1):
            day_date = today - timedelta(days=i)
            day_sessions = 0
            day_minutes = 0.0
            for s in student_activities:
                for conv in s.get('conversations', []):
                    messages = conv.get('messageHistory', [])
                    if not messages:
                        continue
                    last_ts = messages[-1].get('timestamp') or conv.get('updatedAt')
                    conv_date = _parse_date(last_ts)
                    if conv_date is None or conv_date != day_date:
                        continue
                    day_sessions += 1
                    if len(messages) >= 2:
                        user_msgs = [m for m in messages if m.get('role') == 'user']
                        asst_msgs = [m for m in messages if m.get('role') == 'assistant']
                        if user_msgs and asst_msgs:
                            try:
                                t0 = datetime.fromisoformat(str(user_msgs[0].get('timestamp', '')).replace('Z', '+00:00'))
                                t1 = datetime.fromisoformat(str(asst_msgs[-1].get('timestamp', '')).replace('Z', '+00:00'))
                                mins = (t1 - t0).total_seconds() / 60.0
                                day_minutes += max(0, mins)
                            except Exception:
                                day_minutes += 5
                        else:
                            day_minutes += 5
                    else:
                        day_minutes += 5
            activity_over_time.append({
                'date': day_date.strftime('%b %d'),
                'sessions': day_sessions,
                'minutes': round(day_minutes, 1)
            })
        
        # Student engagement
        student_engagement = sorted([
            {
                'name': s['student'].get('name', 'Unknown'),
                'sessions': s['activity'].get('totalSessions', 0),
                'minutes': s['activity'].get('totalChatTime', 0)
            }
            for s in student_activities
        ], key=lambda x: x['sessions'], reverse=True)
        
        return jsonify({
            "analytics": {
                "totalStudents": total_students,
                "totalChatTime": total_chat_time,
                "totalSessions": total_sessions,
                "averageSentiment": average_sentiment,
                "sentimentDistribution": sentiment_distribution,
                "topicDistribution": topic_distribution,
                "activityOverTime": activity_over_time,
                "studentEngagement": student_engagement
            }
        })
    except Exception as error:
        print(f"[ANALYTICS] CLASS SUMMARY ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500

@bp.route("/sentiment", methods=["POST"])
def sentiment():
    """Sentiment endpoint - migrated from app/api/analytics/sentiment/route.ts"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body is required"}), 400
        
        user_id = data.get("userId")
        class_id = data.get("classId")
        
        if not user_id:
            return jsonify({"error": "User ID required"}), 400
        
        conversations = db_service.get_rag_conversations_by_user(user_id, class_id)
        
        if not conversations:
            return jsonify({"sentiment": 0, "analysis": "No conversations found"})
        
        # Extract all user messages
        all_user_messages = []
        for conversation in conversations:
            messages = conversation.get('messageHistory', [])
            for message in messages:
                if message.get('role') == 'user':
                    all_user_messages.append({
                        'content': message.get('content', ''),
                        'timestamp': message.get('timestamp'),
                        'conversationTitle': conversation.get('title', '')
                    })
        
        if not all_user_messages:
            return jsonify({"sentiment": 0, "analysis": "No user messages found"})
        
        # Use simple sentiment analysis
        sentiment_score = calculate_simple_sentiment(all_user_messages)
        
        return jsonify({
            "sentiment": sentiment_score,
            "analysis": "Sentiment analysis using keyword matching",
            "method": "fallback"
        })
    except Exception as error:
        print(f"[ANALYTICS] SENTIMENT ERROR: {error}")
        return jsonify({"error": "Internal server error"}), 500
