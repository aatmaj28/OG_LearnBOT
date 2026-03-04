/**
 * LearnBOT k6 Post-Infrastructure Load Test
 *
 * Tests the NEW RabbitMQ async architecture:
 *   Login → List classes → Load conversations → Send chat (queue) → Poll status
 *
 * The key difference from the old test:
 *   - OLD: POST /ai-response blocks for 20-60s until AI finishes
 *   - NEW: POST /ai-response returns {taskId} in <200ms, then we poll /task-status/<taskId>
 *
 * Run:
 *   k6 run k6_stress_testing/k6-post-infra-test.js --env SCENARIO=baseline
 *   k6 run k6_stress_testing/k6-post-infra-test.js --env SCENARIO=stress
 *   k6 run k6_stress_testing/k6-post-infra-test.js --env SCENARIO=breaking
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ─── CONFIG ──────────────────────────────────────────────────────────
const API_BASE = __ENV.API_BASE || 'https://api.learnbot.dashlab.studio';
const TEST_EMAIL = __ENV.TEST_EMAIL || 'salunke.aa@northeastern.edu';
const TEST_PASSWORD = __ENV.TEST_PASSWORD || 'manipaltoneu2003#S';
const TEST_CLASS_ID = __ENV.TEST_CLASS_ID || '2';
const TEST_MESSAGE = 'What are the key concepts covered in this class?';
const PREFERRED_MODEL = __ENV.PREFERRED_MODEL || 'remote-a6000';

// Task polling config
const POLL_INTERVAL_MS = 2000;  // Poll every 2 seconds
const POLL_TIMEOUT_MS = 180000; // Give up after 3 minutes

// ─── SCENARIO SELECTION ──────────────────────────────────────────────
const SCENARIO = (__ENV.SCENARIO || 'baseline').toLowerCase();

const scenarios = {
    baseline: {
        stages: [
            { duration: '30s', target: 10 },
            { duration: '1m', target: 20 },
            { duration: '1m', target: 30 },
            { duration: '1m30s', target: 30 },  // Hold at 30
            { duration: '1m', target: 0 },
        ],
        reportFile: 'k6-post-infra-30vu-report.json',
    },
    stress: {
        stages: [
            { duration: '30s', target: 10 },
            { duration: '1m', target: 25 },
            { duration: '1m', target: 50 },
            { duration: '1m30s', target: 50 },  // Hold at 50
            { duration: '1m', target: 0 },
        ],
        reportFile: 'k6-post-infra-50vu-report.json',
    },
    midstress: {
        stages: [
            { duration: '30s', target: 10 },
            { duration: '1m', target: 25 },
            { duration: '1m', target: 50 },
            { duration: '1m', target: 75 },
            { duration: '1m30s', target: 75 },  // Hold at 75
            { duration: '1m', target: 0 },
        ],
        reportFile: 'k6-post-infra-75vu-report.json',
    },
    breaking: {
        stages: [
            { duration: '30s', target: 10 },
            { duration: '1m', target: 30 },
            { duration: '1m', target: 60 },
            { duration: '1m', target: 100 },
            { duration: '1m30s', target: 100 },  // Hold at 100
            { duration: '1m', target: 0 },
        ],
        reportFile: 'k6-post-infra-100vu-report.json',
    },
};

const selectedScenario = scenarios[SCENARIO] || scenarios.baseline;

// ─── CUSTOM METRICS ──────────────────────────────────────────────────
const loginDuration = new Trend('login_duration', true);
const classesLoadDuration = new Trend('classes_load_duration', true);
const convosLoadDuration = new Trend('convos_load_duration', true);
const queueAcceptTime = new Trend('queue_accept_time', true);     // Time to get taskId back
const taskTotalTime = new Trend('task_total_time', true);          // Full end-to-end (queue + processing)
const chatFirstByte = new Trend('chat_first_byte', true);          // For comparison with old test
const errorRate = new Rate('errors');
const chatErrors = new Counter('chat_errors');
const queuedTasks = new Counter('queued_tasks');
const completedTasks = new Counter('completed_tasks');
const timedOutTasks = new Counter('timed_out_tasks');

// ─── OPTIONS ─────────────────────────────────────────────────────────
export const options = {
    stages: selectedScenario.stages,
    thresholds: {
        errors: ['rate<0.2'],
        login_duration: ['p(95)<5000'],
        queue_accept_time: ['p(95)<1000'],  // Queue acceptance should be <1s at p95
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
            return;
        }

        errorRate.add(0);
        const loginData = JSON.parse(loginRes.body);
        sessionId = loginData.sessionId;
        userId = loginData.user.id;
    });

    if (!sessionId) return;

    sleep(1);

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
            try {
                const data = JSON.parse(classesRes.body);
                if (data.classes && data.classes.length > 0) {
                    classId = data.classes[0].id;
                }
            } catch {
                // Use hardcoded TEST_CLASS_ID
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
                title: `k6 post-infra test - VU ${__VU} iter ${__ITER}`,
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

    if (!conversationId) return;

    sleep(0.5);

    // ── 5. SEND CHAT MESSAGE (ASYNC QUEUE MODE) ──
    group('5. Send Chat Message (Queue Mode)', function () {
        const chatPayload = JSON.stringify({
            userId: userId,
            sessionId: conversationId,
            message: TEST_MESSAGE,
            classId: classId,
            chatType: 'class_material',
            preferredModel: PREFERRED_MODEL,
            stream: false,
            deepThinking: false,
        });

        // ── 5a. POST to /ai-response → get taskId ──
        const startTime = Date.now();

        const chatRes = http.post(
            `${API_BASE}/api/chat/ai-response`,
            chatPayload,
            {
                headers: getHeaders(sessionId),
                tags: { endpoint: 'chat_ai_response_queue' },
                timeout: '30s',
            }
        );

        const acceptTime = chatRes.timings.duration;
        queueAcceptTime.add(acceptTime);

        let taskId = null;
        let isQueueMode = false;

        // Check if we got a taskId (queue mode) or a direct response (sync fallback)
        const chatOk = check(chatRes, {
            'chat status 200': (r) => r.status === 200,
        });

        if (!chatOk) {
            errorRate.add(1);
            chatErrors.add(1);
            console.error(
                `CHAT FAILED: VU=${__VU} status=${chatRes.status} duration=${chatRes.timings.duration}ms body=${(chatRes.body || '').substring(0, 200)}`
            );
            return;
        }

        errorRate.add(0);

        try {
            const data = JSON.parse(chatRes.body);
            if (data.taskId) {
                // Queue mode — got a taskId
                taskId = data.taskId;
                isQueueMode = true;
                queuedTasks.add(1);
                console.log(
                    `QUEUED: VU=${__VU} taskId=${taskId} acceptTime=${acceptTime.toFixed(0)}ms`
                );
            } else if (data.response) {
                // Sync fallback — got direct response
                const totalTime = Date.now() - startTime;
                taskTotalTime.add(totalTime);
                chatFirstByte.add(chatRes.timings.waiting);
                completedTasks.add(1);
                console.log(
                    `SYNC OK: VU=${__VU} model=${data.modelUsed} time=${data.timeTaken}s duration=${chatRes.timings.duration}ms`
                );
            }
        } catch {
            chatErrors.add(1);
        }

        // ── 5b. POLL /task-status/<taskId> until completed ──
        if (isQueueMode && taskId) {
            let completed = false;
            const pollStart = Date.now();

            while (!completed && (Date.now() - pollStart) < POLL_TIMEOUT_MS) {
                sleep(POLL_INTERVAL_MS / 1000);  // k6 sleep takes seconds

                const statusRes = http.get(
                    `${API_BASE}/api/chat/task-status/${taskId}`,
                    {
                        headers: getHeaders(sessionId),
                        tags: { endpoint: 'task_status_poll' },
                        timeout: '10s',
                    }
                );

                if (statusRes.status === 200) {
                    try {
                        const statusData = JSON.parse(statusRes.body);
                        const taskStatus = statusData.status;

                        if (taskStatus === 'completed' || taskStatus === 'failed') {
                            completed = true;
                            const totalTime = Date.now() - startTime;
                            taskTotalTime.add(totalTime);
                            chatFirstByte.add(totalTime);  // For backwards compatibility with old report

                            if (taskStatus === 'completed') {
                                completedTasks.add(1);
                                console.log(
                                    `COMPLETED: VU=${__VU} taskId=${taskId} totalTime=${totalTime}ms queueAccept=${acceptTime.toFixed(0)}ms`
                                );
                            } else {
                                chatErrors.add(1);
                                console.error(
                                    `TASK FAILED: VU=${__VU} taskId=${taskId} error=${statusData.error || 'unknown'}`
                                );
                            }
                        }
                    } catch {
                        // Parse error, continue polling
                    }
                }
            }

            if (!completed) {
                timedOutTasks.add(1);
                chatErrors.add(1);
                const totalTime = Date.now() - startTime;
                taskTotalTime.add(totalTime);
                console.error(
                    `TIMEOUT: VU=${__VU} taskId=${taskId} after ${totalTime}ms`
                );
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

    sleep(1);
}

// ─── SUMMARY ─────────────────────────────────────────────────────────
export function handleSummary(data) {
    const summary = {
        timestamp: new Date().toISOString(),
        test: `LearnBOT Post-Infrastructure Load Test (${SCENARIO})`,
        scenario: SCENARIO,
        metrics: {},
    };

    const metricsToReport = [
        'login_duration',
        'classes_load_duration',
        'convos_load_duration',
        'queue_accept_time',
        'task_total_time',
        'chat_first_byte',
        'errors',
        'chat_errors',
        'queued_tasks',
        'completed_tasks',
        'timed_out_tasks',
        'http_req_duration',
        'http_reqs',
    ];

    for (const name of metricsToReport) {
        if (data.metrics[name]) {
            summary.metrics[name] = data.metrics[name].values;
        }
    }

    // Print human-readable summary to console
    console.log('\n' + '='.repeat(70));
    console.log(`  LearnBOT Post-Infrastructure Load Test — ${SCENARIO.toUpperCase()}`);
    console.log('='.repeat(70));

    if (summary.metrics.login_duration) {
        const m = summary.metrics.login_duration;
        console.log(`  Login:            avg=${m.avg?.toFixed(0)}ms  p95=${m['p(95)']?.toFixed(0)}ms  max=${m.max?.toFixed(0)}ms`);
    }
    if (summary.metrics.queue_accept_time) {
        const m = summary.metrics.queue_accept_time;
        console.log(`  Queue Accept:     avg=${m.avg?.toFixed(0)}ms  p95=${m['p(95)']?.toFixed(0)}ms  max=${m.max?.toFixed(0)}ms`);
    }
    if (summary.metrics.task_total_time) {
        const m = summary.metrics.task_total_time;
        console.log(`  Task Total (E2E): avg=${m.avg?.toFixed(0)}ms  p95=${m['p(95)']?.toFixed(0)}ms  max=${m.max?.toFixed(0)}ms`);
    }
    if (summary.metrics.errors) {
        console.log(`  Error Rate:       ${(summary.metrics.errors.rate * 100).toFixed(1)}%`);
    }
    if (summary.metrics.queued_tasks) {
        console.log(`  Queued Tasks:     ${summary.metrics.queued_tasks.count}`);
    }
    if (summary.metrics.completed_tasks) {
        console.log(`  Completed Tasks:  ${summary.metrics.completed_tasks.count}`);
    }
    if (summary.metrics.timed_out_tasks) {
        console.log(`  Timed Out Tasks:  ${summary.metrics.timed_out_tasks.count}`);
    }
    console.log('='.repeat(70));

    // Compare with old baseline
    console.log('\n  📊 COMPARE WITH PRE-INFRASTRUCTURE:');
    console.log('  ─────────────────────────────────────');
    if (summary.metrics.login_duration) {
        const pre = { baseline: 35, stress: 235, breaking: 5590 };
        const preVal = pre[SCENARIO] || pre.baseline;
        const postVal = summary.metrics.login_duration.avg;
        const improvement = ((preVal - postVal) / preVal * 100).toFixed(1);
        console.log(`  Login:    Pre=${preVal}ms → Post=${postVal?.toFixed(0)}ms  (${improvement}% ${postVal < preVal ? 'faster' : 'slower'})`);
    }
    if (summary.metrics.queue_accept_time) {
        const pre = { baseline: 23425, stress: 31451, breaking: 40504 };
        const preVal = pre[SCENARIO] || pre.baseline;
        const postVal = summary.metrics.queue_accept_time.avg;
        const improvement = ((preVal - postVal) / preVal * 100).toFixed(1);
        console.log(`  Chat API: Pre=${preVal}ms → Post=${postVal?.toFixed(0)}ms  (${improvement}% faster queue acceptance)`);
    }
    console.log('');

    return {
        [selectedScenario.reportFile]: JSON.stringify(summary, null, 2),
        stdout: textSummary(data, { indent: '  ', enableColors: true }),
    };
}

import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.3/index.js';
