// Dev/test helper: `?timers` swaps requestAnimationFrame for a timer so the page keeps animating
// in windows that are not being painted (e.g. automated or hidden preview panes). Off by default.
if (new URLSearchParams(location.search).has('timers')) {
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
}
