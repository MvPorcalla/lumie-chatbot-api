# lumie-chatbot-api
Lumie is a lightweight and customizable chatbot API powered by Fuse.js for fuzzy intent matching. Built with Node.js and Express, it enables simple, conversational interactions with support for jokes, motivational quotes, and customizable responses.

---

## 🚀 Features

* 🎯 Fuzzy intent matching using Fuse.js
* 🤖 Easy-to-edit intents via JSON
* 📜 Built-in and API-based jokes & motivational quotes
* 🔁 Prevents repeated replies for the same user
* 🛠️ Developer mode with debug logging
* 🌐 CORS-ready for frontend integration

---

## 🌐 Frontend Integration

You can easily connect this to a frontend (e.g. a portfolio chatbot UI) via a POST request to `/api/chat`.

---

```text

## 📁 Folder Structure

📦 project-root/
│
├── /logs                   # Contains debug and intent logs
│   ├── debug.log
│   └── intent_log.txt
│
├── /node_modules
├── public                  # (Optional) Frontend HTML + JS
│   └── index.html        
│
├── traningData
│   ├── intentGeneral.json            # NLP data (intents, utterances, answers)
│   ├── intentJoke.json
│   └── intentQoutes.json
│
├── .gitignore
├── LICENSE
├── package-lock.json
├── package.json
├── README.md
└── server.js               # Main server file

```

---

## 🧑‍💻 How to Run the Project

### 1. 📦 Clone the Repo

```bash
git clone https://github.com/yourusername/lumie-fuse-chatbot-api.git
cd lumie-fuse-chatbot-api
````

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

1. **Navigate to the `trainingData` folder.**

2. **Edit existing intent files** like:

   * `intentGeneral.json`
   * `intentJokes.json`
   * `intentQuotes.json`

3. **Or delete or add a new `.json` file** for your own custom intents.

4. **Modify the following in each file:**

   * `"utterances"` – user inputs the bot should recognize.
   * `"answers"` – how the bot should respond to those inputs.

🛠️ Example structure:

```json
{
  "intent": "greetings.hello",
  "utterances": ["hi", "hello", "hey there"],
  "answers": ["Hello!", "Hi! How can I help you today?"]
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
