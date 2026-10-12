// Loading screen: the WADIA bulb draws itself, then glows. The animation is pure CSS (see styles.css),
// so it keeps moving while the main thread is busy. It never holds the page longer than it must.
export function playLoader() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return new Promise((resolve) => setTimeout(resolve, reduced ? 300 : 1600));
}
