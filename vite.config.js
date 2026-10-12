import { defineConfig } from 'vite';

/**
 * `npm run dev` also serves /api/* (same route table the Vercel functions and the Docker server use),
 * so the whole site, forms and planner included, works locally with one command.
 */
function apiDev() {
  return {
    name: 'wadia-api-dev',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          const url = new URL(req.url, 'http://localhost');
          const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
          const { ROUTES, METHOD_NOT_ALLOWED } = await server.ssrLoadModule('/server/lib/routes.js');
          const route = Object.hasOwn(ROUTES, name) ? ROUTES[name] : null;
          const send = (out) => {
            res.statusCode = out.status;
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
            res.end(JSON.stringify(out.body));
          };
          if (!route) return send({ status: 404, body: { error: 'not_found' } });
          if (req.method !== route.method) return send(METHOD_NOT_ALLOWED(route.method));
          let body;
          if (route.method === 'POST') {
            const chunks = [];
            for await (const c of req) chunks.push(c);
            try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined; } catch { return send({ status: 400, body: { error: 'bad_request' } }); }
          }
          return send(await route.run({ query: Object.fromEntries(url.searchParams), body, ip: req.socket.remoteAddress || '' }));
        } catch (err) {
          console.error('[api-dev]', err);
          res.statusCode = 500; res.end('{"error":"server_error"}');
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [apiDev()],
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 700,        // the only big chunk is the lazy WebGL fallback (three.js)
  },
});
