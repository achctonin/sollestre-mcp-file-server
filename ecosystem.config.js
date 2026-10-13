// pm2 runs two apps: the MCP server and the cloudflared tunnel. Both autorestart.
// Start:   npm run build && pm2 start ecosystem.config.js
// Persist: pm2 save && pm2 startup   (run the command pm2 prints)
const path = require('path');
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  /* no .env: fall back to the real environment */
}

const port = process.env.PORT || '3000';
// Named tunnel (stable URL, needs a Cloudflare account) if CLOUDFLARE_TUNNEL_NAME is set,
// otherwise a quick tunnel (no account, but the *.trycloudflare.com URL changes on every tunnel restart).
const tunnelArgs = process.env.CLOUDFLARE_TUNNEL_NAME
  ? ['tunnel', 'run', process.env.CLOUDFLARE_TUNNEL_NAME]
  : ['tunnel', '--url', `http://127.0.0.1:${port}`];

module.exports = {
  apps: [
    {
      name: 'mcp-server',
      script: 'dist/server.js',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 2000,
      max_restarts: 50,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'mcp-tunnel',
      script: 'cloudflared',
      args: tunnelArgs,
      interpreter: 'none',
      cwd: __dirname,
      autorestart: true,
      restart_delay: 3000,
      max_restarts: 50,
    },
  ],
};
