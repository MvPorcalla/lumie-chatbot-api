const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const cors = require('cors');
const Fuse = require('fuse.js');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// 👉 Serve static frontend files from public/
app.use(express.static('public'));

// Load intents data
const data = JSON.parse(fs.readFileSync('./trainingData/intentGeneral.json'));

// Fuse.js setup for fuzzy searching
const fuse = new Fuse(data, {
  keys: ['utterances'],
  threshold: 0.4,
  includeScore: true,
});

// Track recent responses to avoid repetition
const userSessions = {};

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

  if (recent.length > 5) recent.shift();

  return selected;
}

// Root route
app.get('/', (req, res) => {
  res.send('Lumie API is running...');
});

// Chat route
app.post('/api/chat', (req, res) => {
  const { message, userId } = req.body;
  let intent = null;
  let reply = null;

  // Check for exact match
  const exactIntent = data.find(d =>
    d.utterances.map(u => u.toLowerCase()).includes(message.toLowerCase())
  );

  if (exactIntent) {
    intent = exactIntent.intent;
    reply = pickNonRepeatingAnswer(userId, exactIntent.answers);
  }

  // Fuzzy match if no exact match
  if (!reply) {
    const results = fuse.search(message);
    if (results.length > 0) {
      const best = results[0].item;
      intent = best.intent;
      reply = pickNonRepeatingAnswer(userId, best.answers);
    }
  }

  // Fallback to default response
  if (!reply) {
    const noneIntent = data.find(d => d.intent === 'None');
    reply = noneIntent
      ? pickNonRepeatingAnswer(userId, noneIntent.answers)
      : "Hmm, I’m not sure how to respond to that yet.";
  }

  res.json({ reply });
});

// Start server
app.listen(PORT, () => {
  console.log(`Lumie is live at http://localhost:${PORT}`);
});
