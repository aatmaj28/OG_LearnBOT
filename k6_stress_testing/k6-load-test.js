/**
 * LearnBOT k6 Load Test — Baseline (Step 1)
 *
 * Simulates the full student flow:
 *   Login → List classes → Load conversations → Send chat message
 *
 * Run from your Windows PC:
 *   k6 run scripts/k6-load-test.js
 *
 * Run with HTML report:
 *   k6 run scripts/k6-load-test.js --out json=k6-results.json
 *
 * Ramp profile: 5 → 20 → 40 → 60 → 80 → 100 virtual users over ~8 minutes
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ─── CONFIG ──────────────────────────────────────────────────────────
// Point to your production API (through Nginx/SSL)
const API_BASE = __ENV.API_BASE || 'https://api.learnbot.dashlab.studio';

// Test user credentials — use an existing student account
// Override from CLI:  k6 run -e TEST_EMAIL=student@test.com -e TEST_PASSWORD=pass123 ...
const TEST_EMAIL = __ENV.TEST_EMAIL || 'salunke.aa@northeastern.edu';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'manipaltoneu2003#S';

// A valid class ID that the test user is enrolled in (check your DB)
const TEST_CLASS_ID = __ENV.TEST_CLASS_ID || '2';

// Chat message to send during the test
const TEST_MESSAGE = 'What are the key concepts covered in this class?';

// Preferred model for chat (matches your .env)
const PREFERRED_MODEL = __ENV.PREFERRED_MODEL || 'remote-a6000';

// ─── CUSTOM METRICS ──────────────────────────────────────────────────
const loginDuration = new Trend('login_duration', true);
const classesLoadDuration = new Trend('classes_load_duration', true);
const convosLoadDuration = new Trend('convos_load_duration', true);
const chatSendDuration = new Trend('chat_send_duration', true);
const chatFirstByte = new Trend('chat_first_byte', true);
const errorRate = new Rate('errors');
const chatErrors = new Counter('chat_errors');

// ─── RAMP STAGES ─────────────────────────────────────────────────────
// This progressively increases load to find the breaking point.
export const options = {
    stages: [
        { duration: '30s', target: 10 },   // Warm-up: 10 users
        { duration: '1m', target: 20 },    // Ramp to 20
        { duration: '1m', target: 40 },    // Ramp to 40
        { duration: '1m', target: 60 },    // Ramp to 60
        { duration: '1m', target: 80 },    // Ramp to 80
        { duration: '1m', target: 100 },   // Ramp to 100 (max stress)
        { duration: '1m30s', target: 100 }, // Hold at 100
        { duration: '1m', target: 0 },     // Ramp down
    ],
    thresholds: {
        // Fail if >20% of requests error
        errors: ['rate<0.2'],
        // Fail if login takes >5s at p95
        login_duration: ['p(95)<5000'],
        // Fail if chat first-byte takes >60s at p95
        chat_first_byte: ['p(95)<60000'],
    },
};

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────

function getHeaders(sessionId) {
    const headers = { 'Content-Type': 'application/json' };
    if (sessionId) {
        headers['X-Session-Id'] = sessionId;
    }
    return headers;
}

// ─── MAIN TEST ───────────────────────────────────────────────────────

export default function () {
    let sessionId = null;
    let userId = null;
    let classId = TEST_CLASS_ID;
    let conversationId = null;

    // ── 1. LOGIN ──
    group('1. Login', function () {
        const loginRes = http.post(
            `${API_BASE}/api/auth/login`,
            JSON.stringify({
                email: TEST_EMAIL,
                password: TEST_PASSWORD,
                role: 'student',
            }),
            { headers: getHeaders(), tags: { endpoint: 'login' } }
        );

        loginDuration.add(loginRes.timings.duration);

        const loginOk = check(loginRes, {
            'login status 200': (r) => r.status === 200,
            'login has sessionId': (r) => {
                try {
                    return JSON.parse(r.body).sessionId !== undefined;
                } catch {
                    return false;
                }
            },
        });

        if (!loginOk) {
            errorRate.add(1);
            console.error(`LOGIN FAILED: status=${loginRes.status} body=${loginRes.body}`);
            return; // Skip rest of iteration
        }

        errorRate.add(0);
        const loginData = JSON.parse(loginRes.body);
        sessionId = loginData.sessionId;
        userId = loginData.user.id;
    });

    if (!sessionId) return; // Login failed, skip

    sleep(1); // Simulate user looking at dashboard

    // ── 2. LIST CLASSES ──
    group('2. List Classes', function () {
        const classesRes = http.get(
            `${API_BASE}/api/classes?studentId=${userId}`,
            { headers: getHeaders(sessionId), tags: { endpoint: 'list_classes' } }
        );

        classesLoadDuration.add(classesRes.timings.duration);

        const classesOk = check(classesRes, {
            'classes status 200': (r) => r.status === 200,
        });

        if (!classesOk) {
            errorRate.add(1);
        } else {
            errorRate.add(0);
            // Try to get a real class ID from the response
            try {
                const data = JSON.parse(classesRes.body);
                if (data.classes && data.classes.length > 0) {
                    classId = data.classes[0].id;
                }
            } catch {
                // Use the hardcoded TEST_CLASS_ID
            }
        }
    });

    sleep(0.5);

    // ── 3. LIST CONVERSATIONS ──
    group('3. List Conversations', function () {
        const convosRes = http.get(
            `${API_BASE}/api/chat/conversations?userId=${userId}&classId=${classId}`,
            { headers: getHeaders(sessionId), tags: { endpoint: 'list_conversations' } }
        );

        convosLoadDuration.add(convosRes.timings.duration);

        const convosOk = check(convosRes, {
            'conversations status 200': (r) => r.status === 200,
        });

        if (!convosOk) {
            errorRate.add(1);
        } else {
            errorRate.add(0);
        }
    });

    sleep(0.5);

    // ── 4. CREATE CONVERSATION ──
    group('4. Create Conversation', function () {
        const createRes = http.post(
            `${API_BASE}/api/chat/conversations`,
            JSON.stringify({
                userId: userId,
                title: `k6 load test - VU ${__VU} iter ${__ITER}`,
                classId: classId,
                chatType: 'class_material',
            }),
            { headers: getHeaders(sessionId), tags: { endpoint: 'create_conversation' } }
        );

        const createOk = check(createRes, {
            'create conversation status 200': (r) => r.status === 200,
        });

        if (!createOk) {
            errorRate.add(1);
            console.error(`CREATE CONVO FAILED: status=${createRes.status} body=${createRes.body}`);
        } else {
            errorRate.add(0);
            try {
                const data = JSON.parse(createRes.body);
                conversationId = data.conversation.id;
            } catch {
                // Fallback
            }
        }
    });

    if (!conversationId) return; // Can't chat without a conversation

    sleep(0.5);

    // ── 5. SEND CHAT MESSAGE (THE BIG ONE) ──
    group('5. Send Chat Message (ai-response)', function () {
        const chatPayload = JSON.stringify({
            userId: userId,
            sessionId: conversationId,
            message: TEST_MESSAGE,
            classId: classId,
            chatType: 'class_material',
            preferredModel: PREFERRED_MODEL,
            stream: false, // Use non-streaming for cleaner k6 measurement
            deepThinking: false,
        });

        const chatRes = http.post(
            `${API_BASE}/api/chat/ai-response`,
            chatPayload,
            {
                headers: getHeaders(sessionId),
                tags: { endpoint: 'chat_ai_response' },
                timeout: '180s', // LLM can take a while
            }
        );

        chatSendDuration.add(chatRes.timings.duration);
        chatFirstByte.add(chatRes.timings.waiting); // Time to first byte (server processing)

        const chatOk = check(chatRes, {
            'chat status 200': (r) => r.status === 200,
            'chat has response': (r) => {
                try {
                    const body = JSON.parse(r.body);
                    return body.response && body.response.length > 0;
                } catch {
                    return false;
                }
            },
        });

        if (!chatOk) {
            errorRate.add(1);
            chatErrors.add(1);
            console.error(
                `CHAT FAILED: VU=${__VU} status=${chatRes.status} duration=${chatRes.timings.duration}ms body=${(chatRes.body || '').substring(0, 200)}`
            );
        } else {
            errorRate.add(0);
            try {
                const data = JSON.parse(chatRes.body);
                console.log(
                    `CHAT OK: VU=${__VU} model=${data.modelUsed} time=${data.timeTaken}s duration=${chatRes.timings.duration}ms`
                );
            } catch {
                // Fine
            }
        }
    });

    sleep(1);

    // ── 6. CLEANUP — Delete test conversation ──
    group('6. Cleanup', function () {
        if (conversationId) {
            http.del(
                `${API_BASE}/api/chat/conversations/${conversationId}`,
                null,
                { headers: getHeaders(sessionId), tags: { endpoint: 'delete_conversation' } }
            );
        }
    });

    sleep(1); // Think time between iterations
}

// ─── SUMMARY ─────────────────────────────────────────────────────────
export function handleSummary(data) {
    const summary = {
        timestamp: new Date().toISOString(),
        test: 'LearnBOT Baseline Load Test',
        metrics: {},
    };

    // Extract key metrics
    const metricsToReport = [
        'login_duration',
        'classes_load_duration',
        'convos_load_duration',
        'chat_send_duration',
        'chat_first_byte',
        'errors',
        'chat_errors',
        'http_req_duration',
        'http_reqs',
    ];

    for (const name of metricsToReport) {
        if (data.metrics[name]) {
            summary.metrics[name] = data.metrics[name].values;
        }
    }

    // Print human-readable summary to console
    console.log('\n' + '='.repeat(60));
    console.log('  LearnBOT Load Test Results');
    console.log('='.repeat(60));

    if (summary.metrics.login_duration) {
        const m = summary.metrics.login_duration;
        console.log(`  Login:         avg=${m.avg?.toFixed(0)}ms  p95=${m['p(95)']?.toFixed(0)}ms`);
    }
    if (summary.metrics.chat_send_duration) {
        const m = summary.metrics.chat_send_duration;
        console.log(`  Chat (total):  avg=${m.avg?.toFixed(0)}ms  p95=${m['p(95)']?.toFixed(0)}ms  max=${m.max?.toFixed(0)}ms`);
    }
    if (summary.metrics.chat_first_byte) {
        const m = summary.metrics.chat_first_byte;
        console.log(`  Chat (TTFB):   avg=${m.avg?.toFixed(0)}ms  p95=${m['p(95)']?.toFixed(0)}ms  max=${m.max?.toFixed(0)}ms`);
    }
    if (summary.metrics.errors) {
        console.log(`  Error Rate:    ${(summary.metrics.errors.rate * 100).toFixed(1)}%`);
    }
    if (summary.metrics.chat_errors) {
        console.log(`  Chat Failures: ${summary.metrics.chat_errors.count}`);
    }
    console.log('='.repeat(60));

    // Save JSON report for later comparison (Step 8)
    return {
        'k6-stress-100vu-report.json': JSON.stringify(summary, null, 2),
        stdout: textSummary(data, { indent: '  ', enableColors: true }),
    };
}

// Text summary helper (built into k6)
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.3/index.js';
