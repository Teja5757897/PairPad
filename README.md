# Pairpad

**A real-time collaborative code editor. Write, run, comment and talk through code together in a shared room.**

Pairpad lets several people edit the same file at once, see each other's cursors, run the code, leave comments on specific lines and discuss it over voice chat. No sign-up is needed: pick a name, share the room link and start coding.

<!-- Add a screenshot or GIF here: ![Pairpad screenshot](docs/screenshot.png) -->

## Features

- **Live collaboration**: everyone edits the same file at the same time, with colored cursors and selections showing who is typing where.
- **Rooms and invite links**: every room has its own document. Copy the invite link and send it to anyone.
- **Run code**: JavaScript, Python and HTML run right in the browser. The result is shared, so everyone in the room sees the last output.
- **Voice chat**: join voice, mute and unmute, and talk while you code. Audio goes directly between browsers (WebRTC).
- **Line comments**: attach a comment to any line. A marker appears in the editor and follows the line as the code changes.
- **Code suggestions**: autocomplete, ready-made snippets, and red error underlines for JavaScript and TypeScript.
- **Shared language**: switch the language (JavaScript, TypeScript, Python, HTML, CSS, JSON, Java, C++, Go, Markdown) and it changes for everyone.
- **Download**: save the current code as a file.

## Tech stack

| Part | Technology |
|---|---|
| Frontend | React, Vite, Monaco Editor |
| Real-time sync | Yjs, y-socket.io, y-monaco |
| Backend | Node.js, Express, Socket.IO |
| Voice | WebRTC (signalling through Socket.IO) |
| Running code | Web Workers, Pyodide (Python in the browser) |
| Deployment | Docker, Render, Netlify |

## How it works

- The text, comments, selected language and last run result live in a shared **Yjs** document, which merges everyone's edits without conflicts.
- The **Express and Socket.IO** server relays document updates between people in the same room. It also passes the connection messages that let two browsers start a voice call.
- Code runs inside a **Web Worker** in your own browser, never on the server, and is stopped if it runs too long.

## Project structure

```
pairpad/
├── Backend/                  Express + Socket.IO + Yjs server
│   ├── server.js
│   └── package.json
├── frontend/vite-project/    React app
│   └── src/
│       ├── App.jsx           join screen, editor, comments, output, voice panel
│       ├── runner.js         runs JavaScript, Python and HTML
│       ├── useVoice.js       voice chat (WebRTC)
│       ├── monacoSetup.js    suggestions, snippets and editor options
│       └── config.js         server address
├── Dockerfile
└── docker-compose.yml
```

## Limitations

- Run supports JavaScript, Python and HTML. Other languages get suggestions and comments but cannot run.
- Python downloads about 10 MB the first time it runs.
- Voice uses a public STUN server only, so on some strict networks two people may not connect.
- Voice is peer-to-peer, so it works best for small groups.
- Rooms have no passwords, so anyone with a room name can join.
- Documents are kept in server memory, so they are lost when the server restarts.

## Ideas for the future

- A chat panel
- Running more languages through a code-execution service
- Password-protected rooms
- Saving documents to a database
