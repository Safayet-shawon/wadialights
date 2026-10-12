// Adapts a route from routes.js to the Vercel Node function signature.
import { ROUTES, METHOD_NOT_ALLOWED } from './routes.js';

export function vercelRoute(name) {
  const route = ROUTES[name];
  return async function handler(req, res) {
    let out;
    if (req.method !== route.method && !(route.method === 'GET' && req.method === 'HEAD')) {
      out = METHOD_NOT_ALLOWED(route.method);
    } else {
      const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
      out = await route.run({ query: req.query || {}, body: req.body, ip });
    }
    for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(out.status).json(out.body);
  };
}
