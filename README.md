# 🦥 SlothChef AI: Zero-Effort Cooking with Open-Weight AI & Hands-Free Voice

> Built for **Hacktoberfest 2026** (Hacktoberfest Hack Day Chennai x Commit Culture)  
> Theme: **"AI Belongs to Everyone: Slow and Steady / Sloth Day"**

---

## 🌟 1. Key Functionalities

### 1. Multi-Modal Pantry & Fridge Ingestion
* **Image Upload / Webcam Capture:** Snap a real-time picture of whatever is lying on your kitchen counter or inside your fridge.
* **Open-Weight Vision Parsing:** Identifies available raw ingredients and condiments without needing manual text entry.
* **Quick Presets:** Instant testing profiles (Student Dorm, Late Night Snacks, Healthy Sloth).

### 2. Google Gemma 2 Culinary Reasoning
* **Effort Slider:** Configurable sloth levels (*Absolute Sloth < 5 mins*, *Low Effort 10-15 mins*, *Energetic Sloth*).
* **Single-Pan / Minimal Dish Optimization:** Designed specifically around the Sloth Day mandate — keeps dishwashing to an absolute minimum (typically 1 pan or bowl).
* **"The Lazy Payoff":** Every recipe explicitly details how much time, mental friction, and kitchen mess was saved.

### 3. Hands-Free Voice Cooking Guide (ElevenLabs Voice AI)
* **Instruction-Only Audio Filter:** Automatically extracts and cleans *only* the numbered cooking steps, stripping titles, ingredient lists, emojis, and preamble.
* **Custom Voice ID Support:** Works with default voices or custom cloned voices (e.g. `MmQVkVZnQ0dUbfWzcW6f`).
* **Zero-Touch Kitchen Companion:** Avoids smearing grease, flour, or sauce over laptop keyboards or phone screens while cooking.
* **Browser Voice Fallback:** Built-in Web Speech API narration when running completely offline or without an API key.

---

## 🏆 Hackathon & Sponsor Tracks Mapped

| Track | Prize | How SlothChef Qualifies |
| :--- | :--- | :--- |
| **Main Goal** | Official Badge & Swag | Original build with open-weight models at its core. |
| **Best Use of Gemma** | **$200 USD** | Uses Google's open-weight Gemma 2 model to reason over pantry combinations and minimize culinary complexity. |
| **Best Use of ElevenLabs** | **$100 USD** | Integrates ElevenLabs `eleven_turbo_v2_5` for latency-free voice narration with tailored Voice IDs. |
| **DEV Challenge: Week 3 ("Sloth Day")** | **$250 USD** | Directly tackles the theme: rewarding laziness and eliminating the chore of staring blankly into an open fridge. |

---

## 🛠️ 2. Developer Tutorial: Running & Extending SlothChef

### Step 1: Environment Setup
Ensure Python 3.10+ is available on your machine:
```bash
# Clone or navigate to the project directory
cd d:\projekt\Hacktober

# Activate the virtual environment
.\.venv\Scripts\activate
```

### Step 2: Install Core Dependencies
If setting up on a new machine:
```bash
pip install streamlit requests pillow
```

### Step 3: Launching the App
Run the Streamlit application:
```bash
streamlit run app.py
```
Open your browser to `http://localhost:8501`.

---

## 🧠 3. Code Architecture Overview

### 1. Prompt Engineering for Google Gemma
In [`app.py`](file:///d:/projekt/Hacktober/app.py), the prompt uses Gemma's structured turn tokens (`<start_of_turn>user`, `<end_of_turn>`, `<start_of_turn>model`):
```python
gemma_prompt = f"""<start_of_turn>user
You are SlothChef, an AI dedicated to International Sloth Day and Hacktoberfest 2026.
Your goal is to save the user maximum effort and time in the kitchen.
Ingredients available: {detected_ingredients}
Effort Level requested: {sloth_level}

Create an original, delicious, ultra-lazy recipe.
Format with:
1. 🦥 Recipe Name
2. ⏱️ Total Time & Dishes Used (keep to 1 pan/bowl)
3. 📝 Minimalist Ingredients
4. 🍳 3-Step Simple Instructions
5. 🦥 The Lazy Payoff: Why this saved mental energy.
<end_of_turn>
<start_of_turn>model
"""
```

### 2. Audio Step Filter & ElevenLabs Synthesis
To ensure the voice narrator doesn't read recipe titles or ingredients lists, regex extracts only the numbered cooking directions:
```python
import re

def extract_cooking_steps(recipe_text):
    # Regex slice out only the step-by-step section
    match = re.search(r'(?:Steps|Instructions)[\s\S]*?(?=(?:---|\Z|#### 🦥 The Lazy Payoff|The Lazy Payoff))', recipe_text, re.IGNORECASE)
    steps_text = match.group(0) if match else recipe_text
    # Clean emojis, markdown symbols, and whitespace
    cleaned = re.sub(r'#+\s*', '', steps_text)
    cleaned = re.sub(r'[\*\#\_]', '', cleaned)
    return re.sub(r'[🍳⏱️📝🦥✨]', '', cleaned).strip()
```

The cleaned instructions are sent to ElevenLabs' low-latency Turbo endpoint:
```python
url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
headers = {"xi-api-key": api_key, "Content-Type": "application/json"}
payload = {
    "text": extract_cooking_steps(recipe_text),
    "model_id": "eleven_turbo_v2_5",
    "voice_settings": {"stability": 0.5, "similarity_boost": 0.8}
}
response = requests.post(url, headers=headers, json=payload)
```

---

## 🚀 4. How to Submit to Hack Day & DEV Challenge

1. **Push your code to GitHub:**
   - Commit `app.py`, `README.md`, and requirements.
2. **Draft your submission post on DEV.to:**
   - Add tag `#hf26challenge`.
   - Highlight the **Lazy Payoff** and why **open-weight AI (Gemma)** makes running this locally/privately superior to closed APIs.
   - Mention your use of **Gemma** and **ElevenLabs**.
3. **Save Agent Session:**
   - DevRelay can automatically embed our pair-programming session transcript into your DEV submission!
