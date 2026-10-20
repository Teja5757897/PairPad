// Runs code safely inside a Web Worker (JavaScript, Python) or returns HTML for a preview.
export const RUNNABLE = ["javascript", "python", "html"];

const JS_WORKER = `
const fmt = (a) => a.map((x) => { if (typeof x === "string") return x; try { return JSON.stringify(x); } catch (e) { return String(x); } }).join(" ");
for (const k of ["log", "info", "warn", "error"]) console[k] = (...a) => postMessage({ k: k, m: fmt(a) });
onmessage = async (e) => {
  try { const AF = Object.getPrototypeOf(async function () {}).constructor; await new AF(e.data)(); }
  catch (err) { postMessage({ k: "error", m: String(err) }); }
  postMessage({ k: "done" });
};`;

const PY_URL = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
const PY_WORKER = `
importScripts("${PY_URL}pyodide.js");
onmessage = async (e) => {
  try {
    const py = await loadPyodide({ indexURL: "${PY_URL}" });
    py.setStdout({ batched: (s) => postMessage({ k: "log", m: s }) });
    py.setStderr({ batched: (s) => postMessage({ k: "error", m: s }) });
    await py.runPythonAsync(e.data);
  } catch (err) { postMessage({ k: "error", m: String(err.message || err) }); }
  postMessage({ k: "done" });
};`;

function runInWorker(src, code, limitMs) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const w = new Worker(url);
    const lines = [];
    let timer;
    const finish = (extra) => {
      clearTimeout(timer);
      w.terminate();
      URL.revokeObjectURL(url);
      if (extra) lines.push(extra);
      resolve(lines);
    };
    timer = setTimeout(() => finish({ k: "error", m: `Stopped: the code ran for more than ${limitMs / 1000} seconds.` }), limitMs);
    w.onmessage = (e) => (e.data.k === "done" ? finish() : lines.length < 500 && lines.push(e.data));
    w.onerror = (e) => finish({ k: "error", m: e.message || "The code could not run." });
    w.postMessage(code);
  });
}

export async function runCode(language, code) {
  if (language === "javascript") return { lines: await runInWorker(JS_WORKER, code, 5000) };
  if (language === "python") return { lines: await runInWorker(PY_WORKER, code, 30000) };
  if (language === "html") return { html: code };
  return { lines: [{ k: "error", m: "Run supports JavaScript, Python and HTML." }] };
}
