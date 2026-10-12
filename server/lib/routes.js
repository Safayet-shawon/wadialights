// One route table, three runtimes: Vercel functions (api/*.js), the Docker/Node server (server/index.js)
// and the Vite dev middleware. Each route maps HTTP methods to handlers taking { query, body, ip, headers }.
import { listProducts, createInquiry, subscribe, runPlan, health, safely } from './handlers.js';
import {
  getProduct, createOrder, trackOrder, adminGate,
  adminListOrders, adminUpdateOrder, adminListProducts, adminUpdateProduct, adminListInquiries,
} from './shop.js';

const admin = (fn) => async (ctx) => adminGate(ctx.headers, ctx.ip) || fn(ctx);

export const ROUTES = {
  products: { GET: (c) => listProducts(c.query) },
  product: { GET: (c) => safely(() => getProduct(c.query.slug)) },
  inquiries: { POST: (c) => createInquiry(c.body, c.ip) },
  subscribe: { POST: (c) => subscribe(c.body, c.ip) },
  plan: { POST: (c) => runPlan(c.body) },
  orders: { POST: (c) => createOrder(c.body, c.ip, safely), GET: (c) => trackOrder(c.query, safely) },
  health: { GET: () => health() },
  'admin-orders': { GET: admin((c) => adminListOrders(c.query, safely)), PATCH: admin((c) => adminUpdateOrder(c.body, safely)) },
  'admin-products': { GET: admin(() => adminListProducts(safely)), PATCH: admin((c) => adminUpdateProduct(c.body, safely)) },
  'admin-inquiries': { GET: admin((c) => adminListInquiries(c.query, safely)) },
};

export const METHOD_NOT_ALLOWED = (allow) => ({ status: 405, body: { error: 'method_not_allowed' }, headers: { Allow: allow, 'Cache-Control': 'no-store' } });

/** run a route for a request description; shared by every runtime */
export async function dispatch(name, { method, query, body, ip, headers }) {
  const route = Object.hasOwn(ROUTES, name) ? ROUTES[name] : null;
  if (!route) return { status: 404, body: { error: 'not_found' }, headers: { 'Cache-Control': 'no-store' } };
  const m = method === 'HEAD' ? 'GET' : method;
  const fn = route[m];
  if (!fn) return METHOD_NOT_ALLOWED(Object.keys(route).join(', '));
  return fn({ query: query || {}, body, ip, headers: headers || {} });
}
