// PM2 Ecosystem Configuration for LearnBot UI (repo root)
// Works for BOTH envs (prod & uat) by NAMESPACE when started.
module.exports = {
  apps: [
    {
      name:
        process.env.NAMESPACE === 'prod' ? 'learnbot-ui' : 'learnbot-ui-uat',
      cwd: process.cwd(),
      script: './node_modules/.bin/next',
      args: 'start',
      instances: 1,
      exec_mode: 'fork',
      namespace: process.env.NAMESPACE || 'uat',
      env_file: '.env',
      env: {
        NODE_ENV: 'production',
        PORT: process.env.PORT || 3031,
        NEXT_PUBLIC_DISABLE_DEVTOOLS: 'true',
        NEXT_PUBLIC_ENABLE_CONSOLE_LOGS: 'false',
        NEXT_PUBLIC_ENABLE_SOURCE_MAPS: 'false',
        NEXT_PUBLIC_OPTIMIZE_IMAGES: 'true',
        NEXT_PUBLIC_COMPRESS_RESPONSES: 'true'
      },
      env_production: {
        PORT: process.env.PORT || 3030,
      },
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
