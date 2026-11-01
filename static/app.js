"use strict";
const $ = id => document.getElementById(id);
const root = document.documentElement;
const css = v => getComputedStyle(root).getPropertyValue(v).trim();
const RULES = { r38: "Simpson's 3/8", r13: "Simpson's 1/3", trap: "Trapezoidal" };
const PRESETS = [
  { label: "sin(x) on [0, π]", f: "sin(x)", a: "0", b: "pi", n: 10 },
  { label: "x² on [0, 3]", f: "x^2", a: "0", b: "3", n: 8 },
  { label: "eˣ on [0, 1]", f: "exp(x)", a: "0", b: "1", n: 11 },
  { label: "1/x on [1, 2]", f: "1/x", a: "1", b: "2", n: 9 }
];
let chart = null, mode = "data", lastRun = null;

/* ---------- numerical methods ---------- */
// How many intervals each rule covers.
// "all": uses 3/8, 1/3 and trapezoid together (needs 6+ intervals). "best": avoids the trapezoid.
function split(n, strat) {
  if (n === 1) return { n38: 0, n13: 0, trap: 1 };
  if (strat === "all" && n >= 6) {
    const t = n === 7 ? 2 : 1, m = n - t, b = (2 * m) % 3 || 3, a = (m - 2 * b) / 3;
    return { n38: 3 * a, n13: 2 * b, trap: t };
  }
  const n13 = [0, 4, 2][n % 3];
  return { n38: n - n13, n13, trap: 0 };
}
function planRules(n, strat) {
  const s = split(n, strat);
  return [].concat(Array(s.n38).fill("r38"), Array(s.n13).fill("r13"), Array(s.trap).fill("trap"));
}
function breakdown(y, h, strat) {
  const n = y.length - 1, s = split(n, strat), p = { r38: [0, 0], r13: [0, 0], trap: [0, 0] };
  let i = 0;
  for (let k = 0; k < s.n38; k += 3, i += 3) { p.r38[0] += 3; p.r38[1] += 3*h/8 * (y[i] + 3*y[i+1] + 3*y[i+2] + y[i+3]); }
  for (let k = 0; k < s.n13; k += 2, i += 2) { p.r13[0] += 2; p.r13[1] += h/3 * (y[i] + 4*y[i+1] + y[i+2]); }
  for (let k = 0; k < s.trap; k++, i++) { p.trap[0] += 1; p.trap[1] += h/2 * (y[i] + y[i+1]); }
  return p;
}
const hybridArea = (y, h, strat) => Object.values(breakdown(y, h, strat)).reduce((s, p) => s + p[1], 0);
const trapArea = (y, h) => h * (y.reduce((s, v) => s + v, 0) - (y[0] + y[y.length - 1]) / 2);
function simpson13(y, h) { let s = y[0] + y[y.length - 1]; for (let i = 1; i < y.length - 1; i++) s += (i % 2 ? 4 : 2) * y[i]; return s * h / 3; }
function simpson38(y, h) { let s = y[0] + y[y.length - 1]; for (let i = 1; i < y.length - 1; i++) s += (i % 3 ? 3 : 2) * y[i]; return 3 * h / 8 * s; }

/* ---------- reading f(x) safely (whitelisted characters and names only) ---------- */
const FN = new Set(["sin", "cos", "tan", "asin", "acos", "atan", "exp", "sqrt", "abs"]);
function compile(expr) {
  const s = String(expr).toLowerCase().replace(/\s+/g, "");
  if (!s) throw new Error("Enter a function of x, for example sin(x).");
  if (!/^[0-9a-z+\-*\/^().]+$/.test(s)) throw new Error("f(x) contains unsupported characters.");
  try {
    const code = s.replace(/[a-z]+/g, id => {
      if (id === "x") return "x";
      if (id === "pi") return "Math.PI";
      if (id === "e") return "Math.E";
      if (id === "ln") return "Math.log";
      if (id === "log") return "Math.log10";
      if (FN.has(id)) return "Math." + id;
      throw new Error("Unknown name '" + id + "'.");
    }).replace(/\^/g, "**");
    const f = new Function("x", "return (" + code + ");");
    f(1);
    return f;
  } catch (e) {
    throw new Error(e instanceof SyntaxError ? "Could not read f(x). Use * for multiplication, e.g. 2*x, and brackets for negatives, e.g. -(x^2)." : e.message);
  }
}
function num(s) { const v = compile(s)(0); if (!isFinite(v)) throw new Error("Invalid value: " + s); return v; }
function reference(f, a, b) {   // high-resolution Simpson, used as the comparison value
  const N = 20000, h = (b - a) / N; let s = f(a) + f(b);
  for (let i = 1; i < N; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return s * h / 3;
}
const parseY = t => t.split(/[\s,;]+/).map(parseFloat).filter(v => !isNaN(v));

/* ---------- input handling ---------- */
function setMode(m) {
  mode = m;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.mode === m));
  $("modeData").hidden = m !== "data"; $("modeFunc").hidden = m !== "func";
}
function readInputs() {
  const strat = $("strategy").value;
  if (mode === "func") {
    const f = compile($("fx").value), a = num($("fa").value), b = num($("fb").value), n = parseInt($("fn").value, 10);
    if (!(b > a)) throw new Error("b must be greater than a.");
    if (!(n >= 2 && n <= 5000)) throw new Error("Intervals must be a whole number from 2 to 5000.");
    const h = (b - a) / n, y = Array.from({ length: n + 1 }, (_, k) => f(a + k * h));
    const bad = y.findIndex(v => !isFinite(v));
    if (bad >= 0) throw new Error("f(x) is not defined at x = " + +(a + bad * h).toFixed(6) + ".");
    const ref = reference(f, a, b);
    return { y, h, hStr: String(h), x0: a, ref: isFinite(ref) ? ref : null, strat,
             state: { mode, strat, f: $("fx").value, a: $("fa").value, b: $("fb").value, n: String(n) } };
  }
  const hStr = $("step_h").value.trim(), h = parseFloat(hStr), y = parseY($("y_array").value);
  if (isNaN(h) || h <= 0) throw new Error("Step size h must be a number greater than 0.");
  if (y.length < 2) throw new Error("Enter at least 2 valid Y values.");
  return { y, h, hStr, x0: 0, ref: null, strat, state: { mode, strat, h: hStr, y: $("y_array").value } };
}
function showError(msg) { const e = $("errorBox"); e.textContent = msg; e.style.display = msg ? "block" : "none"; }

/* ---------- run ---------- */
async function run() {
  showError("");
  let inp;
  try { inp = readInputs(); } catch (e) { return showError(e.message); }
  if (typeof Chart === "undefined") return showError("Chart.js did not load. Check your internet connection or add static/chart.umd.js.");

  const btn = $("runBtn"); btn.disabled = true; btn.textContent = "Calculating...";
  try {
    let data = null, source = "C++ backend (Crow)";
    try {
      const res = await fetch("api/calculate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ h: inp.hStr, raw_y: inp.y.join(", "), strategy: inp.strat })
      });
      if (res.status === 400) {
        const e = await res.json();
        throw Object.assign(new Error(e.error || "Invalid input."), { input: true });
      }
      if (res.ok && (res.headers.get("content-type") || "").includes("json")) data = await res.json();
    } catch (e) { if (e.input) throw e; }
    if (data) {   // warn if an old build of the C++ server picks different rules than this page
      const mine = hybridArea(inp.y, inp.h, inp.strat);
      if (Math.abs(mine - Number(data.area)) > 1e-9 * Math.max(1, Math.abs(mine))) source += " - differs from the page's own calculation, rebuild main.cpp";
    }
    if (!data) {   // no backend reachable (GitHub Pages, local file): use the JavaScript port
      data = { area: hybridArea(inp.y, inp.h, inp.strat), slices: inp.y.length - 1, points: inp.y.length };
      source = "in-browser JavaScript port of the same algorithm";
    }
    render(data, inp, source);
    addHistory(inp, Number(data.area));
  } catch (err) {
    console.error(err);
    showError("Calculation failed: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = "Calculate area";
  }
}

/* ---------- output ---------- */
function addRow(tbody, cells, cls) {
  const tr = document.createElement("tr"); if (cls) tr.className = cls;
  cells.forEach(c => { const td = document.createElement("td"); if (c.cls) td.className = c.cls; if (c.dot) { const d = document.createElement("span"); d.className = "dot"; d.style.setProperty("--c", "var(--" + c.dot + ")"); td.appendChild(d); } td.appendChild(document.createTextNode(c.t)); tr.appendChild(td); });
  tbody.appendChild(tr);
}
function render(data, inp, source) {
  lastRun = { data, inp, source };
  const { y, h, ref } = inp, area = Number(data.area), n = y.length - 1;
  $("results").style.display = "block";
  $("sourceNote").textContent = "Computed by: " + source;
  $("resArea").textContent = area.toFixed(6);
  $("resIntervals").textContent = data.slices; $("resPoints").textContent = data.points; $("resH").textContent = +h.toFixed(6);

  const ex = $("exactBox");
  if (ref !== null) {
    ex.style.display = "block";
    ex.innerHTML = "Reference value <code>" + ref.toFixed(6) + "</code> (high-resolution Simpson, 20,000 intervals). Hybrid error <code>" + Math.abs(area - ref).toExponential(3) + "</code>.";
  } else ex.style.display = "none";

  const parts = breakdown(y, h, inp.strat), rows = $("breakdown"); rows.innerHTML = "";
  Object.keys(RULES).forEach(k => { if (parts[k][0]) addRow(rows, [{ t: RULES[k], dot: k }, { t: String(parts[k][0]), cls: "num" }, { t: parts[k][1].toFixed(6), cls: "num" }]); });

  const methods = [
    ["Hybrid engine (this project)", area],
    ["Trapezoidal rule only", trapArea(y, h)],
    ["Simpson's 1/3 only", n % 2 === 0 ? simpson13(y, h) : null, "needs an even number of intervals"],
    ["Simpson's 3/8 only", n % 3 === 0 ? simpson38(y, h) : null, "needs a multiple of 3 intervals"]
  ];
  let best = -1, bestErr = Infinity;
  if (ref !== null) methods.forEach((m, i) => { if (m[1] !== null && Math.abs(m[1] - ref) < bestErr - 1e-15) { bestErr = Math.abs(m[1] - ref); best = i; } });
  const cmp = $("compare"); cmp.innerHTML = "";
  methods.forEach((m, i) => {
    if (m[1] === null) addRow(cmp, [{ t: m[0] }, { t: m[2], cls: "na" }, { t: "-", cls: "num" }]);
    else addRow(cmp, [{ t: m[0] }, { t: m[1].toFixed(6), cls: "num" }, { t: ref !== null ? Math.abs(m[1] - ref).toExponential(2) : "-", cls: "num" }], i === best ? "best" : "");
  });

  drawChart(inp, planRules(n, inp.strat));
}
function drawChart(inp, plan) {
  const { y, h, x0 } = inp;
  Chart.defaults.color = css("--muted"); Chart.defaults.borderColor = css("--line");
  $("emptyState").hidden = true; $("chartWrap").hidden = false; $("legend").hidden = false;
  if (chart) chart.destroy();
  chart = new Chart($("profileChart").getContext("2d"), {
    type: "line",
    data: {
      labels: y.map((_, i) => +(x0 + i * h).toFixed(4)),
      datasets: [{
        label: "y", data: y, fill: true, backgroundColor: "rgba(128,128,128,0.12)", borderWidth: 3, tension: 0,
        pointRadius: y.length > 40 ? 0 : 4, pointBackgroundColor: css("--card"), pointBorderColor: css("--ink"),
        segment: { borderColor: c => css("--" + plan[c.p0DataIndex]) }
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? false : { duration: 500 },
      plugins: { legend: { display: false } },
      scales: { x: { title: { display: true, text: "x" }, grid: { display: false } }, y: { title: { display: true, text: "y" } } }
    }
  });
}

/* ---------- history (kept in this browser only) ---------- */
function loadHist() { try { return JSON.parse(localStorage.getItem("hist") || "[]"); } catch (e) { return []; } }
function saveHist(l) { try { localStorage.setItem("hist", JSON.stringify(l)); } catch (e) {} }
function addHistory(inp, area) {
  const s = inp.state, list = loadHist();
  const label = s.mode === "func" ? "f(x) = " + s.f + " on [" + s.a + ", " + s.b + "], n = " + s.n : inp.y.length + " data points, h = " + s.h;
  if (!(list[0] && list[0].label === label && list[0].area === area)) list.unshift({ label, area, state: s });
  saveHist(list.slice(0, 8)); renderHistory();
}
function renderHistory() {
  const box = $("history"), list = loadHist(); box.innerHTML = "";
  if (!list.length) { const p = document.createElement("div"); p.className = "none"; p.textContent = "Your calculations will appear here."; box.appendChild(p); return; }
  list.forEach(item => {
    const b = document.createElement("button"); b.type = "button"; b.className = "hist-item";
    const v = document.createElement("b"); v.textContent = item.area.toFixed(6);
    b.appendChild(v); b.appendChild(document.createTextNode(item.label));
    b.onclick = () => applyState(item.state);
    box.appendChild(b);
  });
}
function applyState(s) {
  setMode(s.mode); $("strategy").value = s.strat || "all";
  if (s.mode === "func") { $("fx").value = s.f; $("fa").value = s.a; $("fb").value = s.b; $("fn").value = s.n; }
  else { $("step_h").value = s.h; $("y_array").value = s.y; }
  run();
}

/* ---------- export, copy, theme ---------- */
function exportCsv() {
  if (!lastRun) return;
  const { inp, data } = lastRun;
  const rows = ["x,y"].concat(inp.y.map((v, i) => (inp.x0 + i * inp.h) + "," + v));
  rows.push("", "hybrid_area," + data.area, "intervals," + data.slices, "step_h," + inp.h);
  const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = "integration-result.csv"; a.click(); URL.revokeObjectURL(url);
}
async function copyResult(btn) {
  if (!lastRun) return;
  const t = "Hybrid area = " + Number(lastRun.data.area).toFixed(6) + " (" + lastRun.data.slices + " intervals, h = " + +lastRun.inp.h.toFixed(6) + ")";
  const old = btn.textContent;
  try { await navigator.clipboard.writeText(t); btn.textContent = "Copied"; } catch (e) { btn.textContent = "Copy failed"; }
  setTimeout(() => { btn.textContent = old; }, 1500);
}
function setTheme(t) {
  root.dataset.theme = t; $("themeBtn").textContent = t === "dark" ? "Light mode" : "Dark mode";
  try { localStorage.setItem("theme", t); } catch (e) {}
  if (lastRun) render(lastRun.data, lastRun.inp, lastRun.source);
}

/* ---------- wiring ---------- */
PRESETS.forEach(p => {
  const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = p.label;
  b.onclick = () => { $("fx").value = p.f; $("fa").value = p.a; $("fb").value = p.b; $("fn").value = p.n; run(); };
  $("presets").appendChild(b);
});
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => setMode(t.dataset.mode)));
$("runBtn").addEventListener("click", run);
$("csvBtn").addEventListener("click", exportCsv);
$("copyBtn").addEventListener("click", e => copyResult(e.currentTarget));
$("printBtn").addEventListener("click", () => window.print());
$("clearHist").addEventListener("click", () => { saveHist([]); renderHistory(); });
$("themeBtn").addEventListener("click", () => setTheme(root.dataset.theme === "dark" ? "light" : "dark"));
$("csv_file").addEventListener("change", e => {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = ev => { $("y_array").value = parseY(ev.target.result).join(", "); };
  r.readAsText(file);
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && ((e.target.tagName === "INPUT" && e.target.type === "text") || e.ctrlKey)) { e.preventDefault(); run(); }
});
let saved = null; try { saved = localStorage.getItem("theme"); } catch (e) {}
setTheme(saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
renderHistory();
