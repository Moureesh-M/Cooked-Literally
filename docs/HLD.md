# Cooked Literally — High-Level Design

## 1. Architecture overview

Cooked Literally is a browser client backed by a stateless FastAPI service. The service orchestrates external AI providers but retains deterministic fallbacks so the core demo remains usable without credentials.

```text
┌──────────────────────────────┐
│ React + Vite browser client  │
│ Camera / upload / form / TTS │
└──────────────┬───────────────┘
               │ HTTP JSON + multipart
               ▼
┌──────────────────────────────┐
│ FastAPI REST API              │
│ validation / orchestration    │
│ sanitization / fallback       │
└───────┬──────────┬───────────┘
        │          │
        ▼          ▼
┌──────────────┐ ┌─────────────────┐
│ Google AI    │ │ Hugging Face    │
│ Gemini vision│ │ Gemma 2 text    │
└──────────────┘ └─────────────────┘
        │
        ▼
┌──────────────────────────────┐
│ ElevenLabs TTS (optional)    │
└──────────────────────────────┘
```

The Streamlit application in `app.py` is a standalone prototype and parallel demo surface. The React/FastAPI path is the recommended product architecture.

## 2. Component responsibilities

### Frontend

- Owns camera lifecycle, file reading, preview state, form state, loading indicators, recipe rendering, and local audio URL cleanup.
- Sends user-controlled ingredients and selected effort tier to the API.
- Uses browser speech synthesis without a server round trip.
- Does not perform model inference or store provider credentials persistently.

### FastAPI service

- Exposes versioned REST endpoints.
- Validates request and response shapes with Pydantic.
- Encodes images for vision inference.
- Builds one explicit recipe prompt from the user's ingredients and selected effort level.
- Requires model output to be one JSON object and validates it before returning it.
- Sanitizes recipe titles.
- Selects a provider for the same prompt and makes deterministic fallback use explicit.
- Converts recipe steps into an ElevenLabs request.

### Provider adapters

The current implementation uses direct HTTP calls. The logical provider boundaries are:

- `VisionProvider`: image bytes → detected ingredient text.
- `RecipeProvider`: prompt → structured recipe.
- `NarrationProvider`: cleaned steps → audio bytes.

These boundaries should become explicit modules before production so provider-specific payloads do not remain embedded in route handlers.

### Configuration

- Environment variables provide server defaults.
- Request-level provider overrides are supported for the Hugging Face token and ElevenLabs key.
- The frontend currently uses a development-only fixed API URL and should use an environment-based configuration for deployment.

## 3. Main flows

### Pantry scan

1. Browser captures or reads an image.
2. Browser converts the data URL to a `Blob`.
3. Browser submits multipart form data to `/pantry/scan`.
4. API base64-encodes the image and calls Gemini vision when configured.
5. API cleans the returned text and returns detected ingredients.
6. Browser appends the result to the editable ingredient field.
7. If the provider is unavailable, the API returns staple fallback ingredients and identifies the method.

### Recipe generation

1. Browser waits for any image scan to finish and validates that ingredients exist.
2. Browser submits only the user ingredients, selected effort level, and optional provider token.
3. API creates one prompt: use these ingredients, make one good one-pan recipe, follow this effort tier, and return the documented JSON object.
4. API calls Gemma 2 when configured, then uses the same prompt with Gemini when configured.
5. API parses, sanitizes, and validates the returned JSON against `RecipeResponse`.
6. If no provider returns valid JSON, API constructs a tier-specific recipe and marks `source` as `deterministic_fallback`.
7. Browser prints the validated structured recipe and identifies fallback output to the user.

### Narration

1. Browser sends recipe name and steps when an ElevenLabs key is configured.
2. API strips markdown and decorative symbols from steps.
3. API sends the cleaned text to ElevenLabs.
4. API streams MP3 bytes back.
5. Browser creates an object URL and renders an audio player.
6. Independently, browser speech synthesis reads the same steps without ElevenLabs.

## 4. Deployment topology

### Local development

- Vite dev server: port `5173`.
- Uvicorn/FastAPI: port `8000`.
- CORS allows local development origins.
- `.env` is loaded by the backend.

### Production target

```text
Browser
  → CDN/static hosting for Vite assets
  → HTTPS API gateway / reverse proxy
  → FastAPI application replicas
  → Secret manager + provider APIs
```

The API should be stateless and horizontally scalable. No uploaded image or generated recipe needs to be persisted for the MVP.

## 5. Cross-cutting concerns

### Reliability

- Use bounded provider timeouts.
- Distinguish provider failure from a valid fallback.
- Validate model output before returning it.
- Add correlation/request IDs and structured logs.
- Add retry only for transient provider errors, with backoff and a total request budget.

### Security

- Use the configured explicit CORS allowlist.
- Enforce maximum image bytes, accepted MIME types, and request body limits.
- Keep secrets in environment/secret-manager storage.
- Redact credentials and provider response payloads from logs.
- Add rate limiting before exposing the API publicly.

### Observability

Track request count, latency, provider selected, fallback count, validation failures, and status code. Never record raw images, full prompts containing user data, or secret values.

## 6. Design constraints and trade-offs

| Decision | Benefit | Cost |
|---|---|---|
| Stateless API | Simple local and horizontal deployment | No history or resumable jobs |
| Synchronous provider calls | Simple UX and implementation | Request latency is bounded by external providers |
| Deterministic fallback | Demo remains usable without keys | Fallback ingredients may not match the photo |
| Browser speech fallback | No server/provider dependency | Voice quality and availability vary by browser |
| Runtime key entry | Easy demos and no server storage | Requires strong UI messaging and careful handling |

## 7. Evolution path

Introduce provider interfaces, a service layer, schema/version tests, and a queue only when latency, traffic, or provider reliability justifies the additional infrastructure. Avoid adding a database until the product requires user history, preferences, or analytics that cannot be handled by aggregate metrics.
