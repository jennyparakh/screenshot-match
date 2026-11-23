# Screenshot-to-layout studio

## What to build
- Add a dedicated **Layout studio** page and navigation link, available to signed-in users.
- Let users upload multiple PNG, JPEG, or WebP screenshots, review the originals, and analyze them individually or as a sequential batch.
- For each screenshot, call Lovable AI Gateway through an authenticated server function using the available `openai/gpt-6.1-sol` Responses model with image input and streamed structured output.
- Return a structured match plan containing an app summary, confidence, canvas dimensions, palette, typography, positioned UI elements, matched features, and implementation steps.
- Render the returned elements as a responsive visual application layout, with original/generated comparison, per-file progress and errors, and JSON plan download.

## Technical details
- Validate file type and size before upload; keep images in memory and add no database tables or persistent storage.
- Use `createServerFn` with `requireSupabaseAuth`, request-scoped AI provider/run-ID handling, strict nullable-safe schemas, and no automatic retries after failures.
- Treat screenshot-derived text as untrusted content and render it without HTML injection.
- Reuse LostLink’s pastel design tokens for the studio chrome; screenshot-derived colors apply only inside the generated preview.
- Add focused schema tests, run existing tests, exercise one real screenshot through the signed-in UI and AI Gateway, and verify the preview build and responsive layout.
