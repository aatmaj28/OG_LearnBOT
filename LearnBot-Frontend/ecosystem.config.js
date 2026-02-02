// PM2 Ecosystem Configuration for LearnBot Frontend
// Works for BOTH envs (prod & uat) just by how you start it.
module.exports = {
  apps: [
    {
      name:
        process.env.NAMESPACE === 'prod' ? 'learnbot-ui' : 'learnbot-ui-uat',
      cwd: process.cwd(), // ← no hardcoded path
      script: './node_modules/.bin/next',
      args: 'start', // ← PORT comes from env, not -p
      instances: 1,
      exec_mode: 'fork',

      // PM2 grouping: lets you do `pm2 ls prod` vs `pm2 ls uat`
      namespace: process.env.NAMESPACE || 'uat',

      // Load environment variables from .env file (PM2 will merge these)
      env_file: '.env',
      
      // Default = UAT (when you do NOT pass --env production)
      // Dynamic port from environment (K8s-compliant)
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3031, // UAT port (default 3031, can be overridden)
        NEXT_PUBLIC_DISABLE_DEVTOOLS: 'true',
        NEXT_PUBLIC_ENABLE_CONSOLE_LOGS: 'false',
        NEXT_PUBLIC_ENABLE_SOURCE_MAPS: 'false',
        NEXT_PUBLIC_OPTIMIZE_IMAGES: 'true',
        NEXT_PUBLIC_COMPRESS_RESPONSES: 'true'
      },

      // Overrides when you start with: `--env production`
      env_production: {
        PORT: process.env.PORT || 3030, // PROD port (default 3030, can be overridden)
      },

      // logs relative to each folder so prod/uat don't collide
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',

      time: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      restart_delay: 4000,
      min_uptime: '10s',
      max_restarts: 10,
      kill_timeout: 5000,
      listen_timeout: 10000,
      node_args: '--max_old_space_size=1024',
      source_map_support: false
    }
  ]
};
