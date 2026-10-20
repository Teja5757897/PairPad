import express from "express";
import { createServer } from "http";
import { fileURLToPath } from "url";
import path from "path";
import { Server } from "socket.io";
import { YSocketIO } from "y-socket.io/dist/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// serve the built frontend (Docker copies it into ./public)
app.use(express.static(path.join(__dirname, "public")));

// health check (used by Docker and Render)
app.get("/health", (req, res) => {
  res.status(200).json({ message: "ok", success: true });
});

const httpServer = createServer(app);

// CLIENT_URL = your Netlify URL if the frontend is hosted separately.
// When Docker serves both together, "*" is fine.
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
  },
});

// Voice chat signalling: the server only passes connection messages between people.
// Audio itself travels directly between browsers (WebRTC).
io.on("connection", (socket) => {
  socket.on("voice:join", ({ room, name }) => {
    const key = `voice:${room}`;
    const peers = [...(io.sockets.adapter.rooms.get(key) || [])].map((id) => ({
      id,
      name: io.sockets.sockets.get(id)?.data?.name,
    }));
    socket.data = { room: key, name };
    socket.join(key);
    socket.emit("voice:peers", peers);
  });

  socket.on("voice:signal", ({ to, data }) => {
    io.to(to).emit("voice:signal", { from: socket.id, name: socket.data?.name, data });
  });

  const leave = () => {
    const key = socket.data?.room;
    if (!key) return;
    socket.to(key).emit("voice:left", socket.id);
    socket.leave(key);
    socket.data = {};
  };
  socket.on("voice:leave", leave);
  socket.on("disconnect", leave);
});

const ySocketIO = new YSocketIO(io);
ySocketIO.initialize();

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
