// ecosystem.config.js — works for both Prod & UAT
module.exports = {
  apps: [
    {
      // name: 'essaybot-express',
      name:
        process.env.NAMESPACE === 'prod'
          ? 'essaybot-express'
          : 'essaybot-express-uat',
      cwd: process.cwd(),
      script: 'npx',
      args: 'ts-node src/index.ts',
      instances: 1, // Set to 1 - Node.js cluster module handles multi-instance internally
      exec_mode: 'fork', // Use fork mode - Node.js cluster module handles port sharing
      namespace: process.env.NAMESPACE || 'uat',
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        PORT: 8002, // UAT default
        INSTANCES: '4' // Number of Node.js cluster workers to spawn
      },
      env_production: {
        PORT: 8001, // Prod override
        INSTANCES: '4' // Number of Node.js cluster workers to spawn
      },
      error_file: './logs/express.err.log',
      out_file: './logs/express.out.log',
      log_file: './logs/express.combined.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      // name: 'essaybot-flask',
      name:
        process.env.NAMESPACE === 'prod'
          ? 'essaybot-flask'
          : 'essaybot-flask-uat',
      cwd: process.cwd(),
      // run the Flask app with the venv's python
      script: 'src/python/app.py',
      interpreter: 'src/python/venv/bin/python',
      instances: 1,
      exec_mode: 'fork',
      namespace: process.env.NAMESPACE || 'uat',
      // Load environment variables from .env file (PM2 will merge these)
      env_file: '.env',
      env: {
        FLASK_PORT: 6001, // UAT default
        FLASK_ENV: 'production',
        FLASK_DEBUG: 'false'
      },
      env_production: {
        FLASK_PORT: 6000, // Prod override
        FLASK_ENV: 'production',
        FLASK_DEBUG: 'false'
      },
      error_file: './logs/flask.err.log',
      out_file: './logs/flask.out.log',
      log_file: './logs/flask.combined.log',
      time: true,
      autorestart: true,
      watch: false
    },
    {
      // name: 'essaybot-worker',
      name:
        process.env.NAMESPACE === 'prod'
          ? 'essaybot-worker'
          : 'essaybot-worker-uat',
      cwd: process.cwd(),
      script: 'src/python/worker.py',
      interpreter: 'src/python/venv/bin/python',
      instances: 6, // 6 workers for 100 users (2x scaling)
      exec_mode: 'fork',
      namespace: process.env.NAMESPACE || 'uat',
      // Load environment variables from .env file (PM2 will merge these)
      env_file: '.env',
      env: {
        RABBITMQ_URL: 'amqp://essaybot:essaybot123@localhost:5672',
        REDIS_URL: 'redis://localhost:6379',
        PYTHON_SERVICE_URL: 'http://localhost:6001', // UAT default
        EXPRESS_API_URL: 'http://localhost:8002', // UAT Express API URL
        NODE_ENV: 'production'
      },
      env_production: {
        PYTHON_SERVICE_URL: 'http://localhost:6000', // Prod override
        EXPRESS_API_URL: 'http://localhost:8001', // Prod Express API URL
        RABBITMQ_URL: 'amqp://essaybot:essaybot123@localhost:5672',
        REDIS_URL: 'redis://localhost:6379'
      },
      error_file: './logs/worker.err.log',
      out_file: './logs/worker.out.log',
      log_file: './logs/worker.combined.log',
      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '2G'
    }
  ]
};
