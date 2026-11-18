const designs = [
  { id: "original", name: "Original", description: "The core workflow. Start here." },
  { id: "blueprint", name: "Blueprint", description: "A drafting board with document layers" },
  { id: "garden", name: "Common Ground", description: "An illustrated neighborhood" },
  { id: "press", name: "Civic Press", description: "Bold typography and animated paper" },
  { id: "night", name: "After Hours", description: "A midnight energy grid" },
  { id: "parade", name: "Paper Parade", description: "Expressive graphics and paper characters" },
];
const frame = document.querySelector("#demo-frame");
const basePath = new URL(".", import.meta.url).pathname;
const revision = new URL(import.meta.url).searchParams.get("v") || "local";
const surface = document.querySelector("#demo");
const choices = document.querySelector("#choices");
const motion = document.querySelector("#motion");
const loading = document.querySelector("#demo-loading");
const error = document.querySelector("#demo-error");
let selected = designs[0];
let route = readRoute();
let requestedRoute = null;
let paused = false;
let ready = false;
let loadingTimer;
let firstMessage = true;

function validRoute(value) {
  return typeof value === "string" && /^\/(?:share|preview|about|code|organizer(?:\/[\w-]+)?|packet\/[\w-]+)?$/.test(value);
}

function readRoute(address = location.href) {
  // Retain old direct links while presenting one public demonstration address.
  const url = new URL(address, location.href);
  const path = url.pathname.startsWith(basePath) ? `/${url.pathname.slice(basePath.length)}` : "/";
  const value = url.hash.replace(/^#/, "") || path.replace(/\/$/, "") || "/";
  const normalized = value.startsWith("/") ? value : `/${value}`;
  return validRoute(normalized) ? normalized : "/";
}

function rememberRoute(value) {
  history.replaceState(null, "", value === "/" ? basePath : `${basePath}#${value}`);
}

function showDemo() {
  surface.scrollIntoView({ block: "start", behavior: "instant" });
}

function send(command) {
  if (ready) frame.contentWindow.postMessage(command, location.origin);
}

function currentFrameRoute() {
  try {
    const value = frame.contentWindow.location.hash.slice(1);
    return validRoute(value) ? value : null;
  } catch { return null; }
}

function frameSource() {
  return `${selected.id}/?embedded=1&v=${revision}#${route}`;
}

function navigateRoute(next, focus = false) {
  const current = currentFrameRoute();
  // Keep the latest host intent until the frame acknowledges it. An older
  // resize report must not replace a newer navigation or style-switch request.
  requestedRoute = current === next ? null : next;
  if (ready) {
    send({ type: "lacchi:navigate", route: next });
    if (current === next) {
      route = next;
      rememberRoute(next);
      if (focus) showDemo();
    }
  } else {
    route = next;
    startLoading();
    frame.src = frameSource();
  }
}

function startLoading() {
  ready = false;
  firstMessage = true;
  loading.hidden = false;
  error.hidden = true;
  surface.setAttribute("aria-busy", "true");
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => { error.hidden = false; loading.hidden = true; }, 15000);
}

function renderSelection(design) {
  selected = design;
  for (const button of choices.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.design === design.id));
  }
  document.querySelector("#selected-name").textContent = design.name;
  document.querySelector("#selected-description").textContent = design.description;
  document.querySelector("#style-status").textContent = `${design.name} selected. Your sample work is kept when you switch styles.`;
  frame.title = `${design.name} advocacy demonstration`;
  motion.hidden = design.id === "original";
}

function choose(design) {
  route = requestedRoute || (ready && currentFrameRoute()) || route;
  renderSelection(design);
  startLoading();
  frame.src = frameSource();
}

choices.replaceChildren();
for (const design of designs) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "choice";
  button.dataset.design = design.id;
  button.setAttribute("aria-pressed", String(design.id === "original"));
  const thumbnail = document.createElement("img");
  thumbnail.src = `thumbnails/${design.id}.png?v=${revision}`;
  thumbnail.alt = "";
  thumbnail.width = 1440;
  thumbnail.height = 1000;
  const caption = document.createElement("span");
  caption.className = "choice-caption";
  const label = document.createElement("span");
  label.className = "choice-name";
  label.textContent = design.name;
  caption.append(label);
  if (design.id === "original") {
    const note = document.createElement("span");
    note.className = "choice-note";
    note.textContent = "Start here";
    caption.append(note);
  }
  button.append(thumbnail, caption);
  button.addEventListener("click", () => { if (selected.id !== design.id) choose(design); });
  choices.append(button);
}

window.addEventListener("message", (event) => {
  // Only the active same-origin demo may resize this frame or report its route.
  if (event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.type !== "lacchi:frame") return;
  const state = event.data;
  const activeDesign = designs.find((design) => design.id === state.design);
  if (!activeDesign || frame.contentWindow.location.pathname.split("/").filter(Boolean).at(-1) !== state.design) return;
  if (!validRoute(state.route) || currentFrameRoute() !== state.route) return;
  if (requestedRoute && state.route !== requestedRoute) return;
  if (state.design !== selected.id) {
    // Back/Forward can restore an earlier frame document. Reflect that actual
    // style instead of leaving the picker and measured height out of sync.
    if (!ready) return;
    renderSelection(activeDesign);
  }
  if (!validRoute(state.route) || !Number.isFinite(state.height) || state.height < 100 || state.height > 50000) return;
  requestedRoute = null;
  const changedRoute = route !== state.route;
  route = state.route;
  if (changedRoute || firstMessage) rememberRoute(route);
  frame.style.height = `${Math.ceil(state.height)}px`;
  if (!ready) {
    ready = true;
    clearTimeout(loadingTimer);
    surface.setAttribute("aria-busy", "false");
    loading.hidden = true;
    error.hidden = true;
    send({ type: "lacchi:motion", paused });
  }
  motion.disabled = !!state.reduced;
  motion.setAttribute("aria-pressed", String(state.paused));
  motion.textContent = state.reduced ? "Motion reduced" : state.paused ? "Play motion" : "Pause motion";
  if (changedRoute || (firstMessage && route !== "/")) showDemo();
  firstMessage = false;
});

for (const link of document.querySelectorAll("[data-route]")) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    navigateRoute(link.dataset.route, true);
  });
}
window.addEventListener("hashchange", (event) => {
  // newURL preserves the actual intent even if a queued frame message has
  // already changed the visible address by the time this event is delivered.
  navigateRoute(readRoute(event.newURL));
});
motion.addEventListener("click", () => {
  paused = motion.getAttribute("aria-pressed") !== "true";
  send({ type: "lacchi:motion", paused });
});
document.querySelector("#retry").addEventListener("click", () => choose(selected));
document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  showDemo();
  surface.focus({ preventScroll: true });
});

startLoading();
frame.src = frameSource();
