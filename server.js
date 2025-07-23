// ==========================================
// 🌐 Lumie Chatbot Server
// ==========================================

// ========== 🔧 Dependencies ==========
const express = require('express');
const fs = require('fs');
const cors = require('cors');
const NodeCache = require("node-cache");
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

// Middleware to block access unless in dev
function assertIsDev(req, res, next) {
  if (!isDev) return res.status(403).send("🚫 Access denied.");
  next();
}

app.get('/debug-log', assertIsDev, (req, res) => {
  const logFilePath = path.join(__dirname, 'logs/debug.log');

  res.sendFile(logFilePath, (err) => {
    if (err) {
      console.error('Error sending log file:', err);
      res.status(500).send('Failed to send log file.');
    }
  });
});

app.use(cors());
app.use(express.json({ limit: '10kb' })); // ⬅️ Limits body to ~10KB

// ========== 📁 Static Frontend ==========
const staticPath = path.join(__dirname, 'public');
app.use(express.static(staticPath)); // Serve static files

// ✅ Serve frontend fallback (e.g., index.html)
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

// ============= context filter ===================
function getScopedData(data, context) {
  return data.filter(d =>
    d.context === context || d.setContext === context
  );
}

function getOrCreateSession(userId) {
  let session = userSessions.get(userId);

  if (!session) {
    session = {
      recentAnswers: [],
      currentContext: null,
      lastSeen: Date.now(),
    };
  } else {
    session.lastSeen = Date.now(); // Update timestamp on every access
  }

  userSessions.set(userId, session, 3600); // Reset TTL to 1 hour
  return session;
}

// ------------------------------ Debug --------------------------------------

const debugLogPath = path.join(__dirname, 'logs/debug.log');
const intentLogPath = path.join(__dirname, 'logs/intent_log.txt');
const logDir = path.join(__dirname, 'logs');

try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }
} catch (err) {
  console.error('❌ Error creating log directory:', err.message);
}

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

function devLogBlock(userId, userMessage, logs = []) {
  if (!isDev) return;

  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  const separator = '═'.repeat(70);
  const header = `📩 ${userId} said: "${userMessage}" @ ${timestamp}`;

  const formatted = [
    `\n${separator}`,
    header,
    ...logs.map(line => `  ${line}`),
    `${separator}\n`,
  ].join('\n');

  writeLog(debugLogPath, formatted);
}


function logIntent(message) {
  writeLog(intentLogPath, message);
}

// ========== 🧠 In-Memory Stores ==========
const rateLimitCache = new NodeCache({ checkperiod: 600 }); // 10 minutes
const userSessions = new NodeCache({ stdTTL: 3600, checkperiod: 600 }); // 1 hour TTL, auto cleanup every 10 mins

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

// ============== Prebuilt Scoped Fuse Map ==============
const scopedFuses = {};
data.forEach(entry => {
  const key = entry.context || entry.setContext;
  if (key && !scopedFuses[key]) {
    const scopedData = getScopedData(data, key);
    scopedFuses[key] = new Fuse(scopedData, {
      keys: ['utterances'],
      threshold: config.chat.fuzzyThreshold,
      includeScore: true,
    });
  }
});

// ============== Global Fuse instance for fallback fuzzy matching ==============
const globalFuse = new Fuse(data, {
  keys: ['utterances'],
  threshold: config.chat.fuzzyThreshold,
  includeScore: true,
});

// ==========================================
// 🔐 Rate Limiting
// ==========================================
function isRateLimited(userId) {
  const now = Date.now();
  const { windowMs, maxRequests } = config.rateLimit;

  let record = rateLimitCache.get(userId);

  if (!record) {
    rateLimitCache.set(userId, { count: 1, firstRequestTime: now }, windowMs / 1000); // TTL in seconds
    return false;
  }

  if (record.count >= maxRequests) return true;

  record.count += 1;
  rateLimitCache.set(userId, record, (record.firstRequestTime + windowMs - now) / 1000);
  return false;
}

// =========================================
function limitRecent(list, max) {
  return list.length > max ? list.slice(-max) : list;
}

// ==========================================
// 🧠 Session Memory & Repetition Avoidance
// ==========================================
function pickNonRepeatingAnswer(userId, answers) {
  let session = getOrCreateSession(userId);

  const recent = session.recentAnswers;
  const availableAnswers = answers.filter(a => !recent.includes(a));
  let selected;

  if (availableAnswers.length > 0) {
    selected = availableAnswers[Math.floor(Math.random() * availableAnswers.length)];
    recent.push(selected);
  } else {
    selected = answers[Math.floor(Math.random() * answers.length)];
    recent.push(selected); // push again even if repeated
  }

  session.recentAnswers = limitRecent(recent, config.chat.maxRecentAnswers);
  userSessions.set(userId, session);

  return selected;
}

// ====================================================================
function updateContext(userId, intentData, message) {
  const { context, setContext, intent } = intentData;
  const generalIntents = ['Greet', 'None', 'Goodbye', 'Thanks'];

  let session = getOrCreateSession(userId);

  if (!setContext && (!context || generalIntents.includes(intent))) {
    session.currentContext = null;
  } else if (setContext) {
    session.currentContext = setContext;
  }

  userSessions.set(userId, session);

  if (isDev && intent && intent !== 'None') {
    logIntent(`✅ [${intent}] ${userId}: "${message}"`);
  }
}

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
    const record = rateLimitCache.get(userId);
    const retryTime = record
      ? new Date(record.firstRequestTime + config.rateLimit.windowMs)
      : new Date(Date.now() + config.rateLimit.windowMs);

    return res.status(429).json({
      reply: `⏳ You've reached your limit. Try again around ${retryTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      context: "rate-limit",
    });
  }
  
  let intent = null;
  let reply = null;
  let score = null;
  let results = [];

  const session = getOrCreateSession(userId);
  const currentContext = session.currentContext;

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
    updateContext(userId, exactIntent, message);
  }

  // 🔍 2. Fuzzy match (global search, fallback if no exact)
  if (!reply) {
    // Try scoped fuzzy match first (if user has context)
    if (currentContext) {
      results = scopedFuses[currentContext]?.search(message) || [];
    }

    // If no results or no context, fall back to globalFuse
    if (!results.length) {
      results = globalFuse.search(message);
    }

    const best = results[0]?.item;
    score = results[0]?.score;

    if (best && typeof score === 'number' && score <= config.chat.fuzzyScoreLimit) {
      const sessionContext = currentContext;
      const isFollowupOnly = !!best.context && !best.setContext;

      if (isFollowupOnly && best.context !== sessionContext) {
      } else {
        intent = best.intent;
        reply = pickNonRepeatingAnswer(userId, best.answers);
        updateContext(userId, best, message);
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
  }

  // 📦 DEV LOGGING (only in development)
  if (isDev) {
    const logLines = [];

    if (exactIntent) {
      logLines.push(`🎯 Exact intent match → ${intent}`);
    } else if (typeof score === 'number' && reply) {
      logLines.push(`🔍 Fuzzy intent match → ${intent} (score: ${score.toFixed(2)})`);
    } else {
      logLines.push(`🧱 Fallback intent → ${intent}`);
      if (typeof score === 'number') {
        logLines.push(`   ⤷ Fuzzy match score was too high: ${score.toFixed(2)}`);
      }
    }

    logLines.push(`🧭 Current context → ${session.currentContext || "none"}`);

    const recent = session.recentAnswers || [];
    logLines.push(`📚 Recent answers:\n${recent.map(a => `   • ${a}`).join('\n')}`);

    devLogBlock(userId, message, logLines);
  }

  // ✅ Response
  res.json({
    reply,
    context: session.currentContext || "none",
    intent,
    confidence: score || (exactIntent ? 1 : 0)
  });
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: '🔍 API route not found' });
});

// ==========================================
// ▶️ Start Server
// ==========================================
app.listen(PORT, () => {
  console.log(`✅ Lumie is live at http://localhost:${PORT}`);
});
