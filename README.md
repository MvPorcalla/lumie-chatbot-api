# lumie-chatbot-api
Lumie is a lightweight chatbot assistant built with Node.js, Express, and node-nlp. It uses modular JSON files for training data and delivers context-aware responses. Easily customizable, it supports custom answer sets, context mapping, and follow-ups—ideal for portfolios or custom apps.

A lightweight chatbot server built with Node.js and Express, designed to handle user queries using basic NLP (Natural Language Processing) logic like exact and fuzzy string matching. Great for learning how chatbots work without using heavy external libraries or APIs.

---

## 🚀 Features

- Express.js server with a REST API
- Simple intent matching using exact and fuzzy logic (Fuse.js)
- Logging for development and debugging
- Rate limiting to prevent spam
- Easily extensible JSON-based intents and responses

---

## 📁 Folder Structure

📦 project-root/
│
├── /logs                   # Contains debug and intent logs
│   ├── debug.log
│   └── intent_log.txt
├── /node_modules
│
├── public                  # (Optional) Frontend HTML + JS
│   └── index.html        
│
├── traningData
│   ├── 
│   ├── 
│   └── intentGeneral.json            # NLP data (intents, utterances, answers)
│
├──
├──
├──
├── README.md
└── server.js               # Main server file

````

---

## 🧑‍💻 How to Run the Project

### 1. 📦 Clone the Repo

```bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
````

> Replace `your-username/your-repo-name` with your actual GitHub URL.

### 2. 🛠️ Install Dependencies

```bash
npm install
```

### 3. 🧪 Run the Server

```bash
node server.js
```

Server will start on:

```
http://localhost:3000
```

---

## 📬 Example API Request

Make a `POST` request to:

```
POST http://localhost:3000/api/chat
```

With JSON body:

```json
{
  "userId": "user123",
  "message": "hello"
}
```

You’ll get a response like:

```json
{
  "reply": "Hey there! I'm Lumie 👋"
}
```

---

## ⚙️ Development Mode

If `NODE_ENV` is not set to `"production"`, logs are printed to the console and saved in:

* `logs/debug.log`
* `logs/intent_log.txt`

To force dev mode:

```bash
NODE_ENV=development node server.js
```

---

## 📝 Customize Your Bot

Open `intents.json` and modify the `utterances` and `answers` for different `intents`.

Example:

```json
{
  "intent": "greetings.hello",
  "utterances": ["hi", "hello", "hey"],
  "answers": ["Hi there!", "Hey!", "Hello 👋"]
}
```

---

## 🧠 Tech Stack

* Node.js
* Express
* Fuse.js (for fuzzy matching)
* body-parser, cors, fs

---

## 📜 License

MIT — feel free to use, modify, and share.

---

## 👨‍💻 Author

Melvin Porcalla
[LinkedIn](https://linkedin.com/in/melvin-porcalla-7012b9289/) | [GitHub](https://github.com/mvporcalla)

```
