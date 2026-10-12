// Adapts a route from routes.js to the Vercel Node function signature.
import { dispatch } from './routes.js';

export function vercelRoute(name) {
  return async function handler(req, res) {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    const out = await dispatch(name, { method: req.method, query: req.query || {}, body: req.body, ip, headers: req.headers });
    for (const [k, v] of Object.entries(out.headers || {})) res.setHeader(k, v);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(out.status).json(out.body);
  };
}
