// PM2 process definitions for production.
// Run from project root:
//   pm2 start ecosystem.config.cjs --env production
//   pm2 save
//   pm2-startup install   (Windows, one-time)
// or on Linux:
//   pm2 startup   (follow the printed command)
module.exports = {
  apps: [
    {
      name: 'platform-api',
      cwd: './apps/api',
      script: 'dist/apps/api/src/server.js',
      node_args: '--enable-source-maps',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' },
      error_file: '../../logs/api.err.log',
      out_file: '../../logs/api.out.log',
      time: true,
    },
    {
      name: 'platform-workers',
      cwd: './apps/api',
      script: 'dist/apps/api/src/workers/index.js',
      node_args: '--enable-source-maps',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '2G',
      env: { NODE_ENV: 'production' },
      error_file: '../../logs/workers.err.log',
      out_file: '../../logs/workers.out.log',
      time: true,
    },
    {
      name: 'platform-web',
      cwd: './apps/web',
      script: './node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' },
      error_file: '../../logs/web.err.log',
      out_file: '../../logs/web.out.log',
      time: true,
    },
  ],
};
