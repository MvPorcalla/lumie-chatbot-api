// server.js

const express = require('express');
const fs = require('fs');
const path = require('path');
const { NlpManager } = require('node-nlp');
const crypto = require('crypto');
const Fuse = require('fuse.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const manager = new NlpManager({ languages: ['en'], forceNER: true });
const userContexts = {}; // { [userId]: { lastIntent: string } }

const intentFiles = [
  './trainingData/intentGeneral.json',
  './trainingData/intentProfile.json',
  './trainingData/intentContextual.json',
];

let allIntents = [];
let allUtterances = [];

for (const file of intentFiles) {
  try {
    const trainingData = JSON.parse(fs.readFileSync(file, 'utf8'));
    allIntents = allIntents.concat(trainingData);

    trainingData.forEach(({ intent, utterances, answers, context, setContext }) => {
      if (!intent || !Array.isArray(utterances)) return;

      utterances.forEach((u) => {
        manager.addDocument('en', u, intent);
        allUtterances.push({ utterance: u, intent, context, answers, setContext });
      });

      if (Array.isArray(answers)) {
        answers.forEach((a) => manager.addAnswer('en', intent, a));
      }
    });
  } catch (err) {
    console.error(`Failed to load ${file}:`, err.message);
  }
}

const fuse = new Fuse(allUtterances, {
  keys: ['utterance'],
  threshold: 0.35,
  includeScore: true,
});

const modelPath = './model.nlp';
(async () => {
  try {
    await manager.train();
    await manager.save(modelPath);
    console.log('✅ NLP model trained and saved');
  } catch (err) {
    console.error('❌ Model training failed:', err.message);
  }
})();

app.get('/debug/intents', (req, res) => {
  res.json(allIntents);
});

app.post('/api/chat', async (req, res) => {
  const message = req.body.message?.toLowerCase().trim();
  const userId = req.body.userId || crypto.randomBytes(8).toString('hex');

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  const userContext = userContexts[userId]?.lastIntent || null;
  const response = await manager.process('en', message);
  let { intent, answer } = response;

  let validIntent = null;

  if (intent === 'None') {
    const results = fuse.search(message);
    if (results.length > 0) {
  const best = results[0].item;
  const matchedIntent = best.intent;

  // Strict context enforcement
  if (!best.context || (userContext && best.context.includes(userContext))) {
    validIntent = best;
    intent = matchedIntent;
  } else {
    // Try to find another match with same intent but context-compatible
    validIntent = allUtterances.find(
      (i) => i.intent === matchedIntent && (!i.context || (userContext && i.context.includes(userContext)))
    );

    if (validIntent) {
      intent = matchedIntent;
    } else {
      // No valid intent found due to context mismatch
      intent = 'None';
      validIntent = null;
    }
  }
}

  } else {
    const matches = allIntents.filter((i) => i.intent === intent);
    validIntent = matches.find((i) => !i.context || i.context.includes(userContext)) || matches[0];
  }

  // ✅ Debug log
  console.log(`[User: ${userId}] Message: "${message}" → Intent: ${intent} | Context: ${userContext || 'none'}`);
  console.log(`→ SetContext: ${validIntent?.setContext || 'none'}`);

  if (validIntent?.setContext) {
    userContexts[userId] = { lastIntent: validIntent.setContext };
  }

  if ((!answer || answer === '') && validIntent?.answers?.length > 0) {
    answer = validIntent.answers[Math.floor(Math.random() * validIntent.answers.length)];
  }

  if (!answer || !validIntent) {
    answer = "Sorry, I didn't quite get that. Try asking something else!";
  }

  res.json({ answer, intent, userId });
});

app.post('/api/retrain', async (req, res) => {
  try {
    await manager.train();
    await manager.save('./model.nlp');
    res.json({ message: 'Model retrained successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Model retraining failed', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Bot is running on http://localhost:${PORT}`);
});
