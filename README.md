# Builder Engine — "Little Something For You"

This turns the one-off site you built for Buu into a reusable **template + builder**,
following the same `Template + Customer Data = Generated Website` architecture
described in your project plan — just scoped to this one design (5-page click-through
journey: intro → appreciation → heart-burst confession → meme roast → photo/music finale)
rather than the full 4-template marketing platform.

Opening the builder reproduces your original Buu site exactly (it's the default
config), and every text, gif, photo, song, meme box and color mood is editable from
there. It's a self-contained module — no backend, no auth, no payment — so it can be
dropped straight into `frontend/` as Phase 3 scaffolding for this template, or used
standalone to make more of these for other people/occasions.

## Files

```
engine.js       The renderer: SiteEngine.buildSiteHTML(config) -> full HTML string.
                Used by both the live preview and the export — so what you edit
                is pixel-for-pixel what gets downloaded.
site.css        The site's visual design, generalized with 4 swappable color
                themes (blush / lavender dream / sunset / mint) via CSS variables.
template.json   Documents the editable schema (pages, fields, limits) — reference
                only, not read at runtime.
builder.html    The builder UI: global fields + tabs (Theme, Page 1–5) on the
                left, a live iframe preview on the right. Stacks on mobile with
                a "Preview" toggle.
builder.css     Builder chrome styling.
builder.js      Builder state, form binding, gif/photo/song pickers, meme-box
                editor, autosave, and the "Download site" export.
preview.html    Renders the template's default config directly, no builder UI —
                useful for a quick sanity check of the template itself.
assets/gifs/    The gif library (your original 10 gifs) used to seed the picker.
assets/         Default demo photo + song (your originals), used as fallback.
```

## Running it

Because the export feature (and some gif thumbnails) load files via `fetch`,
open this through a local server rather than double-clicking the file:

```bash
cd surprise-site-for-buu-builder
python3 -m http.server 8000
```

Then visit `http://localhost:8000/builder.html`.

## How the builder works

- **Global fields** (their name, browser tab title) sit above the tabs since
  the name is used across every page.
- **Theme tab** swaps the whole color atmosphere (fonts stay the same).
- **Page 1–5 tabs** map directly to the five sections of the original site —
  each field mirrors something that was hardcoded in the original `index.html`.
- **Gif pickers** show your 10 original gifs as tappable thumbnails, plus a
  "+" button to upload a custom gif for that slot.
- **Meme boxes** (Page 4) support 1–6 entries, with reorder/remove controls
  and an "Add meme box" button.
- **Photo & song** upload via plain file inputs (client-side only — no
  storage backend yet, matching where Phase 3 stops in your plan).
- **Autosave**: every change is saved to `localStorage` after a short pause,
  so a refresh doesn't lose work. "Reset to example" clears back to the
  original Buu content.
- **Download site** produces one self-contained `.html` file — all gifs,
  the photo, the song and the CSS are inlined as data URLs, so it can be
  opened anywhere or emailed/shared without the `assets/` folder.

## Extending this later

- To fold this into the larger multi-template platform from your project
  plan, this template's config shape can become one more entry alongside
  `love-letter`, `birthday`, etc. — the render function (`buildSiteHTML`)
  plays the same role as `TemplateEngine.render()`, and `template.json`
  the same role as your other `templates/*.json` files.
- Swap `localStorage` autosave for a `PUT /projects/{id}` call once auth
  exists (Phase 4), and swap the client-side export for the real
  `POST /payments/verify` → generate-private-link flow (Phase 5/6) —
  the config object this builder produces is already shaped to drop
  straight into that `projects.content` / `projects.assets` structure.
- The gif/photo/song upload code here does no server-side validation
  (file-type/size checks are client-side only) — before this touches
  real infrastructure, revalidate on the backend per your security rules.
