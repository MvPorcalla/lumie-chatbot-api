// ==========================================
// 🌐 Lumie Chatbot Server
// ==========================================

// ========== 🔧 Dependencies ==========
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require('cors');
const Fuse = require('fuse.js');

// ========== ⚙️ App Configuration ==========
const app = express();
const isDev = process.env.NODE_ENV !== 'production';
const PORT = process.env.PORT || 3000;
console.log(`🌐 Environment: ${isDev ? 'Development' : 'Production'}`);

app.use(cors());
app.use(express.json());

// ========== 📁 Static Frontend ==========
app.use(express.static('public')); // Serves from /public folder

// ========== ⚙️ Runtime Configuration ==========
const config = {
  rateLimit: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 2
  },
  chat: {
    maxRecentAnswers: 5
  }
};

// ========== 🧠 In-Memory Stores ==========
const rateLimitStore = {};  // Tracks timestamps per userId/IP
const userSessions = {};    // Tracks recent answers & activity

// ========== 📚 Load Intent Training Data ==========
const data = JSON.parse(fs.readFileSync('./trainingData/intentGeneral.json'));

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

  // 🕒 Track session activity
  if (!userSessions[userId]) {
    userSessions[userId] = { recentAnswers: [], lastSeen: Date.now() };
  } else {
    userSessions[userId].lastSeen = Date.now();
  }

  let intent = null;
  let reply = null;

  // ⏳ Check rate limit
  if (isRateLimited(userId)) {
    const now = Date.now();
    const timestamps = rateLimitStore[userId];
    const earliest = timestamps[0];
    const retryTime = new Date(earliest + config.rateLimit.windowMs);
    const retryTimeStr = retryTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
    intent = exactIntent.intent;
    reply = pickNonRepeatingAnswer(userId, exactIntent.answers);
  }

  // 🔍 Try fuzzy match if no exact match
  if (!reply) {
    const results = fuse.search(message);
    if (results.length > 0) {
      const best = results[0].item;
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
  }

  // 📝 Logging intent detection
  if (intent) {
    const logLine = `${new Date().toISOString()} | ${userId} | Intent: ${intent} | Message: "${message}"\n`;
    fs.appendFileSync('intent_logs.txt', logLine);
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
