const httpServer = require('http').createServer();
const fs = require('fs');

const io = require('socket.io')(httpServer, {
  maxHttpBufferSize: 1e8,
  pingTimeout: 100000,
  pingInterval: 300000,
  cors: {
    //origin: "http://192.168.1.116:8080",    // Doma
    //origin: "http://10.0.239.86:8080",    // UNIN
    origin: "*",

    methods: ["GET", "POST"]
  }
});

const LOG_FILE = "op_log.json";

let op_log = [];

// ----------------------
// Load log at startup
// ----------------------
if (fs.existsSync(LOG_FILE)) {
  try {
    op_log = JSON.parse(fs.readFileSync(LOG_FILE));
    console.log("Loaded", op_log.length, "ops from disk.");
  } catch (err) {
    console.error("Failed to load log:", err);
  }
}

// ----------------------
// Persist function
// ----------------------
function saveLog() {
  fs.writeFile(LOG_FILE, JSON.stringify(op_log, null, 2), err => {
    if (err) console.error("Write failed:", err);
  });
}

// ----------------------
// Socket.IO
// ----------------------
io.on('connection', socket => {

  console.log("Client connected:", socket.id);

  // Send entire log
  socket.emit('full_log', op_log);

  socket.on('op', (op) => {

    if (!op || !op.op_id) return;

    // Append blindly (CRDT handles duplicates client-side)
    op_log.push(op);

    // Persist periodically
    if (op_log.length % 5 === 0) {
      saveLog();
    }

    // Broadcast to all clients
    io.emit('op', op);
  });

  socket.on('disconnect', () => {
    console.log("Client disconnected:", socket.id);
  });

});

const PORT = process.env.PORT || 2500;

httpServer.listen(PORT, () => {
  console.log("Listening on port", PORT);
});