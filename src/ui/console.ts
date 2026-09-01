/**
 * The operator console.
 *
 * Served as one self-contained document rather than a bundled SPA. It is an
 * internal tool with a handful of controls; a build step, a framework and a
 * dependency tree would cost more than they return, and a reviewer can read
 * the whole thing in one sitting.
 */
export const CONSOLE_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>OneRoster Sandbox — console</title>
<style>
  :root {
    --ink:#0f172a; --dim:#475569; --faint:#64748b; --line:#e2e8f0;
    --bg:#f8fafc; --paper:#fff; --blue:#2563eb; --amber:#b45309; --mint:#059669;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  header { background:var(--ink); color:#fff; padding:1.25rem 2rem; }
  header h1 { margin:0; font-size:1.15rem; font-weight:700; letter-spacing:-0.01em; }
  header p { margin:.35rem 0 0; color:#94a3b8; font-size:13px; }
  main { max-width:1100px; margin:0 auto; padding:2rem; }
  section { background:var(--paper); border:1px solid var(--line); margin-bottom:1.5rem; }
  section > h2 { margin:0; padding:.9rem 1.25rem; border-bottom:1px solid var(--line);
                 font-size:12px; font-weight:700; letter-spacing:.1em; text-transform:uppercase;
                 color:var(--faint); font-family:var(--mono); }
  .body { padding:1.25rem; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th { text-align:left; padding:.55rem 1rem .55rem 0; border-bottom:1px solid var(--ink);
       font-family:var(--mono); font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--faint); }
  td { padding:.7rem 1rem .7rem 0; border-bottom:1px solid var(--line); vertical-align:top; }
  code, .mono { font-family:var(--mono); font-size:12.5px; }
  .pill { display:inline-block; border:1px solid var(--line); padding:.15rem .45rem;
          font-family:var(--mono); font-size:11px; color:var(--dim); }
  .fault { border-bottom:1px solid var(--line); padding:1rem 0; display:grid;
           grid-template-columns:2.5rem 1fr; gap:.25rem 1rem; align-items:start; }
  .fault:last-child { border-bottom:0; }
  .fault h3 { margin:0; font-size:14.5px; }
  .fault p { margin:.3rem 0 0; color:var(--dim); font-size:13px; }
  .fault .gate { margin-top:.4rem; font-family:var(--mono); font-size:11px; color:var(--blue); }
  .fault input[type=number], .fault input[type=text] { width:100%; margin-top:.5rem; padding:.35rem .5rem;
      border:1px solid var(--line); font-family:var(--mono); font-size:12.5px; }
  button { border:1px solid var(--ink); background:var(--ink); color:#fff; padding:.55rem 1rem;
           font-size:13.5px; font-weight:600; cursor:pointer; }
  button.ghost { background:transparent; color:var(--ink); }
  button:disabled { opacity:.45; cursor:default; }
  .row { display:flex; gap:.6rem; align-items:center; flex-wrap:wrap; }
  .muted { color:var(--faint); font-size:13px; }
  .ok { color:var(--mint); } .warn { color:var(--amber); }
  input[type=checkbox] { width:1.1rem; height:1.1rem; margin-top:.15rem; }
  #keybar { background:#fff7ed; border-bottom:1px solid #fed7aa; padding:.8rem 2rem; font-size:13.5px; }
  #keybar input { font-family:var(--mono); padding:.35rem .5rem; border:1px solid var(--line); width:22rem; }
</style>
</head>
<body>
<header>
  <h1>OneRoster Sandbox</h1>
  <p>A conformant provider that misbehaves on demand, so a consumer's defences can be demonstrated rather than asserted.</p>
</header>
<div id="keybar">
  <div class="row">
    <label for="adminkey">Admin key</label>
    <input id="adminkey" type="password" placeholder="x-admin-key" autocomplete="off" />
    <button id="connect">Connect</button>
    <span id="status" class="muted"></span>
  </div>
</div>
<main>
  <section><h2>Dataset</h2><div class="body" id="datasets">Not connected.</div></section>
  <section><h2>Consumers</h2><div class="body" id="clients">Not connected.</div></section>
  <section><h2>Fault injection</h2><div class="body" id="faults">Select a consumer above.</div></section>
  <section><h2>Recent requests</h2><div class="body" id="log">Not connected.</div></section>
</main>
<script>
const $ = (id) => document.getElementById(id);
let KEY = sessionStorage.getItem("adminKey") || "";
let CATALOGUE = [];
let SELECTED = null;

async function api(path, options = {}) {
  const res = await fetch("/admin" + path, {
    ...options,
    headers: { "x-admin-key": KEY, "content-type": "application/json", ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json();
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }

async function refresh() {
  $("status").textContent = "loading…";
  try {
    const [datasets, clients, catalogue, log] = await Promise.all([
      api("/datasets"), api("/clients"), api("/faults/catalogue"), api("/log"),
    ]);
    CATALOGUE = catalogue.faults;
    renderDatasets(datasets.datasets);
    renderClients(clients.clients);
    renderLog(log.entries);
    $("status").innerHTML = '<span class="ok">connected</span>';
    sessionStorage.setItem("adminKey", KEY);
  } catch (err) {
    $("status").innerHTML = '<span class="warn">' + esc(err.message) + "</span>";
  }
}

function renderDatasets(list) {
  if (!list.length) { $("datasets").textContent = "No datasets seeded."; return; }
  $("datasets").innerHTML = list.map((d) => {
    const s = d.summary;
    const cells = Object.entries(s).map(([k, v]) =>
      '<td><div class="mono" style="color:var(--faint);font-size:11px">' + esc(k) + '</div><strong>' + v + "</strong></td>").join("");
    return '<div><strong>' + esc(d.name) + '</strong> <span class="pill">' + esc(d.id) + '</span> ' +
      '<span class="pill">' + esc(d.schoolYear) + '</span> <span class="pill">seed ' + d.seed + '</span>' +
      '<table style="margin-top:1rem"><tr>' + cells + "</tr></table></div>";
  }).join("");
}

function renderClients(list) {
  if (!list.length) { $("clients").innerHTML = '<p class="muted">No consumers yet.</p>' + newClientForm(); return; }
  const rows = list.map((c) => {
    const active = Object.entries(c.faults).filter(([k, v]) =>
      v !== null && v !== false && !(Array.isArray(v) && v.length === 0) && !(k === "latencyMs" && v === 0)).map(([k]) => k);
    return "<tr>" +
      "<td><strong>" + esc(c.label) + "</strong><br><code>" + esc(c.clientId) + "</code></td>" +
      "<td>" + (c.sharedSchools ? c.sharedSchools.length + " schools" : '<span class="muted">all schools</span>') + "</td>" +
      "<td>" + (active.length ? active.map((a) => '<span class="pill warn">' + esc(a) + "</span>").join(" ") : '<span class="muted">none</span>') + "</td>" +
      '<td><button class="ghost" data-select="' + esc(c.clientId) + '">Faults</button></td></tr>";
  }).join("");
  $("clients").innerHTML =
    "<table><tr><th>Consumer</th><th>Share</th><th>Active faults</th><th></th></tr>" + rows + "</table>" + newClientForm();
  document.querySelectorAll("[data-select]").forEach((b) =>
    b.addEventListener("click", () => selectClient(b.dataset.select, list)));
}

function newClientForm() {
  return '<div class="row" style="margin-top:1.25rem"><input id="newlabel" type="text" placeholder="New consumer label" style="padding:.4rem .5rem;border:1px solid var(--line)" />' +
    '<button id="createclient">Create consumer</button></div><div id="newsecret"></div>';
}

function selectClient(clientId, list) {
  SELECTED = list.find((c) => c.clientId === clientId);
  renderFaults();
}

function renderFaults() {
  if (!SELECTED) { $("faults").textContent = "Select a consumer above."; return; }
  const f = SELECTED.faults;
  const controls = CATALOGUE.map((entry, i) => {
    const key = entry.key;
    let input;
    if (key === "truncatePercent" || key === "duplicatePercent") {
      input = '<input type="number" min="0" max="100" placeholder="percent (blank = off)" data-fault="' + key + '" value="' + (f[key] ?? "") + '" />';
    } else if (key === "latencyMs") {
      input = '<input type="number" min="0" max="10000" placeholder="milliseconds" data-fault="' + key + '" value="' + (f[key] || 0) + '" />';
    } else if (key === "dropSchools" || key === "failCollections") {
      input = '<input type="text" placeholder="comma separated" data-fault="' + key + '" value="' + esc((f[key] || []).join(",")) + '" />';
    } else {
      input = "";
    }
    const toggle = input ? "" :
      '<input type="checkbox" data-fault="' + key + '"' + (f[key] ? " checked" : "") + " />";
    return '<div class="fault"><div>' + (toggle || '<span class="mono muted">' + String(i + 1).padStart(2, "0") + "</span>") + "</div>" +
      "<div><h3>" + esc(entry.label) + "</h3><p>" + esc(entry.detail) + "</p>" +
      '<div class="gate">Tests the consumer gate: ' + esc(entry.gate) + "</div>" + input + "</div></div>";
  }).join("");
  $("faults").innerHTML =
    '<p class="muted">Faults for <code>' + esc(SELECTED.label) + "</code>. They apply to every request that consumer makes, immediately.</p>" +
    controls +
    '<div class="row" style="margin-top:1.25rem"><button id="savefaults">Apply faults</button>' +
    '<button class="ghost" id="clearfaults">Clear all</button><span id="faultstatus" class="muted"></span></div>';

  $("savefaults").addEventListener("click", saveFaults);
  $("clearfaults").addEventListener("click", async () => {
    await api("/clients/" + SELECTED.clientId + "/faults", { method: "DELETE" });
    await refresh(); SELECTED = null; $("faults").textContent = "Cleared. Select a consumer above.";
  });
}

async function saveFaults() {
  const payload = {};
  document.querySelectorAll("[data-fault]").forEach((el) => {
    const key = el.dataset.fault;
    if (el.type === "checkbox") payload[key] = el.checked;
    else if (key === "dropSchools" || key === "failCollections")
      payload[key] = el.value.split(",").map((s) => s.trim()).filter(Boolean);
    else if (key === "latencyMs") payload[key] = Number(el.value) || 0;
    else payload[key] = el.value === "" ? null : Number(el.value);
  });
  $("faultstatus").textContent = "saving…";
  await api("/clients/" + SELECTED.clientId + "/faults", { method: "PUT", body: JSON.stringify(payload) });
  $("faultstatus").innerHTML = '<span class="ok">applied</span>';
  await refresh();
}

function renderLog(entries) {
  if (!entries.length) { $("log").innerHTML = '<p class="muted">No requests yet.</p>'; return; }
  $("log").innerHTML = "<table><tr><th>When</th><th>Request</th><th>Status</th><th>Faults applied</th></tr>" +
    entries.slice(0, 40).map((e) =>
      "<tr><td class='mono'>" + esc(String(e.at).slice(11, 19)) + "</td>" +
      "<td class='mono'>" + esc(e.method) + " " + esc(e.path) + "</td>" +
      "<td class='mono'>" + e.status + "</td>" +
      "<td class='mono'>" + esc((JSON.parse(e.faults_applied_json || "[]") || []).join(", ") || "-") + "</td></tr>").join("") +
    "</table>";
}

$("connect").addEventListener("click", () => { KEY = $("adminkey").value.trim(); refresh(); });
$("adminkey").addEventListener("keydown", (e) => { if (e.key === "Enter") $("connect").click(); });
document.addEventListener("click", async (e) => {
  if (e.target && e.target.id === "createclient") {
    const label = $("newlabel").value.trim() || "unnamed consumer";
    const datasets = await api("/datasets");
    const datasetId = datasets.datasets[0] && datasets.datasets[0].id;
    if (!datasetId) { alert("Seed a dataset first."); return; }
    const created = await api("/clients", { method: "POST", body: JSON.stringify({ label, datasetId }) });
    $("newsecret").innerHTML = '<div style="margin-top:1rem;padding:1rem;background:#fffbeb;border:1px solid #fde68a">' +
      "<strong>Store this now, it is not recoverable.</strong><br>" +
      "<code>client_id: " + esc(created.clientId) + "</code><br><code>client_secret: " + esc(created.clientSecret) + "</code></div>";
    await refresh();
  }
});
if (KEY) { $("adminkey").value = KEY; refresh(); }
</script>
</body>
</html>`;
