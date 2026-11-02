import base64
import json
import logging
import os
import re
from typing import List, Literal, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

logger = logging.getLogger("cooked_literally")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
DEFAULT_ELEVEN_KEY = os.getenv("ELEVENLABS_API_KEY", "")
DEFAULT_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "MmQVkVZnQ0dUbfWzcW6f")
HF_TOKEN = os.getenv("HF_TOKEN", "")
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_INGREDIENTS_LENGTH = 2_000
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
EFFORT_LEVELS = ("aint_cookin", "can_cook", "ramsay")

app = FastAPI(
    title="Cooked Literally REST API",
    description="Generate one-pan recipes from user ingredients and an effort level.",
    version="1.1.0",
)

configured_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=configured_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class RecipeRequest(BaseModel):
    ingredients: str = Field(..., min_length=1, max_length=MAX_INGREDIENTS_LENGTH)
    effort_level: Literal["aint_cookin", "can_cook", "ramsay"] = "aint_cookin"
    hf_token: Optional[str] = Field(None, max_length=500)


class RecipeResponse(BaseModel):
    name: str
    time: str
    servings: str
    dishes: str
    ingredients: List[str]
    suggested_ingredients: List[str] = Field(default_factory=list)
    steps: List[str]
    payoff: str
    chef_notes: Optional[str] = None
    safety_notes: Optional[str] = None
    effort_level: Literal["aint_cookin", "can_cook", "ramsay"]
    source: Literal["huggingface", "google", "deterministic_fallback"] = "deterministic_fallback"
    fallback_reason: Optional[str] = None


class TTSRequest(BaseModel):
    steps: List[str] = Field(..., min_length=1, max_length=12)
    eleven_api_key: Optional[str] = Field(None, max_length=500)
    voice_id: Optional[str] = Field(DEFAULT_VOICE_ID, min_length=1, max_length=200)


def sanitize_recipe_title(title: str) -> str:
    clean = re.sub(
        r"(?i)\b(hacktoberfest|hacktober|hackathon|sloth[\w-]*|meta|challenge|lazy|ai)\b",
        "",
        str(title),
    )
    clean = re.sub(r"[^\w\s\'-]", "", clean)
    clean = re.sub(r"\s+", " ", clean).strip(" -:")
    return clean[:160] or "Quick Skillet Delight"


def extract_cooking_steps(steps: List[str]) -> str:
    clean_steps = []
    for index, step in enumerate(steps):
        cleaned = re.sub(r"[\*\#\_]", "", str(step))
        cleaned = re.sub(r"[🍳⏱️📝🦥✨]", "", cleaned).strip()
        clean_steps.append(f"Step {index + 1}. {cleaned}")
    return " ".join(clean_steps)


def normalize_ingredients(value: str) -> List[str]:
    items = [item.strip() for item in re.split(r"[,+\n]", value) if item.strip()]
    return list(dict.fromkeys(items))[:30]


def recipe_prompt(ingredients: str, effort_level: str) -> str:
    tier_rules = {
        "aint_cookin": "Make a 3-5 minute recipe using one pan and exactly 2 or 3 simple steps. Do not require chopping.",
        "can_cook": "Make a 12-18 minute recipe using one skillet and 4 or 5 practical steps.",
        "ramsay": "Make a 30-45 minute advanced one-pan recipe using 6-8 steps and optional aromatics or sauce ingredients.",
    }
    return f"""Create one genuinely good one-pan recipe using only the user's available ingredients as the core of the dish.
Do not invent a different pantry, do not discuss this request, and do not claim to search the internet.
The effort level controls the complexity: {tier_rules[effort_level]}
Available ingredients supplied by the user:
{ingredients}

Cooking requirements:
- Use ingredients from the supplied list in the recipe.
- Include practical quantities when the user's input gives enough information; otherwise use clear approximate amounts.
- You may list optional suggested ingredients only for can_cook or ramsay.
- Make every step actionable and include heat, approximate time, and a sensory doneness cue.
- Return only one JSON object. No Markdown, explanation, or code fences.
- Use exactly these keys and value types:
{{
  "name": "string",
  "time": "string",
  "servings": "string",
  "dishes": "string",
  "ingredients": ["string"],
  "suggested_ingredients": ["string"],
  "steps": ["string"],
  "payoff": "string",
  "chef_notes": "string",
  "safety_notes": "string",
  "effort_level": "{effort_level}"
}}"""


def parse_model_recipe(raw_text: str, effort_level: str, source: str) -> RecipeResponse:
    match = re.search(r"\{[\s\S]*\}", raw_text)
    if not match:
        raise ValueError("model response did not contain a JSON object")
    data = json.loads(match.group(0))
    data["name"] = sanitize_recipe_title(data.get("name", ""))
    data["effort_level"] = effort_level
    data["source"] = source
    data.setdefault("suggested_ingredients", [])
    data["ingredients"] = [str(item).strip() for item in data["ingredients"] if str(item).strip()]
    data["suggested_ingredients"] = [
        str(item).strip() for item in data["suggested_ingredients"] if str(item).strip()
    ]
    data["steps"] = [str(step).strip() for step in data["steps"] if str(step).strip()]
    recipe = RecipeResponse(**data)
    if not recipe.ingredients or not recipe.steps:
        raise ValueError("model response omitted ingredients or steps")
    return recipe


def deterministic_recipe(ingredients: str, effort_level: str, reason: str) -> RecipeResponse:
    items = normalize_ingredients(ingredients)
    main_item = items[0] if items else "your ingredients"
    second_item = items[1] if len(items) > 1 else "butter or oil"
    if effort_level == "ramsay":
        return RecipeResponse(
            name=sanitize_recipe_title(f"Pan-Seared {main_item.title()} with Skillet Reduction"),
            time="35 mins",
            servings="Serves 1-2",
            dishes="One heavy skillet, board, and spoon",
            ingredients=items or [main_item, second_item],
            suggested_ingredients=["garlic", "fresh herbs", "lemon", "cold butter"],
            steps=[
                f"Pat {main_item} dry and season it; heat the skillet over medium-high heat for 3 minutes until hot.",
                f"Sear {main_item} in a little oil for 3-4 minutes per side until deeply browned and nearly cooked.",
                f"Add {second_item} and aromatics; lower to medium heat and baste for 2 minutes until fragrant.",
                "Move the main ingredient to a plate and rest for 5 minutes while the pan stays warm.",
                "Deglaze the skillet with a splash of water, stock, or lemon and scrape up the browned bits.",
                "Whisk in cold butter off the heat until glossy, then taste and adjust the seasoning.",
                "Return the main ingredient briefly, coat it in the sauce, and serve hot from the skillet.",
            ],
            payoff="A deeply browned centerpiece with a glossy pan sauce and controlled technique.",
            chef_notes="Let the pan create color before moving the food.",
            safety_notes="Cook eggs, meat, and other perishable ingredients until safely done.",
            effort_level=effort_level,
            source="deterministic_fallback",
            fallback_reason=reason,
        )
    if effort_level == "can_cook":
        return RecipeResponse(
            name=sanitize_recipe_title(f"Golden {main_item.title()} Skillet"),
            time="15 mins",
            servings="Serves 1-2",
            dishes="One skillet and a spoon",
            ingredients=items or [main_item, second_item],
            suggested_ingredients=["lemon", "smoked paprika", "fresh herbs"],
            steps=[
                f"Heat one skillet over medium heat for 1 minute and add oil or butter.",
                f"Add {main_item} and cook for 5 minutes, stirring occasionally until lightly browned.",
                f"Add {second_item}, season, and cook for 4 minutes until sizzling and tender.",
                "Lower the heat and toss everything together for 2 minutes until glossy and fragrant.",
                "Taste, adjust seasoning, and serve directly from the skillet.",
            ],
            payoff="A balanced homemade meal with moderate effort and very little cleanup.",
            chef_notes="Season in layers instead of adding all the salt at the end.",
            safety_notes="Cook perishable ingredients until safely done before serving.",
            effort_level=effort_level,
            source="deterministic_fallback",
            fallback_reason=reason,
        )
    return RecipeResponse(
        name=sanitize_recipe_title(f"Crispy {main_item.title()} Skillet"),
        time="5 mins",
        servings="Serves 1",
        dishes="One skillet",
        ingredients=items or [main_item, second_item],
        suggested_ingredients=[],
        steps=[
            f"Heat a skillet over medium heat for 30 seconds and melt butter or warm oil.",
            f"Add {main_item} and {second_item}; cook for 2 minutes per side until golden and sizzling.",
            "Season, turn off the heat, and eat immediately from the skillet.",
        ],
        payoff="A fast, satisfying meal with no prep and almost no cleanup.",
        chef_notes="Keep the heat steady and do not overcrowd the pan.",
        safety_notes="Check that perishable ingredients are fully cooked before eating.",
        effort_level=effort_level,
        source="deterministic_fallback",
        fallback_reason=reason,
    )


async def call_huggingface(prompt: str, token: str, effort_level: str) -> RecipeResponse:
    url = "https://api-inference.huggingface.co/models/google/gemma-2-9b-it"
    payload = {
        "inputs": f"<start_of_turn>user\n{prompt}\n<end_of_turn>\n<start_of_turn>model\n",
        "parameters": {"max_new_tokens": 900, "temperature": 0.4, "return_full_text": False},
    }
    async with httpx.AsyncClient(timeout=25.0) as client:
        response = await client.post(url, headers={"Authorization": f"Bearer {token}"}, json=payload)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data, list) or not data or not data[0].get("generated_text"):
        raise ValueError("Hugging Face returned no generated text")
    return parse_model_recipe(data[0]["generated_text"], effort_level, "huggingface")


async def call_google(prompt: str, effort_level: str) -> RecipeResponse:
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.0-flash:generateContent?key={GOOGLE_API_KEY}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 1000,
            "responseMimeType": "application/json",
        },
    }
    async with httpx.AsyncClient(timeout=25.0) as client:
        response = await client.post(url, json=payload)
    response.raise_for_status()
    candidates = response.json().get("candidates", [])
    raw_text = candidates[0]["content"]["parts"][0]["text"] if candidates else ""
    return parse_model_recipe(raw_text, effort_level, "google")


@app.get("/api/v1/health", status_code=status.HTTP_200_OK)
def health_check():
    return {"status": "healthy", "service": "Cooked Literally REST API"}


@app.post("/api/v1/pantry/scan", status_code=status.HTTP_200_OK)
async def scan_pantry(image: UploadFile = File(...)):
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG, or WebP image.")
    image_bytes = await image.read(MAX_IMAGE_BYTES + 1)
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image must be 8 MB or smaller.")
    if not image_bytes:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    if not GOOGLE_API_KEY:
        return {
            "detected_ingredients": "eggs, butter, cheddar cheese, bread slices",
            "method": "deterministic_fallback",
            "fallback": True,
        }
    payload = {
        "contents": [{"parts": [
            {"inline_data": {"mime_type": image.content_type, "data": base64.b64encode(image_bytes).decode("ascii")}},
            {"text": "Identify visible edible ingredients. Return only a concise comma-separated list of item names. Do not guess brands, quantities, or non-food objects."},
        ]}],
    }
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GOOGLE_API_KEY}",
                json=payload,
            )
        response.raise_for_status()
        candidates = response.json().get("candidates", [])
        detected = candidates[0]["content"]["parts"][0]["text"].strip() if candidates else ""
        if not detected:
            raise ValueError("vision provider returned no ingredients")
        detected = re.sub(r"[\*\#\n]+", " ", detected)
        return {"detected_ingredients": re.sub(r"\s+", " ", detected).strip(), "method": "google_vision", "fallback": False}
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as error:
        logger.warning("Vision provider failed; using explicit fallback: %s", type(error).__name__)
        return {
            "detected_ingredients": "eggs, butter, cheddar cheese, bread slices",
            "method": "deterministic_fallback",
            "fallback": True,
        }


@app.post("/api/v1/recipes/generate", response_model=RecipeResponse, status_code=status.HTTP_201_CREATED)
async def generate_recipe(payload: RecipeRequest):
    ingredients = payload.ingredients.strip()
    if not ingredients:
        raise HTTPException(status_code=422, detail="Provide at least one ingredient.")
    prompt = recipe_prompt(ingredients, payload.effort_level)
    provider_errors = []
    token = payload.hf_token or HF_TOKEN
    if token:
        try:
            return await call_huggingface(prompt, token, payload.effort_level)
        except (httpx.HTTPError, ValueError, json.JSONDecodeError, KeyError, IndexError, TypeError) as error:
            provider_errors.append(f"huggingface:{type(error).__name__}")
            logger.warning("Recipe provider failed: huggingface (%s)", type(error).__name__)
    if GOOGLE_API_KEY:
        try:
            return await call_google(prompt, payload.effort_level)
        except (httpx.HTTPError, ValueError, json.JSONDecodeError, KeyError, IndexError, TypeError) as error:
            provider_errors.append(f"google:{type(error).__name__}")
            logger.warning("Recipe provider failed: google (%s)", type(error).__name__)
    reason = ",".join(provider_errors) if provider_errors else "no_recipe_provider_configured"
    return deterministic_recipe(ingredients, payload.effort_level, reason)


@app.post("/api/v1/recipes/narration", status_code=status.HTTP_200_OK)
async def stream_narration(payload: TTSRequest):
    key = payload.eleven_api_key.strip() if payload.eleven_api_key else DEFAULT_ELEVEN_KEY
    if not key:
        raise HTTPException(status_code=400, detail="ElevenLabs is not configured; use browser narration instead.")
    clean_text = extract_cooking_steps(payload.steps)
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            response = await client.post(
                f"https://api.elevenlabs.io/v1/text-to-speech/{payload.voice_id or DEFAULT_VOICE_ID}",
                headers={"xi-api-key": key, "Content-Type": "application/json"},
                json={"text": clean_text, "model_id": "eleven_turbo_v2_5", "voice_settings": {"stability": 0.5, "similarity_boost": 0.8}},
            )
        if response.status_code != 200:
            logger.warning("Narration provider returned HTTP %s", response.status_code)
            raise HTTPException(status_code=502, detail="Voice narration is temporarily unavailable.")
        return Response(content=response.content, media_type="audio/mpeg")
    except httpx.RequestError:
        raise HTTPException(status_code=503, detail="Voice narration is temporarily unavailable.")
