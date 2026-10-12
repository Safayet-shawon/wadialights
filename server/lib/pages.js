// Clean URLs → built HTML files. Used by the Node server and the Vite dev server (Vercel uses cleanUrls + rewrites).
export const PAGES = ['shop', 'cart', 'checkout', 'order', 'admin', 'planner', 'contact'];

/** returns the html file for a request path, or null if the path is not a page */
export function pageFor(pathname) {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/') return 'index.html';
  const name = p.slice(1);
  if (PAGES.includes(name)) return `${name}.html`;
  if (/^\/product\/[a-z0-9-]{1,80}$/.test(p)) return 'product.html';
  return null;
}
