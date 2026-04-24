/* ============================================================
 * StickyFlow — Clerk + Convex bootstrap (ES module)
 * ============================================================ */
import { ConvexClient } from "https://esm.sh/convex@1.19.0/browser";

const cfg = window.STICKYFLOW_CONFIG || {};
const pk = cfg.CLERK_PUBLISHABLE_KEY;
const convexUrl = cfg.CONVEX_URL;
const jwtTemplate = cfg.CLERK_JWT_TEMPLATE || "convex";

const authGate = document.getElementById("authGate");
const appEl = document.getElementById("app");
const hint = document.getElementById("authHint");

/* ---------- Fatal config checks ---------- */
if (!pk || pk.includes("REPLACE_ME")) {
  showFatal("Missing <code>CLERK_PUBLISHABLE_KEY</code> in <code>config.js</code>.");
  throw new Error("Missing Clerk publishable key");
}
if (!convexUrl) {
  showFatal("Missing <code>CONVEX_URL</code> in <code>config.js</code>.");
  throw new Error("Missing Convex URL");
}

function showFatal(html) {
  authGate.classList.remove("hidden");
  if (hint) hint.innerHTML = html;
}

/** Visible toast for auth/convex errors (doesn't break app). */
function showAuthError(msg) {
  console.error("[StickyFlow]", msg);
  let toast = document.getElementById("stickyflowToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "stickyflowToast";
    toast.className = "sf-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(showAuthError._t);
  showAuthError._t = setTimeout(() => toast.classList.remove("show"), 8000);
}

/* ---------- Decode Clerk Frontend API from pk ---------- */
let frontendApi;
try {
  const b64 = pk.split("_").slice(2).join("_");
  frontendApi = atob(b64).replace(/\$$/, "");
} catch {
  showFatal("Invalid Clerk publishable key format.");
  throw new Error("bad pk");
}

/* ---------- Convex client (authenticated lazily) ---------- */
const convex = new ConvexClient(convexUrl);
window.convex = convex;

/* ---------- Simple DB API exposed to app.js ---------- */
let currentSubscription = null;
window.stickyflowDB = {
  /** Subscribe to the signed-in user's notes. Returns an unsubscribe fn. */
  subscribe(onChange) {
    if (currentSubscription) currentSubscription();
    currentSubscription = convex.onUpdate(
      "notes:list",
      {},
      (result) => onChange(result || []),
      (err) => {
        const msg = String(err && err.message || err);
        if (msg.includes("UNAUTHENTICATED") || msg.includes("No auth")) {
          showAuthError(
            "Convex rejected your auth. Check: (1) JWT template named 'convex' exists in Clerk, " +
            "(2) CLERK_JWT_ISSUER_DOMAIN on Convex matches the issuer shown in that template.",
          );
        } else {
          showAuthError("Convex error: " + msg);
        }
      },
    );
    return () => {
      if (currentSubscription) currentSubscription();
      currentSubscription = null;
    };
  },

  async upsert(note) {
    return convex.mutation("notes:upsert", {
      clientId: note.id,
      type: note.type,
      color: note.color,
      title: note.title || "",
      content: note.content,
      tasks: note.tasks,
      createdAt: note.createdAt || Date.now(),
      order: typeof note.order === "number" ? note.order : 0,
    });
  },

  async remove(clientId) {
    return convex.mutation("notes:remove", { clientId });
  },

  async migrateFromLocal(notes) {
    return convex.mutation("notes:migrateFromLocal", {
      notes: notes.map((n, i) => ({
        clientId: n.id,
        type: n.type,
        color: n.color,
        title: n.title || "",
        content: n.content,
        tasks: n.tasks,
        createdAt: n.createdAt || Date.now(),
        order: typeof n.order === "number" ? n.order : i,
      })),
    });
  },
};

/* ---------- Load Clerk SDK from its Frontend API ---------- */
const script = document.createElement("script");
script.src = `https://${frontendApi}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
script.async = true;
script.crossOrigin = "anonymous";
script.dataset.clerkPublishableKey = pk;
script.onload = initClerk;
script.onerror = () => showFatal("Failed to load Clerk SDK. Check your key / network.");
document.head.appendChild(script);

async function initClerk() {
  try {
    const Clerk = window.Clerk;
    await Clerk.load({
      appearance: { variables: { colorPrimary: "#7c5cff", borderRadius: "10px" } },
    });
    window.clerk = Clerk;

    /* Wire Convex auth to Clerk session tokens. */
    convex.setAuth(async () => {
      if (!Clerk.session) {
        console.info("[StickyFlow] No Clerk session yet.");
        return null;
      }
      try {
        const token = await Clerk.session.getToken({ template: jwtTemplate });
        if (!token) {
          showAuthError(
            `Clerk JWT template "${jwtTemplate}" returned empty. ` +
            `Create a template named exactly "${jwtTemplate}" in Clerk Dashboard → JWT Templates.`,
          );
          return null;
        }
        try {
          const payload = JSON.parse(atob(token.split(".")[1]));
          console.info("[StickyFlow] JWT payload:", {
            iss: payload.iss, aud: payload.aud, sub: payload.sub,
            exp: new Date(payload.exp * 1000).toISOString(),
          });
        } catch {}
        return token;
      } catch (err) {
        showAuthError(
          `Failed to get JWT for template "${jwtTemplate}". ` +
          `Is it created in Clerk dashboard? ` + err.message,
        );
        return null;
      }
    });

    const sync = () => {
      if (Clerk.user) {
        authGate.classList.add("hidden");
        appEl.classList.remove("hidden");
        mountUserButton();
        window.dispatchEvent(new CustomEvent("stickyflow:user", { detail: Clerk.user }));
      } else {
        appEl.classList.add("hidden");
        authGate.classList.remove("hidden");
        if (hint) hint.textContent = "";
        mountSignIn();
      }
    };

    sync();
    Clerk.addListener(sync);
  } catch (err) {
    console.error(err);
    showFatal("Clerk failed to initialize: " + err.message);
  }
}

function mountSignIn() {
  const el = document.getElementById("clerkSignIn");
  if (!el || el.dataset.mounted) return;
  el.dataset.mounted = "1";
  window.Clerk.mountSignIn(el, { afterSignInUrl: "/", afterSignUpUrl: "/" });
}

function mountUserButton() {
  const el = document.getElementById("clerkUserButton");
  if (!el || el.dataset.mounted) return;
  el.dataset.mounted = "1";
  window.Clerk.mountUserButton(el, { afterSignOutUrl: "/" });
}
