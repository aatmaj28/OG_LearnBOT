// PM2 Ecosystem Configuration for LearnBot Backend (Flask)
// Works for BOTH envs (prod & uat) just by how you start it.
module.exports = {
  apps: [
    {
      name:
        process.env.NAMESPACE === 'prod' ? 'learnbot-flask' : 'learnbot-flask-uat',
      cwd: process.cwd(), // ← no hardcoded path
      // Run Gunicorn from venv (interpreter: 'none' = run as binary, not with Node)
      interpreter: 'none',
      script: 'venv/bin/gunicorn',
      args: '-c gunicorn_config.py app:app',
      instances: 1,
      exec_mode: 'fork',

      // PM2 grouping: lets you do `pm2 ls prod` vs `pm2 ls uat`
      namespace: process.env.NAMESPACE || 'uat',

      // Load environment variables from .env file (PM2 will merge these)
      env_file: '.env',

      // Default = UAT (when you do NOT pass --env production)
      // Dynamic port from environment (K8s-compliant)
      env: {
        FLASK_ENV: 'production',
        PORT: process.env.PORT || 8031, // UAT port (default 8031, can be overridden)
        NAMESPACE: process.env.NAMESPACE || 'uat',
      },

      // Overrides when you start with: `--env production`
      env_production: {
        PORT: process.env.PORT || 8030, // PROD port (default 8030, can be overridden)
        NAMESPACE: 'prod',
      },

      // logs relative to each folder so prod/uat don't collide
      error_file: './logs/flask.err.log',
      out_file: './logs/flask.out.log',
      log_file: './logs/flask.combined.log',

      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      restart_delay: 4000,
      min_uptime: '10s',
      max_restarts: 10,
      kill_timeout: 5000,
      listen_timeout: 10000,
    },

    // ── LearnBOT Chat Workers (RabbitMQ consumers) ──────────────
    // 10 workers × 5 threads/worker = 50 concurrent LLM requests
    {
      name:
        process.env.NAMESPACE === 'prod' ? 'learnbot-worker' : 'learnbot-worker-uat',
      cwd: process.cwd(),
      interpreter: 'venv/bin/python',
      script: 'worker.py',
      instances: 10,
      exec_mode: 'fork',

      namespace: process.env.NAMESPACE || 'uat',
      env_file: '.env',

      env: {
        WORKER_MAX_CONCURRENT: '5',
        WORKER_TASK_TIMEOUT: '120',
      },

      // Overrides when you start with: `--env production`
      env_production: {
        NAMESPACE: 'prod',
      },

      error_file: './logs/worker.err.log',
      out_file: './logs/worker.out.log',
      log_file: './logs/worker.combined.log',

      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 5000,
      min_uptime: '10s',
      max_restarts: 10,
      kill_timeout: 30000,    // 30s to finish active tasks before SIGKILL
      listen_timeout: 10000,
    }
  ]
};
