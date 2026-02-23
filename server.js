import express from "express";
import { createServer as createHttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import admin from "firebase-admin";

const app = express();
const httpServer = createHttpServer(app);
const isProduction = process.env.NODE_ENV === "production";

const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_ORIGIN || true,
    credentials: true,
  },
});

const chatHistory = [];
const MAX_HISTORY = 120;
const onlineUsers = new Map(); // socket.id -> name
const lastOnlineByName = new Map(); // name -> timestamp
const typingBySocket = new Map(); // socket.id -> name

let firestore = null;

function initFirebase() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKeyRaw) return null;

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
  return admin.firestore();
}

function emitPresence() {
  const names = [...new Set([...onlineUsers.values()])];
  io.emit("presence:update", {
    onlineCount: io.engine.clientsCount,
    names,
  });
}

function emitTyping() {
  const users = [...typingBySocket.entries()].map(([socketId, name]) => ({ socketId, name }));
  io.emit("presence:typing", { users });
}

async function loadHistoryFromFirestore() {
  if (!firestore) return;
  const snap = await firestore
    .collection("messages")
    .orderBy("at", "asc")
    .limit(MAX_HISTORY)
    .get();
  chatHistory.length = 0;
  snap.forEach((doc) => {
    const data = doc.data() || {};
    chatHistory.push({
      name: String(data.name || "anon"),
      text: String(data.text || ""),
      at: Number(data.at) || Date.now(),
      senderSocketId: String(data.senderSocketId || ""),
    });
  });
}

io.on("connection", (socket) => {
  socket.emit("chat history", chatHistory);
  socket.emit("presence:last_online", Object.fromEntries(lastOnlineByName));
  emitPresence();
  emitTyping();

  socket.on("chat message", (payload) => {
    const name = String(payload?.name || "anon").trim().slice(0, 24);
    const text = String(payload?.text || "").trim().slice(0, 350);
    const at = Number(payload?.at) || Date.now();
    if (!text) return;

    const msg = { name, text, at, senderSocketId: socket.id };
    chatHistory.push(msg);
    if (chatHistory.length > MAX_HISTORY) chatHistory.shift();

    io.emit("chat message", msg);

    if (firestore) {
      firestore.collection("messages").add({
        name,
        text,
        at,
        senderSocketId: socket.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    }
  });

  socket.on("chat register", (payload) => {
    const name = String(payload?.name || "").trim().slice(0, 24);
    if (!name) return;
    onlineUsers.set(socket.id, name);
    typingBySocket.delete(socket.id);
    emitPresence();
  });

  socket.on("chat typing", (payload) => {
    const raw = String(payload?.name || "").trim().slice(0, 24);
    if (!raw) return;
    const isTyping = Boolean(payload?.typing);
    if (isTyping) typingBySocket.set(socket.id, raw);
    else typingBySocket.delete(socket.id);

    emitTyping();
  });

  socket.on("chat seen", (payload) => {
    const name = String(payload?.name || "").trim().slice(0, 24) || "Someone";
    const at = Number(payload?.at) || Date.now();
    socket.broadcast.emit("chat seen", { name, at, viewerSocketId: socket.id });
  });

  socket.on("disconnect", () => {
    const name = onlineUsers.get(socket.id);
    if (name) {
      lastOnlineByName.set(name, Date.now());
      io.emit("presence:last_online", Object.fromEntries(lastOnlineByName));
    }
    onlineUsers.delete(socket.id);
    typingBySocket.delete(socket.id);
    emitPresence();
    emitTyping();
  });
});

firestore = initFirebase();
if (firestore) {
  await loadHistoryFromFirestore().catch(() => {});
}

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

if (!isProduction) {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: false,
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.get("/", (_req, res) => {
    res.status(200).send("Pookie chat backend is running");
  });
}

const port = Number(process.env.PORT) || 3000;
httpServer.listen(port, () => {
  console.log(`Chat + web app running on http://localhost:${port}`);
});
