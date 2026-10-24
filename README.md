# 🍳 Cooked Literally

> Snap a photo of your fridge, let open-weight AI figure out what to cook, and have ElevenLabs read the steps aloud while your hands stay clean. Zero effort. One pan. Dinner done.

Built for **Hacktoberfest 2026** — Hack Day Chennai × Commit Culture  
Theme: **"AI Belongs to Everyone: Slow and Steady / Sloth Day"**

---

## ✨ Features

- **📸 Snap or Upload** — take a webcam photo or upload a fridge picture; multimodal vision AI auto-detects your ingredients
- **🧠 Gemma 2 Recipe Synthesis** — Google Gemma 2 (via Hugging Face) turns your random pantry into a real, single-pan recipe
- **🔊 Hands-Free Voice Guide** — ElevenLabs reads only the cooking steps aloud so you never touch your screen with greasy fingers
- **🌐 Browser Voice Fallback** — works offline via the Web Speech API with no API key required
- **⚡ Three Effort Levels** — *Ain't Cookin'* (5 min), *Can Cook* (15 min), *I am Ramsay* (gourmet)

---

## 🗂️ Project Structure

```
Cooked-Literally/
├── backend_api.py       # FastAPI REST backend (vision scan, recipe gen, TTS narration)
├── app.py               # Streamlit prototype (standalone, no backend required)
├── .env.example         # Environment variable template — copy to .env and fill in keys
├── frontend/
│   ├── src/
│   │   ├── App.tsx      # Main React UI — webcam, upload, recipe card, audio player
│   │   └── index.css    # Tailwind 4 + Inter font styles
│   ├── public/          # Logo, favicon, icons
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

---

## 🔑 Getting Your API Keys

You need up to **three** keys (all have free tiers):

### 1. Google AI Studio Key (for Vision + Recipe Generation)
1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Click **Get API Key** → **Create API Key**
3. Copy the key — it starts with `AIza...`

### 2. Hugging Face Token (for Gemma 2 open-weight model)
1. Sign up / log in at [huggingface.co](https://huggingface.co)
2. Go to **Settings → Access Tokens**
3. Click **New Token** → choose **Read** role → copy it (`hf_...`)
4. Also visit [google/gemma-2-9b-it](https://huggingface.co/google/gemma-2-9b-it) and click **Agree** to accept the model licence

### 3. ElevenLabs API Key (for voice narration — optional)
1. Sign up at [elevenlabs.io](https://elevenlabs.io) — free tier gives 10,000 chars/month
2. Go to **Profile → API Keys** → copy your key (`sk_...`)
3. To use a custom Voice ID, go to **Voices → your voice** and copy the ID from the URL

> **No keys?** The app still works — it falls back to a curated local recipe and browser voice narration automatically.

---

## 🚀 Running Locally

### Prerequisites
- Python 3.10+
- Node.js 18+

---

### Option A — Full Stack (React Frontend + FastAPI Backend) ⭐ Recommended

**Step 1 — Clone & set up environment**
```bash
git clone https://github.com/Moureesh-M/Cooked-Literally.git
cd Cooked-Literally
```

**Step 2 — Create your `.env` file**
```bash
cp .env.example .env
```
Open `.env` and fill in your keys:
```env
GOOGLE_API_KEY=AIza...
HF_TOKEN=hf_...
TO NOTE: ELEVENLABS is Optional(Browser TTS is provided as default)
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=MmQVkVZnQ0dUbfWzcW6f
```

**Step 3 — Set up Python virtual environment**
```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate
```

**Step 4 — Install Python dependencies**
```bash
pip install fastapi uvicorn httpx python-dotenv python-multipart pillow requests
```

**Step 5 — Start the backend**
```bash
uvicorn backend_api:app --host 0.0.0.0 --port 8000
```
API docs available at `http://localhost:8000/docs`

**Step 6 — Install and start the frontend** (in a new terminal)
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser. 🎉

---

### Option B — Streamlit Prototype (no frontend build needed)

```bash
# Inside the project root with .venv activated
pip install streamlit requests pillow python-dotenv
streamlit run app.py
```
Open `http://localhost:8501`

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
| :----- | :------- | :---------- |
| `GET`  | `/api/v1/health` | Health check |
| `POST` | `/api/v1/pantry/scan` | Upload ingredients photo → get detected ingredients |
| `POST` | `/api/v1/recipes/generate` | Ingredients + effort level → recipe JSON |
| `POST` | `/api/v1/recipes/narration` | Recipe steps → MP3 audio stream |

Full interactive docs: `http://localhost:8000/docs`

---

## 🧠 How It Works

```
User uploads photo
       ↓
POST /api/v1/pantry/scan
  → Google Gemini Vision detects ingredients
       ↓
POST /api/v1/recipes/generate
  → Hugging Face Gemma 2 (or Google AI Studio fallback)
  → Returns structured JSON recipe
       ↓
POST /api/v1/recipes/narration
  → ElevenLabs eleven_turbo_v2_5 TTS
  → Returns MP3 audio of cooking steps only
```

---

## 🛡️ Security Notes

- **Never commit your `.env` file** — it is in `.gitignore`
- Use `.env.example` as a template for sharing key names without values
- The frontend settings modal lets users enter their own keys at runtime — nothing is stored server-side

---

## 🤝 Contributing

PRs and issues welcome. If you add a new model backend or voice provider, open a PR!

---

## 📄 License

MIT
