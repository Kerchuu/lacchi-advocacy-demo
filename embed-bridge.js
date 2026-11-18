(() => {
  if (window.parent === window || !new URLSearchParams(location.search).has("embedded")) return;

  // Let the host page own scrolling. Viewport-based minimums would otherwise
  // feed the frame's measured height back into its own layout indefinitely.
  const style = document.createElement("style");
  style.textContent = `
    html, body { height: auto !important; min-height: 0 !important; overflow-y: hidden !important; }
    .advocacy-app, .main-container { min-height: 0 !important; }
    .study-controls { display: none !important; }
    .source-code { max-height: 560px !important; }
  `;
  document.head.append(style);
  let pending = false;
  let observed;
  let previous = "";
  const resize = new ResizeObserver(schedule);

  function schedule() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(report);
  }

  function report() {
    pending = false;
    const app = document.querySelector(".advocacy-app");
    if (!app) return;
    if (observed !== app) {
      if (observed) resize.unobserve(observed);
      resize.observe(app);
      observed = app;
    }
    const state = {
      type: "lacchi:frame",
      design: location.pathname.split("/").filter(Boolean).at(-1),
      height: Math.ceil(app.getBoundingClientRect().height),
      route: location.hash.slice(1) || "/",
      paused: document.documentElement.dataset.motion === "paused",
      reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
    const serialized = JSON.stringify(state);
    if (serialized !== previous) {
      previous = serialized;
      window.parent.postMessage(state, location.origin);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.origin !== location.origin) return;
    const command = event.data;
    if (command?.type === "lacchi:navigate" && typeof command.route === "string" && /^\/(?:share|preview|about|code|organizer(?:\/[\w-]+)?|packet\/[\w-]+)?$/.test(command.route)) {
      location.hash = command.route;
    }
    if (command?.type === "lacchi:motion" && typeof command.paused === "boolean") {
      const control = document.querySelector(".study-controls button");
      if (control && !control.disabled && (control.getAttribute("aria-pressed") === "true") !== command.paused) control.click();
    }
  });
  new MutationObserver(schedule).observe(document.body, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ["class", "disabled", "aria-pressed"],
  });
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  window.addEventListener("hashchange", schedule);
  window.addEventListener("pageshow", (event) => {
    // A restored document must read the workspace saved by the intervening style.
    if (event.persisted) { location.reload(); return; }
    previous = "";
    schedule();
  });
  window.addEventListener("resize", schedule);
  document.fonts.ready.then(schedule);
  schedule();
})();
