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
let paused = false;
let ready = false;
let loadingTimer;
let firstMessage = true;

function validRoute(value) {
  return typeof value === "string" && /^\/(?:share|preview|about|code|organizer(?:\/[\w-]+)?|packet\/[\w-]+)?$/.test(value);
}

function readRoute() {
  // Retain old direct links while presenting one public demonstration address.
  const path = location.pathname.startsWith(basePath) ? `/${location.pathname.slice(basePath.length)}` : "/";
  const value = location.hash.replace(/^#/, "") || path.replace(/\/$/, "") || "/";
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
  renderSelection(design);
  startLoading();
  frame.src = `${design.id}/?embedded=1&v=${revision}#${route}`;
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
  if (state.design !== selected.id) {
    // Back/Forward can restore an earlier frame document. Reflect that actual
    // style instead of leaving the picker and measured height out of sync.
    if (!ready) return;
    renderSelection(activeDesign);
  }
  if (!validRoute(state.route) || !Number.isFinite(state.height) || state.height < 100 || state.height > 50000) return;
  const changedRoute = route !== state.route;
  route = state.route;
  rememberRoute(route);
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
    const next = link.dataset.route;
    if (next === route) showDemo();
    else if (ready) send({ type: "lacchi:navigate", route: next });
    else { route = next; frame.src = `${selected.id}/?embedded=1&v=${revision}#${route}`; }
  });
}
window.addEventListener("hashchange", () => {
  const next = readRoute();
  if (next !== route) send({ type: "lacchi:navigate", route: next });
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
frame.src = `${selected.id}/?embedded=1&v=${revision}#${route}`;
