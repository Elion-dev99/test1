const TOKEN_KEY = "itemdb_admin_token";

const $ = (sel, root = document) => root.querySelector(sel);

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || "";
}

function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

/** Unwrap { success, data, error } API envelope. */
async function api(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { success: false, error: text || res.statusText };
  }
  if (!res.ok || body?.success === false) {
    const err = new Error(body?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = body;
    throw err;
  }
  return body?.data !== undefined ? body.data : body;
}

function setMsg(el, text, ok) {
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("ok", !!ok && !!text);
  el.classList.toggle("err", !ok && !!text);
}

function showLoggedIn(loggedIn) {
  $("#login-panel").hidden = loggedIn;
  $("#admin-panel").hidden = !loggedIn;
  $("#logout-btn").hidden = !loggedIn;
}

function switchTab(name) {
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.tab === name);
  });
  ["item", "drop", "version"].forEach((tab) => {
    const panel = $(`#tab-${tab}`);
    if (panel) panel.hidden = tab !== name;
  });
}

function escapeAttr(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Preview chips from free-form stats text (display only). */
function previewStatsText(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  const box = $("#stats-preview");
  if (!box) return;
  if (!lines.length) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = lines
    .map((line) => `<span class="stat-chip">${escapeHtml(line)}</span>`)
    .join("");
}

$("#stats-text")?.addEventListener("input", (e) => {
  previewStatsText(e.target.value);
});

async function ensureSession() {
  if (!getToken()) {
    showLoggedIn(false);
    return false;
  }
  try {
    await api("/api/admin/me");
    showLoggedIn(true);
    return true;
  } catch {
    clearToken();
    showLoggedIn(false);
    return false;
  }
}

async function loadSuggestLists() {
  try {
    const [bosses, items] = await Promise.all([
      api("/api/bosses").catch(() => []),
      api("/api/items?limit=500").catch(() => []),
    ]);
    const bossList = $("#boss-list");
    const itemList = $("#item-list");
    if (bossList) {
      const list = Array.isArray(bosses) ? bosses : [];
      bossList.innerHTML = list
        .map((b) => `<option value="${escapeAttr(b.name || b)}"></option>`)
        .join("");
    }
    if (itemList) {
      const list = Array.isArray(items) ? items : [];
      itemList.innerHTML = list
        .map((it) => `<option value="${escapeAttr(it.name)}"></option>`)
        .join("");
    }
  } catch {
    /* ignore */
  }
}

$("#login-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#login-msg");
  const fd = new FormData(e.target);
  const password = String(fd.get("password") || "");
  setMsg(msg, "認証中…", true);
  try {
    const data = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    setToken(data.token);
    setMsg(msg, "", true);
    showLoggedIn(true);
    await loadSuggestLists();
  } catch (err) {
    setMsg(msg, err.message || "ログインに失敗しました", false);
  }
});

$("#logout-btn")?.addEventListener("click", () => {
  clearToken();
  showLoggedIn(false);
  setMsg($("#login-msg"), "ログアウトしました", true);
});

document.querySelectorAll(".admin-tab").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

$("#item-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#item-msg");
  const fd = new FormData(e.target);
  const statsText = String(fd.get("stats_text") || "").trim();
  const payload = {
    name: String(fd.get("name") || "").trim(),
    category: String(fd.get("category") || "other"),
    rarity: String(fd.get("rarity") || "common"),
    description: String(fd.get("description") || "").trim() || null,
    icon_url: String(fd.get("icon_url") || "").trim() || null,
    game_version: String(fd.get("game_version") || "").trim() || null,
    verified: 1,
    ...(statsText ? { stats_text: statsText } : {}),
  };
  setMsg(msg, "登録中…", true);
  try {
    const item = await api("/api/items", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setMsg(msg, `登録しました: ${item?.name || payload.name} (id=${item?.id ?? "?"})`, true);
    e.target.reset();
    previewStatsText("");
    await loadSuggestLists();
  } catch (err) {
    setMsg(msg, err.message || "登録に失敗しました", false);
  }
});

$("#drop-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#drop-msg");
  const fd = new FormData(e.target);
  const payload = {
    boss_name: String(fd.get("boss_name") || "").trim(),
    location: String(fd.get("location") || "").trim() || null,
    item_name: String(fd.get("item_name") || "").trim(),
    drop_rate: numOrNull(fd.get("drop_rate")),
    notes: String(fd.get("notes") || "").trim() || null,
  };
  setMsg(msg, "登録中…", true);
  try {
    await api("/api/drops", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setMsg(msg, "ドロップを登録しました", true);
    e.target.reset();
  } catch (err) {
    setMsg(msg, err.message || "登録に失敗しました", false);
  }
});

$("#version-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#version-msg");
  const fd = new FormData(e.target);
  const payload = {
    code: String(fd.get("code") || "").trim(),
    label: String(fd.get("label") || "").trim() || null,
    released_at: String(fd.get("released_at") || "").trim() || null,
    notes: String(fd.get("notes") || "").trim() || null,
    is_current: fd.get("is_current") === "on",
  };
  setMsg(msg, "保存中…", true);
  try {
    const ver = await api("/api/versions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setMsg(msg, `バージョン ${ver?.version_key || payload.code} を保存しました`, true);
    e.target.reset();
  } catch (err) {
    setMsg(msg, err.message || "保存に失敗しました", false);
  }
});

(async () => {
  const ok = await ensureSession();
  if (ok) await loadSuggestLists();
})();
