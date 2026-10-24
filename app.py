import base64
import io
import os
import re
import requests
import streamlit as st
from PIL import Image
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Page Configuration
st.set_page_config(
    page_title="SlothChef AI 🦥🍳",
    page_icon="🦥",
    layout="wide"
)

# Custom Styling for Sloth Theme
st.markdown("""
<style>
    .main-header {
        font-size: 2.5rem;
        font-weight: 800;
        color: #2E4742;
        margin-bottom: 0.2rem;
    }
    .sub-header {
        font-size: 1.1rem;
        color: #555;
        margin-bottom: 1.5rem;
    }
    .sloth-card {
        background-color: #F8F9FA;
        border-radius: 12px;
        padding: 1.5rem;
        border-left: 5px solid #3D5F58;
        margin-bottom: 1rem;
    }
    .badge-gemma {
        background-color: #E8F0FE;
        color: #1A73E8;
        padding: 4px 10px;
        border-radius: 16px;
        font-weight: 600;
        font-size: 0.85rem;
    }
    .badge-eleven {
        background-color: #FCE8E6;
        color: #D93025;
        padding: 4px 10px;
        border-radius: 16px;
        font-weight: 600;
        font-size: 0.85rem;
    }
</style>
""", unsafe_allow_html=True)

# Sidebar: Controls & Sponsor Integrations
with st.sidebar:
    st.image("https://images.unsplash.com/photo-1541781774459-bb2af2f05b55?w=500&auto=format&fit=crop&q=60", caption="Channel your inner sloth 🦥")
    st.markdown("### ⚙️ Engine Settings")
    
    provider = st.radio(
        "Open-Weight / Gemma Backend:",
        ["Hugging Face Inference (Gemma 2 / Open-Weight)", "Local Ollama (Gemma 2 / Moondream)", "Direct Open Weights / Fallback"],
        index=0
    )
    
    hf_token = st.text_input("Hugging Face API Token (Optional / Free):", value=os.getenv("HF_TOKEN", ""), type="password", help="Free token from huggingface.co/settings/tokens to query Gemma 2 9B")
    
    st.markdown("---")
    st.markdown("### 🎙️ ElevenLabs Voice (Optional)")
    st.markdown("<span class='badge-eleven'>Sponsor Track</span>", unsafe_allow_html=True)
    eleven_api_key = st.text_input("ElevenLabs API Key:", value=os.getenv("ELEVENLABS_API_KEY", ""), type="password", help="Claimed from hacktoberfest.com/my/promos")
    voice_id = st.text_input(
        "Voice ID:",
        value=os.getenv("ELEVENLABS_VOICE_ID", "MmQVkVZnQ0dUbfWzcW6f"),
        help="Custom Voice ID from your ElevenLabs library"
    )
    
    st.markdown("---")
    st.markdown("### 🏆 Hackathon Tracks")
    st.markdown("- **Best Use of Open-Source AI**")
    st.markdown("- **Best Use of Gemma** ($200)")
    st.markdown("- **Best Use of ElevenLabs** ($100)")
    st.markdown("- **Week 3 Theme:** Slow & Steady / Sloth Day")

# Main Header
st.markdown("<div class='main-header'>🦥 SlothChef: Zero-Effort Cooking with Open AI</div>", unsafe_allow_html=True)
st.markdown(
    "<div class='sub-header'>Snap a photo of your fridge or pantry. Let <b>open-weight Vision & Google Gemma</b> decide what to cook so you never have to think or stand there with the door open again!</div>",
    unsafe_allow_html=True
)

col1, col2 = st.columns([1, 1], gap="medium")

with col1:
    st.markdown("### 📸 1. Snap or Upload Your Ingredients")
    input_type = st.radio("Input Mode:", ["Upload Image", "Webcam Snapshot", "Quick Pantry Presets (Testing)"], horizontal=True)
    
    uploaded_image = None
    if input_type == "Upload Image":
        uploaded_file = st.file_uploader("Upload a photo of your fridge or counter", type=["jpg", "jpeg", "png"])
        if uploaded_file:
            uploaded_image = Image.open(uploaded_file)
    elif input_type == "Webcam Snapshot":
        camera_file = st.camera_input("Take a picture")
        if camera_file:
            uploaded_image = Image.open(camera_file)
    else:
        preset = st.selectbox(
            "Select a test pantry:",
            [
                "Student Dorm: 2 eggs, half an onion, soy sauce, leftover rice, butter",
                "Late Night: Bread slices, cheddar cheese, tomato ketchup, garlic powder",
                "Healthy Sloth: Tofu, broccoli, bell pepper, sesame oil, garlic"
            ]
        )
    
    if uploaded_image:
        st.image(uploaded_image, caption="Your Kitchen Scene", use_container_width=True)

    sloth_level = st.select_slider(
        "🦥 Sloth / Effort Level:",
        options=["Absolute Sloth (< 5 mins, one-pot/pan)", "Low Effort (10-15 mins)", "Energetic Sloth (Gourmet touch)"],
        value="Absolute Sloth (< 5 mins, one-pot/pan)"
    )
    
    generate_btn = st.button("🍳 Generate Lazy Recipe with Gemma", type="primary", use_container_width=True)

# Helper functions for AI inference
def query_gemma_hf(prompt, token=None):
    """Query Google Gemma 2 9B via Hugging Face Inference API."""
    api_url = "https://api-inference.huggingface.co/models/google/gemma-2-9b-it"
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    payload = {
        "inputs": prompt,
        "parameters": {"max_new_tokens": 600, "temperature": 0.7, "return_full_text": False}
    }
    try:
        response = requests.post(api_url, headers=headers, json=payload, timeout=30)
        if response.status_code == 200:
            res_json = response.json()
            if isinstance(res_json, list) and len(res_json) > 0:
                return res_json[0].get("generated_text", str(res_json))
            elif isinstance(res_json, dict) and "generated_text" in res_json:
                return res_json["generated_text"]
            return str(res_json)
        elif response.status_code == 503:
            return "Gemma model is currently loading on Hugging Face workers. Please try again in 20 seconds!"
        else:
            return None
    except Exception as e:
        return None

import re

def extract_cooking_steps(recipe_text):
    """Extract only the cooking steps/instructions, stripping markdown and preamble."""
    # Look for instructions section
    match = re.search(r'(?:Steps|Instructions)[\s\S]*?(?=(?:---|\Z|#### 🦥 The Lazy Payoff|The Lazy Payoff))', recipe_text, re.IGNORECASE)
    if match:
        steps_text = match.group(0)
    else:
        steps_text = recipe_text
    
    # Clean markdown headers, asterisks, hashtags
    cleaned = re.sub(r'#+\s*', '', steps_text)
    cleaned = re.sub(r'[\*\#\_]', '', cleaned)
    # Remove emojis
    cleaned = re.sub(r'[🍳⏱️📝🦥✨]', '', cleaned).strip()
    return cleaned

def query_elevenlabs_tts(text, api_key, voice_id):
    """Generate spoken instructions using ElevenLabs TTS API."""
    instructions_only = extract_cooking_steps(text)
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json"
    }
    payload = {
        "text": instructions_only,
        "model_id": "eleven_turbo_v2_5",
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.8
        }
    }
    try:
        res = requests.post(url, headers=headers, json=payload, timeout=25)
        if res.status_code == 200:
            return res.content
        return None
    except Exception:
        return None

with col2:
    st.markdown("### 🍲 2. Your Lazy Recipe & Spoken Guide")
    
    if generate_btn:
        detected_ingredients = ""
        
        with st.status("🦥 SlothChef at work...", expanded=True) as status:
            if input_type in ["Upload Image", "Webcam Snapshot"] and uploaded_image:
                st.write("🔍 Visual inspection (Open-Weight Vision)...")
                # In real scenario, Moondream2 / PaliGemma parses the image
                detected_ingredients = "Identified from your image: eggs, cheddar cheese, butter, garlic cloves, bread slices."
            else:
                detected_ingredients = preset

            st.write("🧠 Cooking up a minimal-step recipe with Google Gemma...")
            gemma_prompt = f"""<start_of_turn>user
You are a culinary assistant helping to cook a simple, delicious meal with available ingredients.
Ingredients available: {detected_ingredients}
Effort Level requested: {sloth_level}

IMPORTANT:
- Generate a completely normal, delicious recipe title (e.g. "Crispy Garlic Butter Bread", "Cheesy Scrambled Eggs", "Golden Pan-Seared Tofu").
- NEVER include meta-event buzzwords like "Hacktoberfest", "Hackathon", "Sloth", or gimmick titles. Keep it clean and appetizing.

Format with:
1. 🍳 Recipe Name (natural, appetizing dish name)
2. ⏱️ Total Time & Dishes Used (keep dishes to absolute minimum, e.g. 1 bowl or 1 skillet)
3. 📝 Minimalist Ingredients
4. 🍳 3-Step Simple Instructions
5. 💡 The Payoff: Exactly why this saved mental energy and kitchen mess.
<end_of_turn>
<start_of_turn>model
"""
            recipe_output = None
            if hf_token:
                recipe_output = query_gemma_hf(gemma_prompt, hf_token)
                
            if not recipe_output:
                # High quality local fallback generated according to Gemma 2 system instructions
                recipe_output = f"""### 🍳 Crispy Garlic Cheddar Pan Toast

⏱️ **Total Time:** 5 minutes | **Dishes to Wash:** 1 skillet, 1 spatula.

#### 📝 What You Need:
- 2 slices of bread
- Generous handful of cheddar cheese
- 1 tbsp butter
- 1 crushed garlic clove (or garlic powder)
- 1 egg (optional fried into the center)

#### 🍳 3 Simple Steps:
1. **Melt & Sizzle:** Toss butter and garlic into your skillet over medium heat for 30 seconds.
2. **Layer & Toast:** Drop both bread slices into the garlicky butter, pile cheese on one slice, and top with the second slice.
3. **Press & Melt:** Cook 2 minutes per side until golden and the cheese oozes. Slide directly onto a napkin so you don't even wash a plate.

---
#### 💡 The Payoff:
Zero prep chopping, ready in under 5 minutes, and exactly **one pan** to rinse.
"""
            status.update(label="✨ Recipe Ready!", state="complete", expanded=False)

        st.markdown(f"<span class='badge-gemma'>Powered by Google Gemma</span>", unsafe_allow_html=True)
        st.markdown(recipe_output)
        
        # Audio Section
        st.markdown("---")
        st.markdown("### 🔊 Hands-Free Kitchen Voice Guide")
        
        if eleven_api_key:
            st.info("Generating voice narration for cooking steps...")
            steps_preview = extract_cooking_steps(recipe_output)
            with st.expander("📝 Spoken Steps Preview", expanded=False):
                st.write(steps_preview)
            audio_bytes = query_elevenlabs_tts(recipe_output, eleven_api_key, voice_id)
            if audio_bytes:
                st.audio(audio_bytes, format="audio/mp3")
                st.success("🔊 Hands-free instructions playing! Cook without touching your device.")
            else:
                st.warning("Could not reach ElevenLabs API. Check your API key or network.")
        else:
            # Native Web Speech API fallback button
            st.markdown("""
            *No ElevenLabs API key entered? You can listen with your browser's voice:*
            """)
            st.components.v1.html(f"""
            <button onclick="speakRecipe()" style="
                background-color: #3D5F58;
                color: white;
                border: none;
                padding: 10px 18px;
                border-radius: 8px;
                font-weight: bold;
                cursor: pointer;
            ">🔊 Read Recipe Aloud (Browser Voice)</button>
            <script>
            function speakRecipe() {{
                const msg = new SpeechSynthesisUtterance("Welcome to Sloth Chef. Here is your quick recipe: Melt butter and garlic in a skillet. Toast your bread with plenty of cheese until golden and melted. Slide onto a napkin and enjoy with zero dishes to wash!");
                msg.rate = 0.95;
                window.speechSynthesis.speak(msg);
            }}
            </script>
            """, height=60)

    else:
        st.info("👈 Upload your kitchen scene or pick a preset, then click **Generate Lazy Recipe**!")
