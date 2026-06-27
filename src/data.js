// Roadmap app — schema, defaults, and @-mention entities.
// NOTE: no roadmap content is hardcoded here. A board comes from either the
// minimal skeleton (emptyBoard) or an imported JSON in the same shape that
// the app's Export produces.

export const newId = () => "i" + Math.random().toString(36).slice(2, 9);

// Default month columns for a fresh skeleton. Any imported board carries its
// own `months`, so these only seed brand-new roadmaps.
export const DEFAULT_MONTHS = [
  "Aug 1", "Sept 1", "Oct 1", "Nov 1", "Dec 1",
  "Jan 1", "Feb 1", "Mar 1", "Apr 1", "May 1",
];

const PALETTE = [
  "#6ee7b7", "#fca5a5", "#93c5fd", "#c4b5fd",
  "#fcd34d", "#f9a8d4", "#67e8f9", "#fdba74",
];

// A minimal editable skeleton: month columns + one empty workstream.
export function emptyBoard() {
  return {
    months: [...DEFAULT_MONTHS],
    milestones: [],
    areas: [
      {
        id: "area-" + newId(),
        name: "",            // empty → shows the "New workstream" placeholder
        accent: PALETTE[0],
        meta: null,
        months: {},
      },
    ],
  };
}

export const nextAccent = (count) => PALETTE[count % PALETTE.length];

// Validate + normalize an imported board so the app never crashes on a bad file.
// Returns { ok, board, error }.
export function normalizeBoard(raw) {
  try {
    if (!raw || typeof raw !== "object") throw new Error("not an object");
    const months = Array.isArray(raw.months) && raw.months.length ? raw.months.map(String) : [...DEFAULT_MONTHS];
    const milestones = Array.isArray(raw.milestones) ? raw.milestones : [];
    if (!Array.isArray(raw.areas)) throw new Error("missing 'areas' array");
    const areas = raw.areas.map((a, ai) => ({
      id: a.id || "area-" + newId(),
      name: a.name || `Workstream ${ai + 1}`,
      accent: a.accent || nextAccent(ai),
      meta: a.meta ?? null,
      months: normalizeMonths(a.months),
    }));
    return { ok: true, board: { months, milestones, areas } };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function normalizeMonths(m) {
  const out = {};
  if (!m || typeof m !== "object") return out;
  for (const k of Object.keys(m)) {
    const arr = Array.isArray(m[k]) ? m[k] : [];
    out[k] = arr.map((it) => ({
      id: it.id || newId(),
      text: String(it.text ?? ""),
      sub: Array.isArray(it.sub) ? it.sub.map(String) : [],
      hardDate: it.hardDate || undefined,
      teams: Array.isArray(it.teams) ? it.teams : [],
      people: Array.isArray(it.people) ? it.people : [],
      dates: Array.isArray(it.dates) ? it.dates : [],
      status: it.status || undefined,
      comments: Array.isArray(it.comments) ? it.comments : [],
    }));
  }
  return out;
}

/* ---------- @-mention entities ---------- */
export const TEAMS = [
  { key: "SPOT", color: "#2f9e44" },
  { key: "BOBA", color: "#dc2626" },
  { key: "DRGN", color: "#4f46e5" },
  { key: "LCS", color: "#0891b2" },
  { key: "ARES", color: "#d97706" },
  { key: "Balrog", color: "#7c3aed" },
  { key: "Genesis", color: "#059669" },
  { key: "Colossus", color: "#be185d" },
  { key: "Hydra", color: "#0d9488" },
];

export const PEOPLE = [
  "Arkady", "Aryan", "Herui", "Gopesh", "Dhanvee",
  "Myles", "Elliot", "Lorenza", "Weiyang", "Aadit",
  "Suchi", "Tanmay", "Suhas", "Brian", "Adit", "Sean", "Sid",
];

export const STATUSES = [
  { key: "Planned", color: "#6b7280", dot: "#9ca3af" },
  { key: "In progress", color: "#2563eb", dot: "#60a5fa" },
  { key: "At risk", color: "#d97706", dot: "#fbbf24" },
  { key: "Blocked", color: "#dc2626", dot: "#f87171" },
  { key: "Done", color: "#059669", dot: "#34d399" },
];

export const REL_DATES = ["Today", "Tomorrow", "Next week", "End of month"];

// Map a chosen date label to a month column index (for auto-positioning).
export function dateToMonthIndex(label, months, currentMonthIdx = 0) {
  const exact = months.indexOf(label);
  if (exact >= 0) return exact;
  switch (label) {
    case "Today":
    case "Tomorrow":
    case "End of month":
      return currentMonthIdx;
    case "Next week":
      return Math.min(currentMonthIdx + 1, months.length - 1);
    default:
      return null;
  }
}
