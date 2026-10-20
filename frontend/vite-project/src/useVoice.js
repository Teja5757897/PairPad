import { useRef, useState, useEffect } from "react";
import { io } from "socket.io-client";
import { SERVER_URL } from "./config";

// Peer-to-peer voice chat (WebRTC). The server only passes connection messages between people.
export function useVoice(room, username) {
  const [joined, setJoined] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peers, setPeers] = useState({});
  const [error, setError] = useState("");
  const ref = useRef({ socket: null, stream: null, pcs: new Map(), audios: new Map() });

  const closePeer = (id) => {
    const r = ref.current;
    r.pcs.get(id)?.close();
    r.pcs.delete(id);
    const a = r.audios.get(id);
    if (a) { a.srcObject = null; r.audios.delete(id); }
    setPeers((p) => { const n = { ...p }; delete n[id]; return n; });
  };

  const makePeer = (id) => {
    const r = ref.current;
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    r.stream.getTracks().forEach((t) => pc.addTrack(t, r.stream));
    pc.onicecandidate = (e) => e.candidate && r.socket.emit("voice:signal", { to: id, data: { candidate: e.candidate } });
    pc.ontrack = (e) => {
      let a = r.audios.get(id);
      if (!a) { a = new Audio(); a.autoplay = true; r.audios.set(id, a); }
      a.srcObject = e.streams[0];
    };
    pc.onconnectionstatechange = () => ["failed", "closed"].includes(pc.connectionState) && closePeer(id);
    r.pcs.set(id, pc);
    return pc;
  };

  const leave = () => {
    const r = ref.current;
    r.socket?.emit("voice:leave");
    r.socket?.disconnect();
    [...r.pcs.keys()].forEach(closePeer);
    r.stream?.getTracks().forEach((t) => t.stop());
    ref.current = { socket: null, stream: null, pcs: new Map(), audios: new Map() };
    setJoined(false); setMuted(false); setPeers({});
  };

  const join = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const socket = io(SERVER_URL);
      ref.current.stream = stream;
      ref.current.socket = socket;

      socket.on("connect", () => socket.emit("voice:join", { room, name: username }));

      // I am the newcomer: call everyone already in the room
      socket.on("voice:peers", async (list) => {
        for (const { id, name } of list) {
          setPeers((p) => ({ ...p, [id]: name || "Guest" }));
          const pc = makePeer(id);
          await pc.setLocalDescription(await pc.createOffer());
          socket.emit("voice:signal", { to: id, data: { sdp: pc.localDescription } });
        }
      });

      socket.on("voice:signal", async ({ from, name, data }) => {
        let pc = ref.current.pcs.get(from);
        if (data.sdp) {
          if (!pc) { pc = makePeer(from); setPeers((p) => ({ ...p, [from]: name || "Guest" })); }
          await pc.setRemoteDescription(data.sdp);
          for (const c of pc.queue || []) await pc.addIceCandidate(c).catch(() => {});
          pc.queue = [];
          if (data.sdp.type === "offer") {
            await pc.setLocalDescription(await pc.createAnswer());
            socket.emit("voice:signal", { to: from, data: { sdp: pc.localDescription } });
          }
        } else if (data.candidate && pc) {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
          else (pc.queue ||= []).push(data.candidate);
        }
      });

      socket.on("voice:left", closePeer);
      setJoined(true);
    } catch {
      setError("Microphone is blocked. Allow it from the lock icon in the address bar, then try again.");
    }
  };

  const toggleMute = () => {
    ref.current.stream?.getAudioTracks().forEach((t) => (t.enabled = muted));
    setMuted(!muted);
  };

  useEffect(() => () => leave(), []); // eslint-disable-line
  return { joined, muted, peers, error, join, leave, toggleMute };
}
