const httpServer = require('http').createServer();
const fs = require('fs');

const io = require('socket.io')(httpServer, {
  maxHttpBufferSize: 1e8,
  pingTimeout: 100000,
  pingInterval: 300000,
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const LOG_FILE = "state.json";

// ----------------------
// State
// ----------------------
let currentEpoch = 1;
let op_log = [];

// ----------------------
// Presence (ephemeral)
// ----------------------
const presenceNicks = new Map(); 
// socket.id -> nick



// ----------------------
// Load state at startup
// ----------------------
if (fs.existsSync(LOG_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(LOG_FILE));
    currentEpoch = data.epoch || 1;
    op_log = data.log || [];
    console.log("Loaded state. Epoch:", currentEpoch, "Ops:", op_log.length);
  } catch (err) {
    console.error("Failed to load state:", err);
  }
}

// ----------------------
// Persist function
// ----------------------
function saveState() {
  const state = {
    epoch: currentEpoch,
    log: op_log
  };

  fs.writeFile(LOG_FILE, JSON.stringify(state, null, 2), err => {
    if (err) console.error("Write failed:", err);
  });
}

// ----------------------
// Socket.IO
// ----------------------
io.on('connection', socket => {

  console.log("Client connected:", socket.id);

  // Send epoch + full log
  socket.emit('sync_full', {
    epoch: currentEpoch,
    log: op_log
  });

  // ----------------------
  // Handle new op
  // ----------------------
  socket.on('op', (op) => {

    if (!op || !op.op_id) return;

    // Reject wrong epoch
    if (op.epoch !== currentEpoch) {
      console.log("Rejected op from old epoch:", op.epoch);
      return;
    }

    // Append (CRDT handles duplicates client-side)
    op_log.push(op);

    // Persist periodically
    if (op_log.length % 5 === 0) {
      saveState();
    }

    io.emit('op', op);
  });

  // ----------------------
  // Admin reset
  // ----------------------
  socket.on('admin_reset', (payload) => {

    const ADMIN_NICK = "ImController";  // change as needed

    if (!payload || payload.nick !== ADMIN_NICK) {
      console.log("Unauthorized reset attempt");
      return;
    }

    currentEpoch += 1;
    op_log = [];

    console.log("System reset. New epoch:", currentEpoch);

    saveState();

    io.emit('epoch_update', {
      epoch: currentEpoch
    });
  });


  // ----------------------
  // Presence update (relay only)
  // ----------------------
  socket.on('presence_update', (data) => {

    if (!data || !data.nick) return;

    // remember nick for disconnect event
    presenceNicks.set(socket.id, data.nick);

    // broadcast to everyone except sender
    socket.broadcast.emit('presence_update', {
      nick: data.nick,
      x: data.x,
      y: data.y,
      ts: data.ts
    });
  });


    socket.on('disconnect', () => {
    console.log("Client disconnected:", socket.id);

    const nick = presenceNicks.get(socket.id);

    if (nick) {
      io.emit('presence_disconnect', { nick });
      presenceNicks.delete(socket.id);
    }
  });


});

const PORT = process.env.PORT || 2500;

httpServer.listen(PORT, () => {
  console.log("Listening on port", PORT);
});
