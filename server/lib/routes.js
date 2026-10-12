// One route table, two runtimes: Vercel functions (api/*.js) and the Docker/Node server (server/index.js).
import { listProducts, createInquiry, subscribe, runPlan, health } from './handlers.js';

export const ROUTES = {
  products: { method: 'GET', run: (ctx) => listProducts(ctx.query) },
  inquiries: { method: 'POST', run: (ctx) => createInquiry(ctx.body, ctx.ip) },
  subscribe: { method: 'POST', run: (ctx) => subscribe(ctx.body, ctx.ip) },
  plan: { method: 'POST', run: (ctx) => runPlan(ctx.body) },
  health: { method: 'GET', run: () => health() },
};

export const METHOD_NOT_ALLOWED = (allow) => ({ status: 405, body: { error: 'method_not_allowed' }, headers: { Allow: allow, 'Cache-Control': 'no-store' } });
