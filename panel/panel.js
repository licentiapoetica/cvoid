// vvoid's panel, the page (its server: panel.js, at vvoid's root). The way in, then: the settings (.env,
// each described where it is read), the plugins (on or off), the void's look, .env as it is, and vvoid's
// log, with vvoid started, stopped and restarted from the top. Nothing is changed until it is saved; a
// save that finds .env changed elsewhere meanwhile is refused, and what was being changed is kept.
const $ = (s) => document.querySelector(s);
function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k in e && !k.includes("-")) e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  e.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
  return e;
}
const store = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} },
};

// ---- the way in ----
let token = store.get("vvoid-panel");
async function api(path, { method = "GET", body } = {}) {
  const r = await fetch(`/api/${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { ...(token && { authorization: `Bearer ${token}` }), ...(body !== undefined && { "content-type": "application/json" }) },
  });
  const out = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== "login") {
    out_();
    throw Object.assign(new Error("the key, again"), { status: 401 });
  }
  if (!r.ok) throw Object.assign(new Error(out.error ?? `${r.status}`), { status: r.status });
  return out;
}
async function in_(key) {
  const { token: t } = await api("login", { method: "POST", body: { key } });
  token = t;
  store.set("vvoid-panel", t);
  show();
}
function out_() {
  token = null;
  store.set("vvoid-panel", null);
  clearTimeout(polling);
  $("#app").hidden = true;
  $("#login").hidden = false;
  $("#key").focus();
}
$("#login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const error = $("#login .error");
  error.textContent = "";
  try {
    await in_($("#key").value);
    $("#key").value = "";
  } catch (err) {
    error.textContent = err.message;
  }
});
$("#logout").addEventListener("click", async () => {
  if (unsaved() && !confirm("Leave what is not saved?")) return;
  await api("logout", { method: "POST" }).catch(() => {});
  out_();
});

// ---- what was said ----
let toastTimer;
function toast(text, bad = false) {
  const t = $("#toast");
  t.textContent = text;
  t.className = `show${bad ? " bad" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), bad ? 6000 : 3000);
}

// ---- tabs ----
const TABS = ["settings", "plugins", "look", "env", "log"];
function tab(name) {
  if (!TABS.includes(name)) name = "settings";
  store.set("vvoid-panel-tab", name);
  for (const t of TABS) {
    $(`#tab-${t}`).hidden = t !== name;
    $(`nav [data-tab=${t}]`).setAttribute("aria-selected", String(t === name));
  }
  if (name === "look") loadLook();
  if (name === "env" && !envDirty) loadEnv();
  if (name === "log") requestAnimationFrame(() => ($("#log").scrollTop = $("#log").scrollHeight));
}
for (const b of document.querySelectorAll("nav [data-tab]")) b.addEventListener("click", () => tab(b.dataset.tab));

// ---- vvoid: its state, and the log, asked for every few seconds ----
let vvoid = null, polling, logN = 0;
async function poll() {
  clearTimeout(polling);
  try {
    const { vvoid: v, log, logged } = await api(`state?since=${logN}`);
    if (logged < logN) { // (the panel was restarted: its log is a new one)
      logN = 0;
      $("#log").textContent = "";
      return poll();
    }
    vvoid = v;
    showVvoid();
    addLog(log);
    logN = logged;
  } catch (err) {
    if (err.status === 401) return;
  }
  polling = setTimeout(poll, document.hidden ? 10_000 : 2000);
}
document.addEventListener("visibilitychange", () => !document.hidden && token && poll());
const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
function showVvoid() {
  const v = vvoid, s = v.state;
  $("#vvoid .dot").className = `dot ${s}`;
  $("#vvoid-state").textContent = {
    running: `running · pid ${v.pid} · since ${time(v.startedAt)}`,
    starting: "starting…",
    elsewhere: `running on :${v.port}, started elsewhere`,
    stopped: v.ended ? `stopped · ended ${v.ended.signal ?? `with code ${v.ended.code}`} at ${time(v.ended.at)}` : "stopped",
  }[s];
  const open = $("#vvoid-open");
  open.hidden = !(s === "running" || s === "elsewhere");
  open.href = v.url ?? "#";
  const here = s === "running" || s === "starting";
  for (const b of document.querySelectorAll("[data-act]")) {
    b.disabled = busy || (b.dataset.act === "start" ? s !== "stopped" : !here);
    b.title = s === "elsewhere" ? "vvoid was started elsewhere: it can be stopped there" : "";
  }
  $("#stale").hidden = !v.stale;
  $("#log-where").textContent = s === "elsewhere"
    ? "vvoid was started elsewhere, not from this panel: what it writes is written there. Stop it there and start it here to read it here."
    : here ? "What vvoid writes, as it writes it (the last 3000 lines)." : "vvoid is not running. Start it from the top.";
}
let busy = false;
for (const b of document.querySelectorAll("[data-act]")) {
  b.addEventListener("click", async () => {
    busy = true;
    showVvoid();
    try {
      vvoid = await api(`vvoid/${b.dataset.act}`, { method: "POST" });
      toast({ start: "vvoid started", stop: "vvoid stopped", restart: "vvoid restarted" }[b.dataset.act]);
    } catch (err) {
      toast(err.message, true);
    }
    busy = false;
    poll();
  });
}
function addLog(lines) {
  const pre = $("#log"), atEnd = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 40;
  for (const l of lines) pre.append(el("span", { class: l.text.startsWith("──") ? "mark" : l.err ? "err" : null }, `${l.text}\n`));
  while (pre.childNodes.length > 3000) pre.firstChild.remove();
  if (atEnd) pre.scrollTop = pre.scrollHeight;
}

// ---- settings ----
let settings = null;
const pending = new Map(); // name -> { value, on, remove }: changed, not yet saved
const entry = (name) => settings?.groups.flatMap((g) => g.entries).find((e) => e.name === name);
// a change to one name proposed: kept while it differs from .env, let go once it is .env again
function propose(name, next) {
  const e = entry(name);
  const same = e?.exists ? !next.remove && next.value === e.value && next.on === e.on : !next.remove && !next.on && !next.value;
  same ? pending.delete(name) : pending.set(name, next);
  showPending();
}
// what a name is now: as it will be saved, else as it is in .env
const current = (name) => pending.get(name) ?? entry(name);
let openGroups = new Set(JSON.parse(store.get("vvoid-panel-open") ?? '["vvoid"]'));
async function loadSettings() {
  try {
    settings = await api("settings");
    renderSettings();
    renderPlugins();
  } catch (err) {
    toast(err.message, true);
  }
}
function renderSettings() {
  const words = $("#filter").value.trim().toLowerCase().split(/\s+/).filter(Boolean), onlySet = $("#only-set").checked;
  const box = $("#groups");
  box.replaceChildren();
  for (const g of settings.groups) {
    const entries = g.entries.filter((e) =>
      (!onlySet || e.exists || pending.has(e.name)) &&
      words.every((w) => `${e.name} ${e.about ?? ""} ${g.title}`.toLowerCase().includes(w)));
    if (!entries.length) continue;
    const plugin = settings.plugins.find((p) => p.name === g.plugin);
    const set = g.entries.filter((e) => e.exists && e.on).length;
    const d = el("details", { class: "group", id: `group-${g.id}`, open: words.length > 0 || onlySet || openGroups.has(g.id) },
      el("summary", {},
        el("span", { class: "title" }, g.title),
        el("span", { class: "count" }, `${set} of ${g.entries.length} set`),
        plugin?.off && el("span", { class: "badge off" }, "off"),
        plugin?.locked && el("span", { class: "badge" }, "locked")),
      g.about && el("p", { class: "group-about" }, g.about),
      entries.map(row));
    d.addEventListener("toggle", () => {
      if (words.length || onlySet) return;
      d.open ? openGroups.add(g.id) : openGroups.delete(g.id);
      store.set("vvoid-panel-open", JSON.stringify([...openGroups]));
    });
    box.append(d);
  }
  if (!box.children.length) box.append(el("p", { class: "empty" }, "Nothing like that."));
}
function row(e) {
  const p = pending.get(e.name);
  let removing = !!p?.remove, touched = false; // (touched: its box ticked or not by hand, not by typing)
  const value = el("input", {
    class: "value", type: e.secret ? "password" : "text", value: p?.value ?? e.value, spellcheck: false, autocomplete: e.secret ? "new-password" : "off",
    placeholder: e.default ? `default: ${e.default}` : "unset", "aria-label": e.name,
  });
  const on = el("input", { type: "checkbox", checked: p ? p.on : e.on, title: "on (off: commented out, its value kept)", "aria-label": `${e.name} on` });
  const state = el("span", { class: "state" });
  const remove = el("button", { type: "button", class: "quiet", title: "take it out of .env", "aria-label": `take ${e.name} out of .env`, hidden: !e.exists }, "×");
  const show = e.secret && el("button", { type: "button", class: "quiet", onclick: () => {
    value.type = value.type === "password" ? "text" : "password";
    show.textContent = value.type === "password" ? "show" : "hide";
  } }, "show");
  const r = el("div", { class: "row" },
    el("div", { class: "name" }, el("code", {}, e.name), e.default && el("span", { class: "default" }, `default ${e.default}`)),
    e.about && el("div", { class: "about" }, e.about),
    e.shadowed && el("div", { class: "note" }, "the panel was started with this set in its environment: vvoid started from here is given that, over .env"),
    el("div", { class: "edit" }, on, value, show, remove, state));
  function sync() {
    const now = pending.get(e.name) ?? { value: e.value, on: e.on, remove: false };
    const was = e.exists || pending.has(e.name);
    r.className = `row ${now.remove ? "removing" : now.on ? "set" : was ? "off" : "unset"}${pending.has(e.name) ? " dirty" : ""}`;
    state.textContent = now.remove ? "taken out" : now.on ? "on" : e.exists || now.value ? "off" : "unset";
    value.disabled = on.disabled = removing;
    remove.textContent = removing ? "↶" : "×";
  }
  function edit() {
    propose(e.name, { value: value.value, on: on.checked, remove: removing });
    sync();
    if (e.name === "VVOID_PLUGINS_OFF" || e.name.endsWith("_PASSWORD")) renderPlugins();
  }
  value.addEventListener("input", () => {
    if (!e.exists && !touched) on.checked = value.value !== ""; // (an unset one typed into is on)
    edit();
  });
  on.addEventListener("change", () => ((touched = true), edit()));
  remove.addEventListener("click", () => {
    removing = !removing;
    if (!removing) value.value = e.value, (on.checked = e.on);
    edit();
  });
  sync();
  return r;
}
$("#filter").addEventListener("input", () => settings && renderSettings());
$("#only-set").addEventListener("change", () => settings && renderSettings());

function showPending() {
  const n = pending.size;
  $("#pending").hidden = !n;
  $("#pending-text").textContent = `${n} ${n === 1 ? "change" : "changes"} to .env`;
}
$("#pending-discard").addEventListener("click", () => {
  pending.clear();
  showPending();
  renderSettings();
  renderPlugins();
});
$("#pending-save").addEventListener("click", async () => {
  const edits = [...pending].map(([name, p]) => (p.remove ? { name, remove: true } : { name, value: p.value, on: p.on }));
  $("#pending-save").disabled = true;
  try {
    settings = await api("settings", { method: "PUT", body: { base: settings.version, edits } });
    pending.clear();
    toast(vvoid?.state === "running" ? "saved: restart vvoid for it to count" : vvoid?.state === "elsewhere" ? "saved: restart vvoid where it runs for it to count" : "saved");
  } catch (err) {
    toast(err.message, true);
    if (err.status === 409) settings = await api("settings").catch(() => settings);
  }
  $("#pending-save").disabled = false;
  showPending();
  renderSettings();
  renderPlugins();
  poll();
});

// ---- plugins: on and off, as VVOID_PLUGINS_OFF says ----
function offList() {
  const e = entry("VVOID_PLUGINS_OFF"), now = pending.get("VVOID_PLUGINS_OFF") ?? e;
  if (!now || now.remove || !now.on) return [];
  return now.value.split(",").map((n) => n.trim()).filter(Boolean);
}
function setOff(list) {
  const e = entry("VVOID_PLUGINS_OFF"), value = list.join(",");
  if (!value) e?.exists && e.on ? pending.set(e.name, { remove: true }) : pending.delete("VVOID_PLUGINS_OFF");
  else if (e?.exists && e.on && e.value === value) pending.delete("VVOID_PLUGINS_OFF");
  else pending.set("VVOID_PLUGINS_OFF", { value, on: true });
  showPending();
  renderPlugins();
  renderSettings();
}
function renderPlugins() {
  const box = $("#plugins");
  box.replaceChildren();
  if (!settings.plugins.length) return box.append(el("p", { class: "empty" }, "No plugins: plugins/ is empty (see the README)."));
  const off = new Set(offList()), changed = pending.has("VVOID_PLUGINS_OFF");
  for (const p of settings.plugins) {
    const isOff = off.has(p.name);
    const toggle = el("input", { type: "checkbox", checked: !isOff, "aria-label": `${p.name} on`, onchange: () => {
      const list = offList().filter((n) => n !== p.name);
      setOff(toggle.checked ? list : [...list, p.name]);
    } });
    box.append(el("div", { class: `plugin${isOff ? " off" : ""}${changed && isOff !== p.off ? " dirty" : ""}` },
      el("div", { class: "top" }, el("strong", {}, p.name), el("label", {}, toggle, isOff ? "off" : "on")),
      p.about && el("p", {}, p.about),
      el("div", { class: "tags" },
        p.server && el("span", {}, "server"),
        p.page && el("span", {}, "page")),
      password(p),
      el("a", { tabindex: 0, onclick: () => {
        openGroups.add(`plugin:${p.name}`);
        $("#filter").value = "";
        tab("settings");
        renderSettings();
        $(`#group-${CSS.escape(`plugin:${p.name}`)}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      } }, "its settings →")));
  }
}

// its password, at its ring: its own (VVOID_<NAME>_PASSWORD), else every plugin's (VVOID_PASSWORD), else none.
// Typed, it is its own; emptied, its own is commented out (kept in .env for later) and VVOID_PASSWORD counts.
const envOf = (name) => `VVOID_${name.toUpperCase().replace(/-/g, "_")}_PASSWORD`;
function lockOf(name) {
  const own = current(envOf(name)), all = current("VVOID_PASSWORD");
  if (own && !own.remove && own.on) return own.value ? "own" : "open";
  return all && !all.remove && all.on && all.value ? "all" : "open";
}
function password(p) {
  const name = envOf(p.name), e = entry(name), now = current(name);
  const input = el("input", {
    class: "value", type: "password", value: now && !now.remove && now.on ? now.value : "",
    placeholder: "no password of its own", autocomplete: "new-password", spellcheck: false, "aria-label": `${p.name}'s password`,
  });
  const show = el("button", { type: "button", class: "quiet", onclick: () => {
    input.type = input.type === "password" ? "text" : "password";
    show.textContent = input.type === "password" ? "show" : "hide";
  } }, "show");
  const state = el("span", { class: "lockstate" });
  const box = el("div", { class: "lock" }, el("label", {}, "password", el("div", {}, input, show)), state);
  const sync = () => {
    const lock = lockOf(p.name);
    state.className = `lockstate ${lock}`;
    state.textContent = { own: "locked: its own password", all: "locked: VVOID_PASSWORD, every plugin's", open: "open: no password asked" }[lock];
    box.classList.toggle("dirty", pending.has(name));
  };
  input.addEventListener("input", () => {
    const v = input.value;
    // (emptied: its own line commented out, its value kept; never written as NAME= by this, which would open it)
    if (v) propose(name, { value: v, on: true });
    else if (e?.exists && e.on) propose(name, { value: e.value, on: false });
    else propose(name, { value: e?.value ?? "", on: false });
    sync();
    renderSettings();
  });
  sync();
  return box;
}

// ---- the look ----
let lookData = null, lookEdit = {};
async function loadLook() {
  try {
    lookData = await api("look");
    renderLook();
  } catch (err) {
    toast(err.message, true);
  }
}
function renderLook() {
  const { fields, looks, live, admin } = lookData, box = $("#look");
  const can = !live || admin;
  $("#look-where").textContent = live
    ? admin ? "vvoid is running: what is applied here is seen at once, by everyone in the void (as an admin turns it in the Tab panel)."
      : "vvoid is running without an admin key (VVOID_ADMIN_KEY): its look is shown here, but can be changed only once it has one (and has been restarted), or while it is stopped."
    : "vvoid is not running: the look is kept in its file (VVOID_LOOK), and seen when vvoid starts.";
  box.replaceChildren();
  const valueOf = (f) => lookEdit[f.key] ?? looks.now[f.key] ?? f.value;
  const groups = new Map();
  for (const f of fields) (groups.get(f.group) ?? groups.set(f.group, []).get(f.group)).push(f);
  for (const [group, fs] of groups) {
    box.append(el("div", { class: "look-group" }, el("h3", {}, group), fs.map((f) => {
      const id = `look-${f.key}`, v = valueOf(f);
      if (f.type === "switch") {
        // (a switch: a button, on or off; applied with the rest)
        const button = el("button", { id, type: "button", class: `switch${v > 0 ? " on" : ""}`, disabled: !can }, v > 0 ? "on" : "off");
        const knob = el("div", { class: `knob${f.key in lookEdit ? " changed" : ""}` }, el("label", { for: id, title: f.key }, f.label), button, el("output", { for: id }));
        button.addEventListener("click", () => {
          const now = valueOf(f) > 0 ? 0 : 1;
          if (now === (looks.now[f.key] ?? f.value)) delete lookEdit[f.key];
          else lookEdit[f.key] = now;
          button.textContent = now ? "on" : "off";
          button.classList.toggle("on", !!now);
          knob.classList.toggle("changed", f.key in lookEdit);
          lookBar();
        });
        return knob;
      }
      const out = el("output", { for: id }, f.type === "colour" ? v : String(v));
      const input = f.type === "colour"
        ? el("input", { id, type: "color", value: v, disabled: !can })
        : el("input", { id, type: "range", min: f.min, max: f.max, step: f.step, value: v, disabled: !can });
      const knob = el("div", { class: `knob${f.key in lookEdit ? " changed" : ""}` }, el("label", { for: id, title: f.key }, f.label), input, out);
      input.addEventListener("input", () => {
        const now = f.type === "colour" ? input.value : Number(input.value);
        out.textContent = String(now);
        if (now === (looks.now[f.key] ?? f.value)) delete lookEdit[f.key];
        else lookEdit[f.key] = now;
        knob.classList.toggle("changed", f.key in lookEdit);
        lookBar();
      });
      return knob;
    })));
  }
  const apply = el("button", { class: "primary", id: "look-apply" }, "apply");
  const discard = el("button", { id: "look-discard" }, "discard");
  const own = el("button", { title: "every knob as vvoid has it, untouched (then apply)" }, "vvoid's own");
  apply.disabled = discard.disabled = true;
  own.disabled = !can;
  apply.addEventListener("click", () => putLook({ now: { ...looks.now, ...lookEdit } }, live ? "applied: seen now" : "kept: seen when vvoid starts"));
  discard.addEventListener("click", () => ((lookEdit = {}), renderLook()));
  own.addEventListener("click", () => {
    lookEdit = {};
    for (const f of fields) if ((looks.now[f.key] ?? f.value) !== f.value) lookEdit[f.key] = f.value;
    renderLook();
  });
  box.prepend(el("div", { class: "bar" }, apply, discard, own));
  const names = Object.keys(looks.saves ?? {});
  box.append(el("div", { class: "look-group" }, el("h3", {}, "saves"),
    names.length ? el("div", { class: "saves" }, names.map((name) => el("div", { class: "save" },
      el("span", {}, name),
      looks.saber?.includes(name) && el("em", {}, "saber platform"),
      el("button", { disabled: !can, title: "its knobs here (then apply)", onclick: () => {
        lookEdit = {};
        for (const f of fields) {
          const v = looks.saves[name][f.key] ?? f.value;
          if (v !== (looks.now[f.key] ?? f.value)) lookEdit[f.key] = v;
        }
        renderLook();
        toast(`${name}: its knobs are set here; apply to keep them`);
      } }, "use"),
      el("button", { class: "quiet", disabled: !can, onclick: () => {
        if (!confirm(`Delete the save "${name}"?`)) return;
        const saves = { ...looks.saves };
        delete saves[name];
        putLook({ saves }, `${name}: deleted`);
      } }, "delete"))))
      : el("p", { class: "empty" }, "None yet: an admin saves them in the void (Tab, then look).")));
  lookBar();
}
function lookBar() {
  const n = Object.keys(lookEdit).length, can = !lookData.live || lookData.admin;
  $("#look-apply").disabled = !n || !can;
  $("#look-discard").disabled = !n;
  $("#look-apply").textContent = n ? `apply ${n}` : "apply";
}
async function putLook(body, said) {
  try {
    const { looks, live } = await api("look", { method: "PUT", body });
    lookData.looks = looks;
    lookData.live = live;
    lookEdit = {};
    toast(said);
  } catch (err) {
    toast(err.message, true);
  }
  renderLook();
}

// ---- .env, as it is ----
let envVersion = null, envDirty = false;
async function loadEnv() {
  try {
    const { version, text } = await api("env");
    envVersion = version;
    $("#env-text").value = text;
    envDirty = false;
    envBar();
  } catch (err) {
    toast(err.message, true);
  }
}
function envBar() {
  $("#env-save").disabled = $("#env-discard").disabled = !envDirty;
}
$("#env-text").addEventListener("input", () => ((envDirty = true), envBar()));
$("#env-discard").addEventListener("click", loadEnv);
$("#env-save").addEventListener("click", async () => {
  try {
    const { version, text } = await api("env", { method: "PUT", body: { base: envVersion, text: $("#env-text").value } });
    envVersion = version;
    $("#env-text").value = text;
    envDirty = false;
    envBar();
    toast(vvoid?.state === "running" ? "saved: restart vvoid for it to count" : "saved");
    await loadSettings();
    poll();
  } catch (err) {
    toast(err.message, true);
  }
});

// ---- leaving with something unsaved ----
const unsaved = () => pending.size > 0 || envDirty || (lookData && Object.keys(lookEdit).length > 0);
addEventListener("beforeunload", (ev) => {
  if (unsaved()) ev.preventDefault();
});

// ---- the start: a key in the link (#key=…, never sent anywhere but here), a session kept, or the form ----
async function show() {
  $("#login").hidden = true;
  $("#app").hidden = false;
  tab(store.get("vvoid-panel-tab"));
  await Promise.all([loadSettings(), poll()]);
}
(async () => {
  const key = new URLSearchParams(location.hash.slice(1)).get("key");
  if (key) {
    history.replaceState(null, "", location.pathname);
    try {
      return await in_(key);
    } catch (err) {
      $("#login .error").textContent = err.message;
    }
  } else if (token) {
    try {
      await api("state?since=999999999");
      return show();
    } catch {}
  }
  out_();
})();
