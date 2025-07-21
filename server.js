// ==========================================
// 🌐 Lumie Chatbot Server
// ==========================================

// ========== 🔧 Dependencies ==========
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require('cors');
const Fuse = require('fuse.js');
const path = require('path');

// ========== ⚙️ App Configuration ==========
const app = express();
const isDev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 3000;
console.log(`🌐 Environment: ${isDev ? 'Development' : 'Production'}`);
if (isDev) {
  console.log("🧪 Dev mode: verbose logging enabled.");
}


app.use(cors());
app.use(express.json());

// ========== 📁 Static Frontend ==========
app.use(express.static('public')); // Serves from /public folder

// ========== ⚙️ Runtime Configuration ==========
const config = {
  rateLimit: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxRequests: 1000
  },
  chat: {
    maxRecentAnswers: 5
  }
};

// ------------------------------ Debug --------------------------------------

const debugLogPath = path.join(__dirname, 'logs/debug.log');
const intentLogPath = path.join(__dirname, 'logs/intent_log.txt');
const logDir = path.join(__dirname, 'logs');

if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

function writeLog(filePath, message) {
  if (!isDev) return;

  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;

  try {
    fs.appendFileSync(filePath, logEntry, 'utf8');
  } catch (err) {
    console.error(`❌ Failed to write to ${filePath}:`, err.message);
  }
}

function devLog(message) {
  if (!isDev) return; // Only log if in dev mode
  writeLog(debugLogPath, message);
}

function logIntent(message) {
  writeLog(intentLogPath, message);
}



// ========== 🧠 In-Memory Stores ==========
const rateLimitStore = {};  // Tracks timestamps per userId/IP
const userSessions = {};    // Tracks recent answers & activity

// ========== 📚 Load Intent Training Data ==========
const trainingDir = './trainingData';
let data = [];

try {
  const files = fs.readdirSync(trainingDir).filter(f => f.endsWith('.json'));

  for (const file of files) {
    const raw = fs.readFileSync(path.join(trainingDir, file), 'utf-8');
    const parsed = JSON.parse(raw);
    data = data.concat(parsed);
  }
} catch (err) {
  console.error("❌ Failed to load training data:", err.message);
  process.exit(1);
}

// ========== 🔍 Fuse.js Fuzzy Search Setup ==========
const fuse = new Fuse(data, {
  keys: ['utterances'],
  threshold: 0.4,
  includeScore: true,
});

// ==========================================
// 🔐 Rate Limiting
// ==========================================
function isRateLimited(userId) {
  const now = Date.now();
  const { windowMs, maxRequests } = config.rateLimit;

  if (!rateLimitStore[userId]) {
    rateLimitStore[userId] = [];
  }

  // Remove expired timestamps
  rateLimitStore[userId] = rateLimitStore[userId].filter(ts => now - ts < windowMs);

  // If over limit, deny
  if (rateLimitStore[userId].length >= maxRequests) {
    return true;
  }

  rateLimitStore[userId].push(now);
  return false;
}

// ==========================================
// 🧠 Session Memory & Repetition Avoidance
// ==========================================
function pickNonRepeatingAnswer(userId, answers) {
  if (!userSessions[userId]) {
    userSessions[userId] = { recentAnswers: [] };
  }

  const recent = userSessions[userId].recentAnswers;
  const availableAnswers = answers.filter(a => !recent.includes(a));

  let selected;
  if (availableAnswers.length > 0) {
    selected = availableAnswers[Math.floor(Math.random() * availableAnswers.length)];
    recent.push(selected);
  } else {
    selected = answers[Math.floor(Math.random() * answers.length)];
    userSessions[userId].recentAnswers = [selected];
  }

  // Limit memory size
  if (recent.length > config.chat.maxRecentAnswers) recent.shift();

  return selected;
}

// ==========================================
// 🧹 Periodic Memory Cleanup (every 10 mins)
// ==========================================
setInterval(() => {
  const now = Date.now();
  const windowMs = config.rateLimit.windowMs;

  // Clean rate limit data
  for (const userId in rateLimitStore) {
    rateLimitStore[userId] = rateLimitStore[userId].filter(ts => now - ts < windowMs);
    if (rateLimitStore[userId].length === 0) delete rateLimitStore[userId];
  }

  // Clean stale sessions (older than 1 hour)
  const sessionTimeout = 60 * 60 * 1000;
  for (const userId in userSessions) {
    const session = userSessions[userId];
    if (!session.lastSeen || now - session.lastSeen > sessionTimeout) {
      delete userSessions[userId];
    }
  }
}, 10 * 60 * 1000);

// ==========================================
// 🚀 Routes
// ==========================================

// Root Health Check
app.get('/', (req, res) => {
  res.send('Lumie API is running...');
});

// Main Chat Endpoint
app.post('/api/chat', (req, res) => {
  const { message } = req.body;
  const userId = req.body.userId || req.ip;

  if (isDev) { 
    logIntent(`💬 Incoming message from ${userId}: "${message}"`); 
  }

  // ✅ Validate message
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ 
      reply: "❌ Invalid message input." 
    });
  }

  // 🕒 Track session activity
  if (!userSessions[userId]) {
    userSessions[userId] = { recentAnswers: [], lastSeen: Date.now() };
  } else {
    userSessions[userId].lastSeen = Date.now();
  }

  if (isDev) devLog(`👤 Session update for ${userId}, recent answers: ${userSessions[userId].recentAnswers}`);

  let intent = null;
  let reply = null;

  // ⏳ Check rate limit
  if (isRateLimited(userId)) {
    const now = Date.now();
    const timestamps = rateLimitStore[userId];
    const earliest = timestamps[0];
    const retryTime = new Date(earliest + config.rateLimit.windowMs);
    const retryTimeStr = retryTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isDev) devLog(`⏱️ Rate limit hit for ${userId}, retry after ${retryTimeStr}`);

    return res.status(200).json({
      reply: `⏳ You're sending messages too fast. Please wait (until ${retryTimeStr}).`,
      context: "rate-limit",
    });
  }

  // 🎯 Try exact match
  const exactIntent = data.find(d =>
    d.utterances.map(u => u.toLowerCase()).includes(message.toLowerCase())
  );

  if (exactIntent) {
    if (isDev) devLog(`🎯 Exact intent match for "${message}" → ${exactIntent.intent}`);
  } else {
    if (isDev) devLog(`🔍 No exact match for "${message}", attempting fuzzy match...`);
  }

  if (exactIntent) {
    intent = exactIntent.intent;
    reply = pickNonRepeatingAnswer(userId, exactIntent.answers);
  }

  // 🔍 Try fuzzy match if no exact match
  if (!reply) {
    const results = fuse.search(message);
    if (results.length > 0) {
      const best = results[0].item;

      if (isDev) devLog(`🔍 Fuzzy match found: "${message}" → ${best.intent} (score: ${results[0].score})`);
      if (isDev && intent && intent !== 'None') {
        logIntent(`✅ Detected intent for ${userId}: ${intent}`);
      }

      intent = best.intent;
      reply = pickNonRepeatingAnswer(userId, best.answers);
    }
  }

  // 🧱 Fallback if no intent matched
  if (!reply) {
    const noneIntent = data.find(d => d.intent === 'None');
    reply = noneIntent
      ? pickNonRepeatingAnswer(userId, noneIntent.answers)
      : `🤖 You said: "${message}"`;
    intent = noneIntent ? 'None' : 'Echo';

    if (isDev) devLog(`🧱 No match found. Using fallback intent: ${intent}`);

  }

  // ✅ Send response
  res.json({ reply, context: "reply", intent });
});

// ==========================================
// ▶️ Start Server
// ==========================================
app.listen(PORT, () => {
  console.log(`✅ Lumie is live at http://localhost:${PORT}`);
});
