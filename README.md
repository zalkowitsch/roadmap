# Roadmap Studio

A bring-your-own-JSON roadmap planner. React + Vite + dnd-kit.

- **No content baked in** — start from the minimal skeleton, or **drop a `.json`
  file anywhere** to load a roadmap.
- **Multi-roadmap** — keep several roadmaps side by side; all saved to `localStorage`.
- **Edit mode** — drag cards between months, reorder within a column, edit text
  inline, add/remove items and workstreams, pin hard dates.
- **Export / Import JSON** to share or version a roadmap.

## JSON shape
Same as the app's Export:
```json
{
  "months": ["Aug 1", "Sept 1", ...],
  "milestones": [{ "label": "Milestone 1", "monthIndex": 1, "title": "...", "date": "Sept 1" }],
  "areas": [
    {
      "name": "Clinical",
      "accent": "#6ee7b7",
      "meta": { "subtitle": "...", "dris": ["Name"] },
      "months": { "1": [ { "text": "Item", "sub": ["sub-item"] } ] }
    }
  ]
}
```

## Run / build
```bash
npm install
npm run dev       # local
npm run build     # → dist/
```

Deploys to GitHub Pages on every push to `main` (relative base, works on any subpath).
