# Cooked Literally — Product Requirements Document

## 1. Product summary

Cooked Literally turns an image of a user's fridge or counter, or a manually entered ingredient list, into a practical recipe. The user chooses how much effort they want to spend, receives a structured recipe, and can listen to cooking steps through ElevenLabs or the browser's built-in speech synthesis.

The product promise is: **minimal decisions, minimal dishes, dinner done**.

## 2. Problem statement

People frequently have ingredients but lack:

- A clear idea of what they can make.
- Confidence that the recipe matches their available time and effort.
- A hands-free way to follow instructions while cooking.

Existing recipe experiences often assume a planned shopping list, require extensive filtering, or present long instructions that are difficult to use with wet or dirty hands.

## 3. Goals

### MVP goals

1. Let a user provide ingredients through:
   - A webcam snapshot.
   - An uploaded image.
   - A comma-separated manual list.
2. Detect likely edible ingredients from an image.
3. Generate a valid, appetizing, structured recipe from the available ingredients.
4. Support three explicit effort tiers:
   - **Ain't Cookin'** — approximately 3–5 minutes, one pan, 2–3 steps.
   - **Can Cook** — approximately 12–18 minutes, moderate preparation.
   - **I am Ramsay** — approximately 30–45 minutes, advanced technique and optional upgrades.
5. Provide recipe metadata: title, time, servings, cookware, ingredients, steps, payoff, chef notes, and safety guidance.
6. Narrate only the cooking steps using ElevenLabs when configured.
7. Preserve a usable fallback path when external AI or TTS credentials are unavailable.

### Success metrics

| Metric | MVP target |
|---|---:|
| Successful recipe generation for valid input | >= 95% |
| Generated responses conforming to the recipe schema | >= 98% |
| Median time to recipe from manual ingredients | < 10 seconds |
| Image scan completion or explicit fallback | >= 99% |
| Users reaching a recipe after starting input | >= 80% |
| Narration contains steps only | 100% of generated narration requests |

## 4. Non-goals

- Nutrition, allergy, calorie, or medical advice.
- Ingredient inventory persistence or account management.
- Grocery ordering or shopping-list fulfillment.
- Guaranteed food safety certification.
- Social sharing, ratings, comments, or recipe history in MVP.
- Fully offline image recognition or language-model inference.

## 5. Target users and primary use cases

### Primary user

A busy or low-motivation home cook who has miscellaneous ingredients and wants a low-friction meal without planning.

### Use cases

1. **Fridge photo** — The user photographs visible ingredients, confirms or edits the detected list, selects an effort tier, and generates a recipe.
2. **Manual pantry entry** — The user types ingredients when camera access is unavailable or image recognition is inaccurate.
3. **Hands-free cooking** — The user plays a generated audio guide while preparing the recipe.
4. **Skill progression** — The same ingredients can produce a low-effort, standard, or gourmet recipe.
5. **No-key demo** — A user can experience the product with deterministic local fallbacks.

## 6. User journey

1. Open the web application.
2. Choose **Use Webcam** or **Upload Photo**, or type ingredients directly.
3. If an image is supplied, the system scans it and appends detected ingredients to the text field.
4. Review or correct the ingredient list.
5. Select an effort level.
6. Click **give me my food**.
7. Review the structured recipe.
8. Optionally:
   - Generate ElevenLabs audio if an API key is configured.
   - Use browser speech synthesis as a no-key fallback.
9. Start over to generate another recipe.

## 7. Functional requirements

### FR-1: Image input

- The UI shall support browser camera access using `getUserMedia`.
- The UI shall support image file selection.
- The UI shall show a preview and allow the user to clear it.
- Camera tracks shall be stopped when capture is complete or the component unmounts.
- Camera permission or device errors shall provide a manual-entry alternative.

### FR-2: Ingredient detection

- The API shall accept a multipart image upload.
- When configured, vision inference shall identify food ingredients and return a concise list.
- The API shall return a deterministic staple list when the vision provider is unavailable.
- Detection results shall be editable before recipe generation.

### FR-3: Recipe generation

- The API shall accept ingredients and an effort tier.
- The response shall conform to the `RecipeResponse` schema.
- The response shall include servings and concise safety guidance for perishable ingredients.
- The generator shall attempt Hugging Face Gemma 2 first when a token is available.
- It shall attempt Google AI Studio next when configured.
- It shall return a deterministic tier-specific recipe when providers fail or are unconfigured.
- Recipe titles shall be sanitized to remove product, event, and model-specific terminology.

### FR-4: Effort tiers

- `aint_cookin`: one pan, no meaningful prep, 2–3 steps, no suggested ingredients.
- `can_cook`: moderate home cooking, 4–5 steps, optional upgrades.
- `ramsay`: advanced multi-stage cooking, 6–8 steps, optional aromatics and sauce ingredients.
- The requested tier shall be echoed in `effort_level`.

### FR-5: Narration

- The API shall accept recipe steps and an optional ElevenLabs key and voice ID.
- The server shall clean formatting and prefix each step with a spoken step number.
- The server shall request `eleven_turbo_v2_5` and return `audio/mpeg`.
- Missing credentials or provider failures shall return explicit errors.
- The frontend shall offer browser speech synthesis independently of ElevenLabs.

### FR-6: Configuration

- The settings experience shall allow runtime entry of Hugging Face and ElevenLabs values.
- Server-side defaults shall be read from environment variables.
- Secrets shall not be persisted in an application database in MVP.

### FR-7: UX states

The UI shall visibly represent idle, camera active, image analysis, recipe generation, narration generation, success, and error states. Errors shall explain a recovery action rather than silently presenting a successful fallback.

## 8. API acceptance contract

| Endpoint | Request | Success response |
|---|---|---|
| `GET /api/v1/health` | None | `{ "status": "healthy", "service": "Cooked Literally REST API" }` |
| `POST /api/v1/pantry/scan` | Multipart `image`, optional `hf_token` | `{ "detected_ingredients": string, "method": string }` |
| `POST /api/v1/recipes/generate` | JSON `ingredients`, `effort_level`, optional `hf_token` | Structured recipe JSON |
| `POST /api/v1/recipes/narration` | JSON `steps`, optional key and voice ID | `audio/mpeg` bytes |

## 9. Safety, privacy, and trust requirements

- Display a disclaimer that generated recipes are suggestions and users must verify allergies, doneness, and food safety.
- Do not claim that detected ingredients are certain; make the list editable.
- Do not log image contents or API keys.
- Do not expose provider keys to browser logs or analytics.
- Limit uploaded image size and MIME types before production deployment.
- Avoid sending more image data than necessary to a provider.

## 10. Release plan

### Release 1 — Current MVP

Local React/Vite frontend, FastAPI backend, provider integrations, deterministic fallback, and browser speech fallback.

### Release 2 — Reliability

Provider timeouts and retry policy, input validation, image size limits, structured observability, contract tests, and configurable API base URL.

### Release 3 — Personalization

Allergy exclusions, dietary preferences, serving count, pantry confirmation, recipe regeneration, and saved recipes.

### Release 4 — Production platform

Authentication, rate limiting, managed secrets, asynchronous jobs for long-running inference, metrics, and deployment automation.

## 11. Open decisions

1. Whether image detection should replace or append to manually entered ingredients.
2. Whether ElevenLabs should be a server-side provider only or support browser-direct audio in a controlled architecture.
3. Whether ingredient and allergy preferences should be persisted.
4. Whether a recipe should be allowed to suggest ingredients the user does not have for the non-gourmet tier.
