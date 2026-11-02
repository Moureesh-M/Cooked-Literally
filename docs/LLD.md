# Cooked Literally — Low-Level Design

## 1. Module layout

### Current implementation

```text
backend_api.py
  environment/configuration
  FastAPI application and CORS
  Pydantic request/response models
  recipe title and narration helpers
  health route
  pantry scan route
  recipe generation route
  narration route

frontend/src/App.tsx
  RecipeResult type
  camera and upload handlers
  API calls
  browser narration
  input and result views
frontend/src/App.css
frontend/src/index.css
```

### Recommended production decomposition

```text
backend/
  main.py                 # app creation and middleware
  config.py               # typed settings
  schemas.py              # API contracts
  routes/
    health.py
    pantry.py
    recipes.py
  services/
    pantry_service.py
    recipe_service.py
    narration_service.py
  providers/
    gemini.py
    huggingface.py
    elevenlabs.py
    fallback.py
  core/
    errors.py
    logging.py
    security.py
```

The decomposition is a maintainability target; the current single-file backend remains the source of truth for the MVP behavior.

## 2. Data contracts

### Recipe request

```json
{
  "ingredients": "2 eggs, leftover rice, soy sauce",
  "effort_level": "aint_cookin",
  "hf_token": "optional"
}
```

Rules:

- `ingredients` is required, trimmed, and limited to 2,000 characters.
- `effort_level` is one of `aint_cookin`, `can_cook`, `ramsay`; unknown values are rejected at the API boundary.
- `hf_token` is optional and must never be logged.

The request is intentionally small. The backend does not send an image, a UI description, or event/persona instructions to the recipe model. It sends the user's ingredient list and asks for one good one-pan recipe at the selected effort level.

### Recipe response

```json
{
  "name": "Crispy Pan-Toasted Egg Skillet",
  "time": "4 mins",
  "dishes": "1 skillet",
  "ingredients": ["eggs", "rice", "soy sauce"],
  "suggested_ingredients": [],
  "steps": [
    "Heat a skillet over medium heat...",
    "Add the ingredients and cook until...",
    "Serve immediately..."
  ],
  "payoff": "A fast meal with almost no cleanup.",
  "chef_notes": "Keep the pan hot and season in layers.",
  "effort_level": "aint_cookin",
  "source": "google",
  "fallback_reason": null
}
```

Required fields are `name`, `time`, `dishes`, `ingredients`, `steps`, `payoff`, and `effort_level`. `suggested_ingredients`, `chef_notes`, `source`, and `fallback_reason` communicate optional details and provider/fallback provenance.

### Pantry scan response

```json
{
  "detected_ingredients": "eggs, butter, cheddar cheese, bread slices",
  "method": "Multimodal Vision AI"
}
```

`method` should be one of a documented provider or fallback identifier. The frontend must treat `detected_ingredients` as user-editable inference, not verified inventory.

### Narration request

```json
{
  "recipe_text": "Crispy Pan-Toasted Egg Skillet",
  "steps": ["Heat the pan...", "Add the eggs..."],
  "eleven_api_key": "optional",
  "voice_id": "optional"
}
```

The current backend requires an ElevenLabs key for this endpoint and returns `audio/mpeg` on success.

## 3. Provider selection algorithms

### Vision

```text
read multipart image
validate size/type
if GOOGLE_API_KEY exists:
    call Gemini 2.0 Flash with inline image data
    if 200 and candidate text exists:
        normalize whitespace and remove markdown
        return provider result with fallback=false
return deterministic staple fallback with fallback=true
```

The current implementation accepts an optional `hf_token` for this endpoint but does not use it for vision; remove or implement that parameter consistently.

### Recipe

```text
validate ingredients and effort_level
build one prompt from the exact ingredient list and effort tier
if request HF token or server HF token exists:
    call Gemma 2 9B IT with that prompt
    extract one JSON object
    parse and validate RecipeResponse
    return if valid
if GOOGLE_API_KEY exists:
    call Gemini 2.0 Flash with the same prompt and JSON response mode
    extract one JSON object
    parse and validate RecipeResponse
    return if valid
construct a deterministic tier-specific RecipeResponse
mark source=deterministic_fallback and include fallback_reason
return
```

Model output parsing must reject malformed JSON, missing required fields, invalid list types, and mismatched effort levels. Do not return a success-shaped response for invalid model output without recording that fallback occurred.

### Narration

```text
select request key or server default
if no key:
    return HTTP 400
clean each step:
    remove markdown markers and decorative emoji
    trim whitespace
    prefix "Step N."
join steps with spaces
POST to ElevenLabs voice endpoint
if 200:
    return response bytes as audio/mpeg
if provider rejects:
    return mapped provider status and safe detail
if network error:
    return HTTP 503
```

`recipe_text` is currently accepted but not included in the synthesized text. Keep it in the contract for compatibility or remove it in a versioned API revision.

## 4. Frontend state machine

```text
INPUT
  ├─ start camera → CAMERA_ACTIVE
  ├─ upload/capture → IMAGE_ANALYZING
  └─ type ingredients → INPUT

IMAGE_ANALYZING
  ├─ success → INPUT_WITH_DETECTED_ITEMS
  └─ failure → INPUT_WITH_ERROR

INPUT_WITH_DETECTED_ITEMS
  └─ submit → RECIPE_GENERATING

RECIPE_GENERATING
  ├─ success → RECIPE_READY
  └─ failure → INPUT_WITH_ERROR

RECIPE_READY
  ├─ ElevenLabs request → AUDIO_LOADING → AUDIO_READY or RECIPE_READY
  ├─ browser speech → browser-controlled speech
  └─ reset → INPUT
```

Important lifecycle rules:

- Stop all camera tracks on capture, cancel, error, and unmount.
- Revoke the prior audio object URL before replacing it.
- Cancel browser speech on unmount.
- Disable generation while a request is active.
- Preserve the generated recipe if optional narration fails.

## 5. Error model

| Condition | Current behavior | Recommended behavior |
|---|---|---|
| Camera denied | Inline recovery message | Same, with upload/manual alternative |
| Backend unreachable | Inline error | Include request ID and retry action |
| Vision provider unavailable | Staple fallback | Mark `fallback: true` explicitly |
| Invalid model JSON | Try next provider/fallback | Log structured validation reason |
| Missing ElevenLabs key | HTTP 400 | Keep explicit 400 and promote browser fallback |
| ElevenLabs network error | HTTP 503 | Return retryable error code |
| Oversized/unsupported image | Not enforced | HTTP 413/415 before provider call |

## 6. Validation and tests

### Unit tests

- `sanitize_recipe_title` removes forbidden terms and returns a non-empty default.
- `extract_cooking_steps` removes markdown/decorative symbols and numbers steps.
- Each effort tier produces the expected fallback time, step count range, and suggested ingredient behavior.
- Provider JSON parsing handles valid JSON, fenced JSON, malformed JSON, and missing fields.

### API tests

- Health endpoint returns 200 and expected service name.
- Pantry scan accepts a valid image and rejects invalid media after limits are added.
- Recipe generation validates all response fields.
- Provider failure falls through in the documented order.
- Narration returns `audio/mpeg` for a successful mocked provider call.
- Missing narration key returns 400; provider connectivity failure returns 503.

### Frontend tests

- Camera start/capture/stop lifecycle.
- Upload triggers scan and appends detected text.
- Manual ingredient entry can generate without an image.
- Generation errors keep the form usable.
- Audio URL replacement revokes the old URL.
- Browser speech reads steps only.

### Contract and smoke tests

Run the backend against mocked external providers and the frontend against a local API. Verify the complete path: upload → scan → edit → generate → render → narrate/fallback.

## 7. Configuration

Current server variables:

```text
GOOGLE_API_KEY
HF_TOKEN
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
```

The frontend should add a Vite environment variable such as `VITE_API_BASE_URL` and avoid hard-coding `http://localhost:8000/api/v1`.

## 8. Operational limits

Recommended initial limits:

- Image payload: 8 MB maximum.
- Provider timeout: 25 seconds, matching the current implementation.
- Recipe prompt/output: bounded token budget.
- Narration text: cap by character count before provider submission.
- Per-IP rate limit on all AI-backed routes.

## 9. Known implementation gaps

1. The Streamlit prototype and React/FastAPI path contain overlapping generation logic and can drift.
2. Production should move runtime provider secrets out of browser request bodies and use a server-side secret manager.
3. The Streamlit prototype should eventually call the same API or shared service layer.
