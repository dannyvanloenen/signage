module.exports = {
  apps: [
    {
      name: 'signage-api',
      cwd: './apps/api',
      script: 'node',
      args: 'dist/index.js',
      env: { NODE_ENV: 'production' },
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: 'signage-admin',
      cwd: './apps/admin',
      script: 'node',
      args: 'build/index.js',
      env: { NODE_ENV: 'production', PORT: '3001', HOST: '0.0.0.0' },
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
