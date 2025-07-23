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
app.use(express.json({ limit: '10kb' })); // ⬅️ Limits body to ~10KB

// ========== 📁 Static Frontend ==========
const staticPath = path.join(__dirname, 'public');
app.use(express.static(staticPath)); // Serve static files

if (!isDev) {
  // Catch-all for SPA routes (e.g. React Router, Vue Router)
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}


// ========== ⚙️ Runtime Configuration ==========
const config = {
  rateLimit: {
    windowMs: 30 * 60 * 1000, // 30 minutes
    maxRequests: 1000
  },
  chat: {
    maxRecentAnswers: 5,
    fuzzyThreshold: 0.4,
    fuzzyScoreLimit: 0.45
  }
};

// ------------------------------ Debug --------------------------------------

const debugLogPath = path.join(__dirname, 'logs/debug.log');
const intentLogPath = path.join(__dirname, 'logs/intent_log.txt');
const logDir = path.join(__dirname, 'logs');

try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }
} catch (err) {
  console.error('❌ Error ensuring log directory:', err.message);
}

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
const rateLimitStore = new Map(); // Map is more efficient for frequent updates
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

// ==========================================
// 🔐 Rate Limiting
// ==========================================
function isRateLimited(userId) {
  const now = Date.now();
  const { windowMs, maxRequests } = config.rateLimit;

  const record = rateLimitStore.get(userId) || { count: 0, firstRequestTime: now };

  // Reset counter if time window expired
  if (now - record.firstRequestTime > windowMs) {
    rateLimitStore.set(userId, { count: 1, firstRequestTime: now });
    return false;
  }

  // Deny if max requests reached
  if (record.count >= maxRequests) return true;

  // Increment and save
  record.count += 1;
  rateLimitStore.set(userId, record);
  return false;
}

// ==========================================
// 🧠 Session Memory & Repetition Avoidance
// ==========================================
function pickNonRepeatingAnswer(userId, answers) {
  if (!userSessions[userId]) {
    userSessions[userId] = { 
      recentAnswers: [] 
    };
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

// ====================================================================
function updateContext(userId, intentData) {
  const current = userSessions[userId].currentContext;
  const { context, setContext, intent } = intentData;
  const generalIntents = ['Greet', 'None', 'Goodbye', 'Thanks'];

  if (setContext) {
    userSessions[userId].currentContext = setContext;
    if (isDev) devLog(`🧭 Context set to "${setContext}"`);
  } else if (
    (!context && !setContext) ||
    generalIntents.includes(intent)
  ) {
    if (current !== null) {
      userSessions[userId].currentContext = null;
      if (isDev) devLog(`🧭 Cleared context due to general intent "${intent}"`);
    }
  }

  // ✅ Log intent here (only in dev)
  if (isDev && intent && intent !== 'None') {
    logIntent(`✅ Detected intent for ${userId}: ${intent}`);
  }
}

// ==========================================
// 🧹 Periodic Memory Cleanup (every 10 mins)
// ==========================================
setInterval(() => {
  const now = Date.now();
  const windowMs = config.rateLimit.windowMs;

  // Clean expired rate limits
  for (const [userId, record] of rateLimitStore.entries()) {
    if (now - record.firstRequestTime > windowMs) {
      rateLimitStore.delete(userId);
    }
  }

  // Session cleanup remains unchanged
  const sessionTimeout = 60 * 60 * 1000;
  for (const userId in userSessions) {
    const session = userSessions[userId];
    if (!session.lastSeen || now - session.lastSeen > sessionTimeout) {
      delete userSessions[userId];
    }
  }
}, 10 * 60 * 1000); // Every 10 mins

// ==========================================
// 🚀 Routes
// ==========================================

// Root Health Check
app.get('/', (req, res) => {
  res.send('Lumie API is running...');
});

// Main Chat Endpoint
app.post('/api/chat', (req, res) => {  
  const rawMessage = req.body.message;
  const message = typeof rawMessage === 'string' ? rawMessage.trim().toLowerCase() : '';
  const userId = req.body.userId || req.ip;

  if (isDev) logIntent(`💬 Incoming message from ${userId}: "${message}"`);

  // ✅ Validate input
  if (!message) {
    return res.status(400).json({ reply: "❌ Invalid message input." });
  }

  // ⏳ Rate limiting
  if (isRateLimited(userId)) {
    const timestamps = rateLimitStore[userId];
    const retryTime = new Date(timestamps[0] + config.rateLimit.windowMs);
    return res.status(200).json({
      reply: `⏳ You're sending messages too fast. Try again around ${retryTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      context: "rate-limit",
    });
  }

  // 🧠 Initialize session
  if (!userSessions[userId]) {
    userSessions[userId] = { recentAnswers: [], lastSeen: Date.now(), currentContext: null };
  } else {
    userSessions[userId].lastSeen = Date.now();
  }

  let intent = null;
  let reply = null;
  let score = null;
  const currentContext = userSessions[userId].currentContext;

  // 🎯 1. Exact match (prioritize scoped data)
  const scopedData = currentContext
    ? data.filter(d => d.context === currentContext || d.setContext === currentContext)
    : data;

  const exactIntent = scopedData.find(d =>
    d.utterances.some(u => u.toLowerCase() === message)
  );

  if (exactIntent) {
    intent = exactIntent.intent;
    reply = pickNonRepeatingAnswer(userId, exactIntent.answers);
    updateContext(userId, exactIntent);
    if (isDev) devLog(`🎯 Exact match → ${intent}`);
  }

  // 🔍 2. Fuzzy match (global search, fallback if no exact)
  if (!reply) {
    const fuse = new Fuse(data, {
      keys: ['utterances'],
      threshold: config.chat.fuzzyThreshold,
      includeScore: true,
    });

    const results = fuse.search(message);
    const best = results[0]?.item;
    score = results[0]?.score;

    if (best && score <= config.chat.fuzzyScoreLimit) {
      const sessionContext = currentContext;
      const isFollowupOnly = !!best.context && !best.setContext;

      if (isFollowupOnly && best.context !== sessionContext) {
        if (isDev) devLog(`⚠️ Ignored fuzzy match due to context mismatch (${best.context} ≠ ${sessionContext})`);
      } else {
        intent = best.intent;
        reply = pickNonRepeatingAnswer(userId, best.answers);
        updateContext(userId, best);
        if (isDev) devLog(`🔍 Fuzzy match → ${intent} (score: ${score})`);
      }
    }
  }

  // 🧱 3. Fallback
  if (!reply) {
    const fallback = data.find(d => d.intent === 'None');
    intent = fallback ? fallback.intent : 'None';
    reply = fallback
      ? pickNonRepeatingAnswer(userId, fallback.answers)
      : `🤖 You said: "${message}"`;
    if (isDev) devLog(`🧱 Fallback used → ${intent}`);
  }

  // ✅ Response
  res.json({
    reply,
    context: userSessions[userId].currentContext || "none",
    intent,
    confidence: score || (exactIntent ? 1 : 0)
  });
});

// ==========================================
// ▶️ Start Server
// ==========================================
app.listen(PORT, () => {
  console.log(`✅ Lumie is live at http://localhost:${PORT}`);
});
