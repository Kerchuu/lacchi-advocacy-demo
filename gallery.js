const designs = [
  {
    id: "original",
    name: "Original",
    description: "Story entry, sharing choices and review",
  },
  {
    id: "blueprint",
    name: "Blueprint",
    description: "Original story, delivery copy and packet",
  },
  {
    id: "garden",
    name: "Common Ground",
    description: "A household’s note and its recipient copy",
  },
  {
    id: "press",
    name: "Civic Press",
    description: "A bill, a story and the choices behind it",
  },
  {
    id: "parade",
    name: "Paper Parade",
    description: "An illustrated story and its sharing choices",
  },
];
const frame = document.querySelector("#demo-frame");
const basePath = new URL(".", import.meta.url).pathname;
const revision = new URL(import.meta.url).searchParams.get("v") || "local";
const surface = document.querySelector("#demo");
const choices = document.querySelector("#choices");
const motion = document.querySelector("#motion");
const loading = document.querySelector("#demo-loading");
const error = document.querySelector("#demo-error");
const initialStyle = new URL(location.href).searchParams.get("style");
let selected = designs.find((design) => design.id === initialStyle) || designs[0];
let route = readRoute();
let requestedRoute = null;
let nextNavigationId = 0;
let pendingNavigationId = null;
let focusRequestedRoute = null;
let paused = false;
let ready = false;
let loadingTimer;
let firstMessage = true;

function validRoute(value) {
  return (
    typeof value === "string" &&
    /^\/(?:share|preview|about|code|organizer(?:\/[\w-]+)?|packet\/[\w-]+)?$/.test(
      value,
    )
  );
}

function readRoute(address = location.href) {
  // Retain old direct links while presenting one public demonstration address.
  const url = new URL(address, location.href);
  const path = url.pathname.startsWith(basePath)
    ? `/${url.pathname.slice(basePath.length)}`
    : "/";
  const value = url.hash.replace(/^#/, "") || path.replace(/\/$/, "") || "/";
  const normalized = value.startsWith("/") ? value : `/${value}`;
  return validRoute(normalized) ? normalized : "/";
}

function rememberRoute(value) {
  const address = new URL(basePath, location.origin);
  if (selected.id !== "original") address.searchParams.set("style", selected.id);
  if (value !== "/") address.hash = value;
  if (location.href !== address.href) history.replaceState(null, "", address);
}

function showDemo() {
  surface.scrollIntoView({ block: "start", behavior: "instant" });
}

function focusDemoContent() {
  // A wrapper action opens a new task inside the frame. Continue its keyboard
  // order there instead of leaving focus on a now off-screen launcher.
  frame.contentDocument?.getElementById("main")?.focus({ preventScroll: true });
  focusRequestedRoute = null;
}

function send(command) {
  if (ready) frame.contentWindow.postMessage(command, location.origin);
}

function currentFrameRoute() {
  try {
    const value = frame.contentWindow.location.hash.slice(1);
    return validRoute(value) ? value : null;
  } catch {
    return null;
  }
}

function frameSource() {
  return `${selected.id}/?embedded=1&v=${revision}#${route}`;
}

function navigateRoute(next, focus = false) {
  focusRequestedRoute = focus ? next : null;
  requestedRoute = next;
  if (ready) {
    // The frame may already show this URL while a different command is in transit.
    // Wait for the latest command itself, even when two clicks target the same route.
    pendingNavigationId = ++nextNavigationId;
    send({ type: "lacchi:navigate", route: next, navigationId: pendingNavigationId });
  } else {
    route = next;
    startLoading();
    frame.src = frameSource();
  }
}

function startLoading() {
  ready = false;
  pendingNavigationId = null;
  firstMessage = true;
  loading.hidden = false;
  error.hidden = true;
  surface.setAttribute("aria-busy", "true");
  clearTimeout(loadingTimer);
  loadingTimer = setTimeout(() => {
    surface.setAttribute("aria-busy", "false");
    error.hidden = false;
    loading.hidden = true;
  }, 15000);
}

function renderSelection(design) {
  selected = design;
  for (const button of choices.querySelectorAll("button")) {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.design === design.id),
    );
  }
  document.querySelector("#selected-name").textContent = design.name;
  document.querySelector("#selected-description").textContent =
    design.description;
  document.querySelector("#style-status").textContent =
    `${design.name} selected. Saved sample work is shared by the styles in this browser.`;
  frame.title = `${design.name} advocacy demonstration`;
  motion.hidden = design.id === "original";
}

function choose(design) {
  // Choosing an appearance keeps focus on the picker, even if a task was loading.
  focusRequestedRoute = null;
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
  button.setAttribute("aria-pressed", String(design.id === selected.id));
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
  button.append(thumbnail, caption);
  button.addEventListener("click", () => {
    if (selected.id !== design.id) choose(design);
  });
  choices.append(button);
}

window.addEventListener("message", (event) => {
  // Only the active same-origin demo may resize this frame or report its route.
  if (
    event.origin !== location.origin ||
    event.source !== frame.contentWindow ||
    event.data?.type !== "lacchi:frame"
  )
    return;
  const state = event.data;
  const activeDesign = designs.find((design) => design.id === state.design);
  if (
    !activeDesign ||
    frame.contentWindow.location.pathname.split("/").filter(Boolean).at(-1) !==
      state.design
  )
    return;
  if (!validRoute(state.route) || currentFrameRoute() !== state.route) return;
  if (pendingNavigationId !== null && state.navigationId !== pendingNavigationId) return;
  if (requestedRoute && state.route !== requestedRoute) return;
  if (state.design !== selected.id) {
    // Back/Forward can restore an earlier frame document. Reflect that actual
    // style instead of leaving the picker and measured height out of sync.
    if (!ready) return;
    renderSelection(activeDesign);
  }
  if (
    !validRoute(state.route) ||
    !Number.isFinite(state.height) ||
    state.height < 100 ||
    state.height > 50000
  )
    return;
  requestedRoute = null;
  pendingNavigationId = null;
  const changedRoute = route !== state.route;
  route = state.route;
  // History traversal can restore another style on the very same route.
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
  motion.textContent = state.reduced
    ? "Motion reduced"
    : state.paused
      ? "Play motion"
      : "Pause motion";
  const focusRequested = focusRequestedRoute === route;
  if (changedRoute || (firstMessage && route !== "/") || focusRequested)
    showDemo();
  if (focusRequested) focusDemoContent();
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
document
  .querySelector("#retry")
  .addEventListener("click", () => choose(selected));
document.querySelector(".skip").addEventListener("click", (event) => {
  event.preventDefault();
  focusRequestedRoute = null;
  showDemo();
  surface.focus({ preventScroll: true });
});

renderSelection(selected);
startLoading();
frame.src = frameSource();
