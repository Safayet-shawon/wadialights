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
        const url = new URL(req.url || '/', 'http://localhost');
        // clean URLs for the multi-page site (/shop, /product/<slug>, …)
        if (!url.pathname.startsWith('/api/')) {
          const { pageFor } = await server.ssrLoadModule('/server/lib/pages.js');
          const page = pageFor(url.pathname);
          if (page && page !== 'index.html') req.url = '/' + page + url.search;
          return next();
        }
        try {
          const { dispatch } = await server.ssrLoadModule('/server/lib/routes.js');
          let body;
          if (req.method === 'POST' || req.method === 'PATCH') {
            const chunks = [];
            for await (const c of req) chunks.push(c);
            try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined; } catch {
              res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); return res.end('{"error":"bad_request"}');
            }
          }
          const out = await dispatch(url.pathname.replace(/^\/api\//, '').replace(/\/$/, ''), {
            method: req.method, query: Object.fromEntries(url.searchParams), body, ip: req.socket.remoteAddress || '', headers: req.headers,
          });
          res.statusCode = out.status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
          res.end(JSON.stringify(out.body));
        } catch (err) {
          console.error('[api-dev]', err);
          res.statusCode = 500; res.end('{"error":"server_error"}');
        }
      });
    },
  };
}

const pages = ['index', 'shop', 'product', 'cart', 'checkout', 'order', 'admin', 'planner', 'contact', '404'];

export default defineConfig({
  plugins: [apiDev()],
  build: {
    rollupOptions: { input: Object.fromEntries(pages.map((n) => [n, new URL(`./${n}.html`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')])) },
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 700,        // the only big chunk is the lazy WebGL fallback (three.js)
  },
});
