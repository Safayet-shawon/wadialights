// A static-feeling dev server for offline rendering: no HMR, no file watching, so editing the site
// while a long render runs cannot reload the render page.   npx vite --config vite.render.config.js --port 5174
export default { server: { hmr: false, watch: null } };
