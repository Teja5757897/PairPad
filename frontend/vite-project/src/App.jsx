import { Editor } from "@monaco-editor/react";
import { MonacoBinding } from "y-monaco";
import { useMemo, useState, useEffect } from "react";
import * as Y from "yjs";
import { SocketIOProvider } from "y-socket.io";
import { SERVER_URL } from "./config";
import { runCode, RUNNABLE } from "./runner";
import { useVoice } from "./useVoice";
import { setupMonaco, EDITOR_OPTIONS } from "./monacoSetup";

const COLORS = ["#ff7a59", "#4cc9a4", "#6ea8ff", "#f5c542", "#c084fc", "#ff6b9d", "#5eead4", "#fb923c"];
const LANGUAGES = {
  javascript: "js", typescript: "ts", python: "py", html: "html",
  css: "css", json: "json", java: "java", cpp: "cpp", go: "go", markdown: "md",
};

const colorFor = (name) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
};
const params = () => new URLSearchParams(window.location.search);
const randomId = () => Math.random().toString(36).slice(2, 8);
const timeAgo = (t) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export default function App() {
  const [username, setUsername] = useState(() => params().get("username") || "");
  const [room, setRoom] = useState(() => params().get("room") || "");

  if (!username || !room) {
    return (
      <Join
        defaultRoom={room}
        defaultName={username}
        onJoin={(name, roomId) => {
          setUsername(name);
          setRoom(roomId);
          window.history.pushState({}, "", `?room=${roomId}&username=${encodeURIComponent(name)}`);
        }}
      />
    );
  }
  return <Workspace username={username} room={room} />;
}

function Join({ onJoin, defaultRoom, defaultName }) {
  const submit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = String(f.get("username")).trim();
    const roomId = String(f.get("room")).trim() || randomId();
    if (name) onJoin(name, roomId);
  };
  return (
    <main className="join">
      <div className="join-copy">
        <h1>Pairpad</h1>
        <p>One shared editor. Write, run, comment and talk through code together.</p>
      </div>
      <form onSubmit={submit} className="join-card">
        <label>
          Your name
          <input name="username" defaultValue={defaultName} placeholder="Asha" autoFocus required />
        </label>
        <label>
          Room name
          <input name="room" defaultValue={defaultRoom} placeholder="Leave empty to create a new room" />
        </label>
        <button type="submit">Join room</button>
      </form>
    </main>
  );
}

function Workspace({ username, room }) {
  const [users, setUsers] = useState([]);
  const [status, setStatus] = useState("connecting");
  const [provider, setProvider] = useState(null);
  const [editor, setEditor] = useState(null);
  const [language, setLanguage] = useState("javascript");
  const [output, setOutput] = useState(null);
  const [running, setRunning] = useState(false);
  const [comments, setComments] = useState([]);
  const [lineMap, setLineMap] = useState({});
  const [cursorLine, setCursorLine] = useState(1);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  const ydoc = useMemo(() => new Y.Doc(), []);
  const yText = useMemo(() => ydoc.getText("monaco"), [ydoc]);
  const yMeta = useMemo(() => ydoc.getMap("meta"), [ydoc]);
  const yComments = useMemo(() => ydoc.getArray("comments"), [ydoc]);
  const myColor = colorFor(username);
  const voice = useVoice(room, username);

  // connection + presence
  useEffect(() => {
    const p = new SocketIOProvider(SERVER_URL, room, ydoc, { autoConnect: true });
    p.awareness.setLocalStateField("user", { username, color: myColor });
    p.on("status", ({ status }) => setStatus(status));

    const refresh = () => {
      const states = Array.from(p.awareness.getStates().entries());
      setUsers(states.filter(([, s]) => s.user?.username).map(([id, s]) => ({ id, ...s.user })));
      let css = "";
      states.forEach(([id, s]) => {
        if (!s.user) return;
        css += `.yRemoteSelection-${id}{background:${s.user.color}33}
.yRemoteSelectionHead-${id}{border-left:2px solid ${s.user.color}}
.yRemoteSelectionHead-${id}::after{content:"${s.user.username.replace(/"/g, "")}";background:${s.user.color}}`;
      });
      let tag = document.getElementById("remote-cursors");
      if (!tag) {
        tag = document.createElement("style");
        tag.id = "remote-cursors";
        document.head.appendChild(tag);
      }
      tag.textContent = css;
    };
    p.awareness.on("change", refresh);
    refresh();
    setProvider(p);
    return () => {
      p.awareness.off("change", refresh);
      p.disconnect();
      setProvider(null);
    };
  }, [room, username, ydoc, myColor]);

  // bind editor text + cursors (declared before the comment effect so the model is updated first)
  useEffect(() => {
    if (!editor || !provider) return;
    const binding = new MonacoBinding(yText, editor.getModel(), new Set([editor]), provider.awareness);
    return () => binding.destroy();
  }, [editor, provider, yText]);

  // language + last run result are shared across the room
  useEffect(() => {
    const sync = () => {
      setLanguage(yMeta.get("language") || "javascript");
      setOutput(yMeta.get("run") || null);
    };
    yMeta.observe(sync);
    sync();
    return () => yMeta.unobserve(sync);
  }, [yMeta]);

  // comments list
  useEffect(() => {
    const sync = () => setComments(yComments.toArray());
    yComments.observe(sync);
    sync();
    return () => yComments.unobserve(sync);
  }, [yComments]);

  // follow my cursor line
  useEffect(() => {
    if (!editor) return;
    const d = editor.onDidChangeCursorPosition((e) => setCursorLine(e.position.lineNumber));
    return () => d.dispose();
  }, [editor]);

  // show comment markers in the editor; they move with the code as people type
  useEffect(() => {
    if (!editor) return;
    const model = editor.getModel();
    const col = editor.createDecorationsCollection();
    const draw = () => {
      const next = {};
      col.set(
        comments.map((c) => {
          const abs = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(c.pos), ydoc);
          const line = abs ? model.getPositionAt(abs.index).lineNumber : 1;
          next[c.id] = line;
          return {
            range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
            options: {
              isWholeLine: true,
              className: "comment-line",
              glyphMarginClassName: "comment-glyph",
              glyphMarginHoverMessage: { value: `**${c.author}:** ${c.text}` },
            },
          };
        })
      );
      setLineMap((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    draw();
    yText.observe(draw);
    return () => { yText.unobserve(draw); col.clear(); };
  }, [editor, comments, ydoc, yText]);

  const addComment = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !editor) return;
    const offset = editor.getModel().getOffsetAt({ lineNumber: cursorLine, column: 1 });
    const pos = Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(yText, offset));
    yComments.push([{ id: randomId() + randomId(), pos, author: username, color: myColor, text, at: Date.now() }]);
    setDraft("");
  };
  const removeComment = (id) => {
    const i = yComments.toArray().findIndex((c) => c.id === id);
    if (i >= 0) yComments.delete(i, 1);
  };
  const goToLine = (line) => {
    editor?.revealLineInCenter(line);
    editor?.setPosition({ lineNumber: line, column: 1 });
    editor?.focus();
  };

  const run = async () => {
    setRunning(true);
    const result = await runCode(language, yText.toString());
    yMeta.set("run", { ...result, language, by: username, at: Date.now() });
    setRunning(false);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}?room=${room}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  const download = () => {
    const blob = new Blob([yText.toString()], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${room}.${LANGUAGES[language] || "txt"}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const leave = () => {
    window.history.pushState({}, "", window.location.pathname);
    window.location.reload();
  };

  const canRun = RUNNABLE.includes(language);
  const voiceNames = [...(voice.joined ? [`${username} (you)`] : []), ...Object.values(voice.peers)];

  return (
    <div className="app">
      <header className="bar">
        <div className="brand">Pairpad <span className="room">{room}</span></div>
        <div className="actions">
          <select value={language} onChange={(e) => yMeta.set("language", e.target.value)} aria-label="Language">
            {Object.keys(LANGUAGES).map((l) => <option key={l}>{l}</option>)}
          </select>
          <button className="run" onClick={run} disabled={!canRun || running}
            title={canRun ? "Run the code" : "Run supports JavaScript, Python and HTML"}>
            {running ? "Running…" : "Run"}
          </button>
          <button className="ghost" onClick={download}>Download</button>
          <button onClick={copyLink}>{copied ? "Link copied" : "Copy invite link"}</button>
          <button className="ghost" onClick={leave}>Leave</button>
        </div>
      </header>

      <div className="body">
        <aside className="people">
          <h2>In this room ({users.length})</h2>
          <ul>
            {users.map((u) => (
              <li key={u.id}>
                <span className="avatar" style={{ background: u.color }}>{u.username[0].toUpperCase()}</span>
                {u.username}{u.username === username && <em> (you)</em>}
              </li>
            ))}
          </ul>

          <h2 className="voice-title">Voice</h2>
          {!voice.joined ? (
            <button className="wide" onClick={voice.join}>Join voice</button>
          ) : (
            <div className="voice-controls">
              <button className={voice.muted ? "ghost" : ""} onClick={voice.toggleMute}>{voice.muted ? "Unmute" : "Mute"}</button>
              <button className="ghost" onClick={voice.leave}>Leave voice</button>
            </div>
          )}
          {voice.error && <p className="error">{voice.error}</p>}
          <ul className="voice-list">{voiceNames.map((n) => <li key={n}>🎙 {n}</li>)}</ul>
        </aside>

        <div className="main">
          <section className="editor">
            <Editor
              height="100%"
              language={language}
              defaultValue=""
              theme="vs-dark"
              beforeMount={setupMonaco}
              onMount={setEditor}
              options={EDITOR_OPTIONS}
            />
          </section>

          <section className="output" aria-label="Output">
            <div className="output-head">
              <strong>Output</strong>
              {output && <span>run by {output.by} at {timeAgo(output.at)}</span>}
              {output && <button className="ghost small" onClick={() => yMeta.delete("run")}>Clear</button>}
            </div>
            {!output ? (
              <p className="empty">
                {canRun ? "Press Run to see the result here. Everyone in the room sees it." : "Run supports JavaScript, Python and HTML. Suggestions and comments work in every language."}
              </p>
            ) : output.html !== undefined ? (
              <iframe title="Preview" sandbox="allow-scripts" srcDoc={output.html} />
            ) : (
              <pre>
                {output.lines.length === 0 && <span className="muted">Finished with no output.</span>}
                {output.lines.map((l, i) => <div key={i} className={`out-${l.k}`}>{l.m}</div>)}
              </pre>
            )}
          </section>
        </div>

        <aside className="comments">
          <h2>Comments ({comments.length})</h2>
          <form onSubmit={addComment}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
              placeholder={`Comment on line ${cursorLine}`} aria-label="Comment" />
            <button type="submit" disabled={!draft.trim()}>Comment on line {cursorLine}</button>
          </form>
          <ul>
            {comments.length === 0 && <li className="empty">Click a line in the code, then write a comment. A dot appears next to that line for everyone.</li>}
            {[...comments].sort((a, b) => (lineMap[a.id] || 0) - (lineMap[b.id] || 0)).map((c) => (
              <li key={c.id}>
                <button className="line-link" onClick={() => goToLine(lineMap[c.id] || 1)}>Line {lineMap[c.id] || "?"}</button>
                <p><span className="dot-author" style={{ background: c.color }} />{c.author} <em>{timeAgo(c.at)}</em></p>
                <p>{c.text}</p>
                {c.author === username && <button className="ghost small" onClick={() => removeComment(c.id)}>Delete</button>}
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <footer className="status">
        <span className={`dot ${status}`} />
        {status === "connected" ? "Connected" : status === "connecting" ? "Connecting… the server may take up to 30s to wake up" : "Disconnected, retrying"}
      </footer>
    </div>
  );
}
