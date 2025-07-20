// server.js

const express = require('express');
const fs = require('fs');
const path = require('path');
const { NlpManager } = require('node-nlp');

const app = express();
require('dotenv').config();
const PORT = process.env.PORT || 3000;


// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create NLP manager
const manager = new NlpManager({ languages: ['en'], forceNER: true });

// Load training data from multiple files
const intentFiles = ['./trainingData/intentGeneral.json', './trainingData/intentProfile.json'];
const contextMap = JSON.parse(fs.readFileSync('./trainingData/contextMap.json', 'utf8'));
const contextAnswers = JSON.parse(fs.readFileSync('./trainingData/contextAnswer.json', 'utf8'));
// const followupMap = JSON.parse(fs.readFileSync('./trainingData/followupMap.json', 'utf8'));


for (const file of intentFiles) {
  try {
    const trainingData = JSON.parse(fs.readFileSync(file, 'utf-8'));
    for (const item of trainingData) {
      const { intent, utterances, answers } = item;
      utterances.forEach(phrase => manager.addDocument('en', phrase, intent));
      if (answers) {
        answers.forEach(reply => manager.addAnswer('en', intent, reply));
      }
    }
  } catch (err) {
    console.error(`Failed to load or parse ${file}:`, err.message);
  }
}

// Train and save the model
(async () => {
  await manager.train();
  manager.save();
})();

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.send({ status: 'OK', time: new Date().toISOString() });
});

let lastIntent = null; // Track the previous intent

app.post('/api/chat', async (req, res) => {
  const message = req.body.message.toLowerCase().trim();
  const response = await manager.process('en', message);
  let intent = response.intent;
  let answer = response.answer;

  // Handle contextMap: "who_are_you" → check keywords → resolve to context intent like "about.lumie"
  if (contextMap[intent]) {
    for (const keyword in contextMap[intent]) {
      if (message.includes(keyword)) {
        intent = contextMap[intent][keyword];
        break;
      }
    }
  }

  // Check contextAnswer
  if (contextAnswers[intent]) {
    const possibleAnswers = contextAnswers[intent].answers;
    answer = possibleAnswers[Math.floor(Math.random() * possibleAnswers.length)];
  }

  // Final fallback
  if (!answer) {
    answer = "Sorry, I didn't understand that.";
  }

  lastIntent = intent;
  res.json({ answer, intent }); // Removed `followups` from the response
});



app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.listen(PORT, () => {
  console.log(`🤖 MelvinBot API running at http://localhost:${PORT}`);
});
