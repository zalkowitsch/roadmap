// Roadmap app — data model (v2), merge engine, date helpers, @-mention entities.
//
// MODEL (v2): the unified per-area TREE is the source of truth.
//   board = { version:2, startYear, months[], monthDates[], milestones[],
//             view, cycles[], people[],
//             areas: [ { id, name, accent, meta, tree: Node[] } ] }
//   Node  = { id, text, type, start_date?, end_date?,
//             status?, cycleId?, assigneeId?,   // reserved for R3 (sprints)
//             teams?, people?,                  // @-mention entities
//             children: Node[] }
//
// IDENTITY / MERGE: a node's identity is the ordered tuple of `text` from the
//   area root down to that node (case-folded, whitespace-collapsed). Nodes that
//   share the same full path collapse into one. Same name under different
//   parents = different nodes. See mergeNodeInto / buildTreeFromChains.
//
// POSITION: a node's month in the Deliveries view is derived from end_date
//   (endDateToMonthIndex). Dragging a card sets end_date to the target month;
//   the @-menu can set an exact start/end date. Last action wins.

export const newId = () => "i" + Math.random().toString(36).slice(2, 9);

export const DEFAULT_MONTHS = [
  "Aug 1", "Sept 1", "Oct 1", "Nov 1", "Dec 1",
  "Jan 1", "Feb 1", "Mar 1", "Apr 1", "May 1",
];

const PALETTE = [
  "#6ee7b7", "#fca5a5", "#93c5fd", "#c4b5fd",
  "#fcd34d", "#f9a8d4", "#67e8f9", "#fdba74",
];

export const nextAccent = (count) => PALETTE[count % PALETTE.length];

const CURRENT_YEAR = 2026; // app has no Date.now in pure module scope; default base year

/* ============================================================
   Node helpers
   ============================================================ */

export function makeNode(text = "", extra = {}) {
  return {
    id: newId(),
    text: String(text ?? ""),
    description: extra.description ?? null,   // markdown string (paragraph under the title)
    type: extra.type || "node",
    start_date: extra.start_date ?? null,
    end_date: extra.end_date ?? null,
    status: extra.status ?? null,
    cycleId: extra.cycleId ?? null,
    assigneeId: extra.assigneeId ?? null,
    teams: Array.isArray(extra.teams) ? extra.teams : [],
    people: Array.isArray(extra.people) ? extra.people : [],
    children: Array.isArray(extra.children) ? extra.children : [],
  };
}

// Normalize a name for identity comparison (the merge key).
export function foldName(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

// Validate/coerce an arbitrary node object coming from imported JSON.
function coerceNode(raw) {
  const n = makeNode(raw?.text, {
    description: raw?.description ?? null,
    type: raw?.type,
    start_date: isoOrNull(raw?.start_date),
    end_date: isoOrNull(raw?.end_date),
    status: raw?.status ?? null,
    cycleId: raw?.cycleId ?? null,
    assigneeId: raw?.assigneeId ?? null,
    teams: raw?.teams,
    people: raw?.people,
  });
  n.id = raw?.id || n.id;
  n.children = Array.isArray(raw?.children) ? raw.children.map(coerceNode) : [];
  return n;
}

/* ============================================================
   Markdown ↔ tree  (the card editor's level inference)
   Level = continuous accumulated depth: each heading (#=1, ##=2…) and each
   list indent adds depth. Plain text at the very start is a level-1 node.
   The first line of a node is its title; a plain paragraph below it (before
   the next marker) is that node's `description` (markdown).
   ============================================================ */

function mdLineInfo(raw) {
  const m = raw.match(/^(\s*)(#{1,6}\s+|[-*]\s+)?([\s\S]*)$/);
  const indent = m[1].length;
  const marker = m[2] || "";
  const text = m[3];
  if (/^#{1,6}\s+/.test(marker)) return { kind: "heading", hashes: marker.trim().length, text };
  if (/^[-*]\s+/.test(marker)) return { kind: "bullet", indent, text };
  return { kind: "text", text: raw.trim() };
}

// Parse a markdown string into an array of top-level nodes.
export function parseMarkdownToTree(md) {
  const lines = String(md ?? "").replace(/\r/g, "").split("\n").filter((l) => l.trim() !== "");
  const root = makeNode("__root__");
  const stack = [{ depth: 0, node: root }];
  let headingBase = 0;
  const indentUnit = (sp) => Math.floor(sp / 2); // 2 spaces == 1 indent level

  const attach = (depth, node) => {
    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack[stack.length - 1].node;
    parent.children.push(node);
    stack.push({ depth, node });
  };

  for (const raw of lines) {
    const info = mdLineInfo(raw);
    if (info.kind === "text") {
      const top = stack[stack.length - 1].node;
      if (top !== root) {
        top.description = (top.description ? top.description + "\n" : "") + info.text;
        continue;
      }
      const node = makeNode(info.text);
      attach(1, node);
      headingBase = 1;
      continue;
    }
    let depth;
    if (info.kind === "heading") { depth = info.hashes; headingBase = depth; }
    else { depth = headingBase + 1 + indentUnit(info.indent); }
    attach(depth, makeNode(info.text));
  }
  return root.children;
}

// Serialize a node tree back to markdown (heading for the first 3 levels, then
// indented bullets). Descriptions are emitted as plain paragraphs under the title.
export function treeToMarkdown(nodes, depth = 1) {
  const out = [];
  for (const n of nodes || []) {
    if (depth <= 3) out.push("#".repeat(depth) + " " + (n.text || ""));
    else out.push("  ".repeat(depth - 4) + "- " + (n.text || ""));
    if (n.description) out.push(n.description);
    if (n.children?.length) out.push(treeToMarkdown(n.children, depth + 1));
  }
  return out.join("\n");
}

/* ============================================================
   Merge engine — the heart of unification
   ============================================================ */

// Merge a single incoming node (and its subtree) into a target children[]
// array, by path identity. Mutates `targetChildren`. Returns the (existing or
// new) node it merged into.
export function mergeNodeInto(targetChildren, incoming) {
  const key = foldName(incoming.text);
  let existing = targetChildren.find((c) => foldName(c.text) === key);
  if (!existing) {
    existing = makeNode(incoming.text, {
      description: incoming.description,
      type: incoming.type,
      start_date: incoming.start_date,
      end_date: incoming.end_date,
      status: incoming.status,
      cycleId: incoming.cycleId,
      assigneeId: incoming.assigneeId,
      teams: incoming.teams,
      people: incoming.people,
    });
    existing.id = incoming.id || existing.id;
    targetChildren.push(existing);
  } else {
    // Unify dates: absent never overrides a real date.
    // Leaves: latest end_date wins (latest commitment). Earliest start wins.
    existing.start_date = minDate(existing.start_date, incoming.start_date);
    existing.end_date = maxDate(existing.end_date, incoming.end_date);
    // Description: an incoming (edited) description wins; absent never clears.
    if (incoming.description != null) existing.description = incoming.description;
    // Carry forward any R3/entity fields that are set on the incoming node.
    if (incoming.status) existing.status = incoming.status;
    if (incoming.cycleId) existing.cycleId = incoming.cycleId;
    if (incoming.assigneeId) existing.assigneeId = incoming.assigneeId;
    if (incoming.teams?.length) existing.teams = unionStr(existing.teams, incoming.teams);
    if (incoming.people?.length) existing.people = unionStr(existing.people, incoming.people);
  }
  for (const child of incoming.children || []) {
    mergeNodeInto(existing.children, child);
  }
  return existing;
}

// Build/extend a tree from a list of "chains" (root→leaf paths). Each chain is
// { path: string[], end_date?, start_date?, ... } — the leaf carries the dates.
export function buildTreeFromChains(chains, into = []) {
  for (const chain of chains) {
    const nodes = chain.path.map((name, i) => {
      const isLeaf = i === chain.path.length - 1;
      return makeNode(name, isLeaf
        ? { end_date: chain.end_date ?? null, start_date: chain.start_date ?? null,
            status: chain.status, teams: chain.teams, people: chain.people }
        : {});
    });
    // chain them parent→child
    for (let i = nodes.length - 1; i > 0; i--) nodes[i - 1].children = [nodes[i]];
    if (nodes.length) mergeNodeInto(into, nodes[0]);
  }
  return into;
}

// Locate a node by id anywhere in a tree. Returns { node, parent, path } or null.
export function locateNode(tree, id, parent = null, path = []) {
  for (const node of tree) {
    if (node.id === id) return { node, parent, path: [...path, node] };
    const hit = locateNode(node.children, id, node, [...path, node]);
    if (hit) return hit;
  }
  return null;
}

// Depth-first flatten with depth + ancestor path (for Gantt rows / autocomplete).
export function flattenTree(tree, rootName, depth = 0, ancestors = []) {
  const rows = [];
  for (const node of tree) {
    const path = rootName && depth === 0 ? [rootName, node.text] : [...ancestors, node.text];
    rows.push({ node, depth, path, isGroup: (node.children?.length || 0) > 0 });
    rows.push(...flattenTree(node.children, null, depth + 1, path));
  }
  return rows;
}

// Project an area's tree onto month columns for the Deliveries view.
// For each month, returns the set of TOP-LEVEL nodes that have any delivery
// (a dated descendant or own end_date) landing in that month, sliced to only
// the parts that land there. Each returned node keeps an `_path` (ancestor
// names) so the card can show its breadcrumb context.
//
// Result: { [monthIdx]: Node[] }  where each Node is a (sliced) clone.
export function projectAreaToMonths(area, monthDates) {
  const out = {};
  const visit = (node, ancestors) => {
    // does this node (or any descendant) land in some month? build a sliced
    // copy per month it touches.
    const sliceForMonth = (n, mi) => {
      const ownHere = n.end_date != null && endDateToMonthIndex(n.end_date, monthDates) === mi;
      const kids = (n.children || [])
        .map((c) => sliceForMonth(c, mi))
        .filter(Boolean);
      if (!ownHere && kids.length === 0) return null;
      return { ...n, children: kids };
    };
    // which months does this subtree touch?
    const monthsTouched = new Set();
    const collect = (n) => {
      if (n.end_date != null) {
        const mi = endDateToMonthIndex(n.end_date, monthDates);
        if (mi != null) monthsTouched.add(mi);
      }
      (n.children || []).forEach(collect);
    };
    collect(node);
    for (const mi of monthsTouched) {
      const sliced = sliceForMonth(node, mi);
      if (sliced) {
        sliced._path = ancestors;
        (out[mi] ||= []).push(sliced);
      }
    }
  };
  for (const top of area.tree || []) visit(top, [area.name].filter(Boolean));
  return out;
}

// Split a projected slice node into its non-editable CONTEXT prefix and the
// EDITABLE subtree. The context prefix is the leading chain of nodes that do
// NOT land in this month and have exactly one child (pure pass-through parents
// like Workflow → Read in an Oct slice). Editing stops — and becomes editable —
// at the first node that either lands here or branches (≠ 1 child).
//
// Returns { contextPath: string[], roots: Node[] } where contextPath is the
// list of context node TEXTS (to append to the breadcrumb) and roots is the
// array of editable top-level nodes (the slice from the branch point down).
export function sliceContextSplit(sliceNode, monthIdx, monthDates) {
  const contextPath = [];
  let cur = sliceNode;
  while (
    cur &&
    !(cur.end_date != null && endDateToMonthIndex(cur.end_date, monthDates) === monthIdx) &&
    (cur.children || []).length === 1
  ) {
    contextPath.push(cur.text);
    cur = cur.children[0];
  }
  return { contextPath, roots: cur ? [cur] : [] };
}

// Reconcile an edited month-slice back into the real area tree.
//   tree        : area.tree (mutated in place)
//   areaName    : the implicit root name
//   monthIdx    : the month being edited
//   monthDates  : board.monthDates
//   anchorPath  : folded node texts from the area root down to the parent under
//                 which the editable roots live (i.e. area + context prefix).
//                 Does NOT include the area name's fold? -> it DOES NOT; pass the
//                 context node folds only (area root is implicit at tree level).
//   builtRoots  : materialized board nodes (already date/meta-preserved + stamped)
//   beforeKeys  : Set of folded relative-path keys that were in THIS month's
//                 slice before editing (relative to anchorPath).
//
// Effect: deletes nodes the user removed (present in beforeKeys, absent from
// builtRoots) provided their ENTIRE subtree lands in this month (never drops
// other-month descendants), then merges builtRoots in (merge preserves
// other-month siblings/descendants).
export function reconcileSlice(tree, monthIdx, monthDates, anchorFolds, builtRoots, beforeKeys) {
  // locate the parent children array at anchorFolds (relative to tree root)
  let parentChildren = tree;
  for (const a of anchorFolds) {
    const hit = parentChildren.find((n) => foldName(n.text) === a);
    if (!hit) return; // anchor vanished; nothing to do
    parentChildren = hit.children;
  }

  // set of folded relative keys present AFTER the edit
  const afterKeys = new Set();
  const collectKeys = (nodes, anc) => {
    for (const n of nodes) {
      const key = [...anc, foldName(n.text)].join("›");
      afterKeys.add(key);
      collectKeys(n.children || [], [...anc, foldName(n.text)]);
    }
  };
  collectKeys(builtRoots, []);

  // deletions: in before-set, not in after-set
  for (const key of beforeKeys) {
    if (afterKeys.has(key)) continue;
    const segs = key.split("›");
    // walk to the node's parent array
    let arr = parentChildren;
    let parentArr = null, idxInParent = -1, found = null;
    for (let i = 0; i < segs.length; i++) {
      const j = arr.findIndex((n) => foldName(n.text) === segs[i]);
      if (j < 0) { found = null; break; }
      if (i === segs.length - 1) { parentArr = arr; idxInParent = j; found = arr[j]; }
      else arr = arr[j].children;
    }
    if (found && parentArr && allInMonth(found, monthIdx, monthDates)) {
      parentArr.splice(idxInParent, 1);
    }
  }

  // merge the edited roots back (preserves other-month content)
  for (const node of builtRoots) mergeNodeInto(parentChildren, node);
}

// True when a node AND all its descendants either have no end_date or land in
// the given month (i.e. nothing here belongs to another month).
export function allInMonth(node, monthIdx, monthDates) {
  if (node.end_date != null && endDateToMonthIndex(node.end_date, monthDates) !== monthIdx) return false;
  for (const c of node.children || []) {
    if (!allInMonth(c, monthIdx, monthDates)) return false;
  }
  return true;
}

// Collect the folded relative-path keys (relative to a context anchor) of every
// node in a projected slice's editable roots — used as the "before" set for
// reconciliation.
export function sliceKeys(roots) {
  const keys = new Set();
  const walk = (nodes, anc) => {
    for (const n of nodes) {
      const k = [...anc, foldName(n.text)].join("›");
      keys.add(k);
      walk(n.children || [], [...anc, foldName(n.text)]);
    }
  };
  walk(roots, []);
  return keys;
}

// Effective [start, end] for a node: own dates, else derived from descendants.
export function effectiveRange(node) {
  let start = node.start_date || null;
  let end = node.end_date || null;
  for (const c of node.children || []) {
    const r = effectiveRange(c);
    start = minDate(start, r.start);
    end = maxDate(end, r.end);
  }
  // a lone end with no start → thin bar starting same day
  if (end && !start) start = end;
  if (start && !end) end = start;
  return { start, end };
}

/* ============================================================
   Date helpers
   ============================================================ */

export function isoOrNull(v) {
  if (!v) return null;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export function minDate(a, b) { if (!a) return b || null; if (!b) return a; return cmp(a, b) <= 0 ? a : b; }
export function maxDate(a, b) { if (!a) return b || null; if (!b) return a; return cmp(a, b) >= 0 ? a : b; }

const MONTH_ABBR = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, sept:8, oct:9, nov:10, dec:11 };

// Parse a month label like "Aug 1" / "Sept 1" → { month, day }.
function parseMonthLabel(label) {
  const m = String(label).trim().match(/^([A-Za-z]+)\s*(\d+)?/);
  if (!m) return null;
  const month = MONTH_ABBR[m[1].toLowerCase()];
  if (month == null) return null;
  return { month, day: m[2] ? +m[2] : 1 };
}

// Given month labels + a startYear, produce sortable ISO dates, rolling the
// year forward when months wrap past December (e.g. Aug..Dec 2026, Jan..May 2027).
export function computeMonthDates(months, startYear = CURRENT_YEAR) {
  const out = [];
  let year = startYear;
  let prevMonth = -1;
  for (const label of months) {
    const p = parseMonthLabel(label);
    if (!p) { out.push(null); continue; }
    if (prevMonth >= 0 && p.month < prevMonth) year += 1; // wrapped past Dec
    prevMonth = p.month;
    out.push(`${year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`);
  }
  return out;
}

// Inverse: which month column does an ISO end_date fall into?
// Returns the index of the latest month whose date is <= the given date,
// clamped to [0, months-1]; null if no dates.
export function endDateToMonthIndex(iso, monthDates) {
  if (!iso || !monthDates?.length) return null;
  let idx = 0;
  for (let i = 0; i < monthDates.length; i++) {
    if (monthDates[i] && cmp(monthDates[i], iso) <= 0) idx = i;
  }
  // if the date is before the first month, still bucket into month 0
  return idx;
}

// The ISO date for a given month column (used when dragging a card to a month).
export function monthIndexToISO(monthIdx, monthDates) {
  return monthDates?.[monthIdx] ?? null;
}

/* ============================================================
   Board: skeleton, normalize, migrate
   ============================================================ */

export function emptyBoard() {
  const months = [...DEFAULT_MONTHS];
  return {
    version: 2,
    startYear: CURRENT_YEAR,
    months,
    monthDates: computeMonthDates(months, CURRENT_YEAR),
    milestones: [],
    view: "deliveries",
    cycles: [],   // R3
    people: [],   // R3 (engineers); distinct from @-mention PEOPLE catalog
    areas: [
      { id: "area-" + newId(), name: "", accent: PALETTE[0], meta: null, tree: [] },
    ],
  };
}

// Single funnel for both fresh-load and import. Returns { ok, board, error }.
export function normalizeBoard(raw) {
  try {
    if (!raw || typeof raw !== "object") throw new Error("not an object");
    const months = Array.isArray(raw.months) && raw.months.length ? raw.months.map(String) : [...DEFAULT_MONTHS];
    const startYear = Number.isFinite(raw.startYear) ? raw.startYear : CURRENT_YEAR;
    const monthDates = Array.isArray(raw.monthDates) && raw.monthDates.length === months.length
      ? raw.monthDates : computeMonthDates(months, startYear);
    const milestones = Array.isArray(raw.milestones) ? raw.milestones : [];
    if (!Array.isArray(raw.areas)) throw new Error("missing 'areas' array");

    const isV2 = raw.version === 2 || raw.areas.some((a) => Array.isArray(a.tree));

    const areas = raw.areas.map((a, ai) => ({
      id: a.id || "area-" + newId(),
      name: a.name || `Workstream ${ai + 1}`,
      accent: a.accent || nextAccent(ai),
      meta: a.meta ?? null,
      tree: isV2 ? (Array.isArray(a.tree) ? a.tree.map(coerceNode) : [])
                 : migrateAreaMonths(a, months, monthDates),
    }));

    return {
      ok: true,
      board: {
        version: 2, startYear, months, monthDates, milestones,
        view: raw.view === "gantt" ? "gantt" : "deliveries",
        cycles: Array.isArray(raw.cycles) ? raw.cycles : [],
        people: Array.isArray(raw.people) ? raw.people : [],
        areas,
      },
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// v1 → v2: each {text, sub[], hardDate} item in a month bucket becomes a
// title node whose end_date = the month's date (or hardDate), with sub[] as
// FLAT children (matches the old visual; deep nesting is a forward feature).
function migrateAreaMonths(area, months, monthDates) {
  const tree = [];
  const m = area.months;
  if (!m || typeof m !== "object") return tree;
  for (const k of Object.keys(m)) {
    const monthIdx = +k;
    const end = monthDates[monthIdx] || null;
    const items = Array.isArray(m[k]) ? m[k] : [];
    for (const it of items) {
      const explicit = parseHardDate(it.hardDate, months, monthDates);
      const leafEnd = explicit || end;
      const title = makeNode(it.text, { end_date: leafEnd });
      title.id = it.id || title.id;
      const subs = Array.isArray(it.sub) ? it.sub : [];
      title.children = subs.map((s) => makeNode(s, { end_date: leafEnd }));
      mergeNodeInto(tree, title);
    }
  }
  return tree;
}

// Best-effort parse of a free-form hardDate ("Sep 15", "Q4", "13 Oct") → ISO.
function parseHardDate(hd, months, monthDates) {
  if (!hd) return null;
  const s = String(hd).trim();
  // "13 Oct" / "Oct 13"
  let mm = s.match(/^([A-Za-z]+)\s+(\d{1,2})$/) || (s.match(/^(\d{1,2})\s+([A-Za-z]+)$/) && [null, RegExp.$2, RegExp.$1]);
  if (mm) {
    const month = MONTH_ABBR[String(mm[1]).toLowerCase()];
    if (month != null) {
      // infer year from the nearest month column with that month
      const yearGuess = guessYearForMonth(month, months, monthDates);
      return `${yearGuess}-${String(month + 1).padStart(2, "0")}-${String(+mm[2]).padStart(2, "0")}`;
    }
  }
  return null; // quarters / unparseable → fall back to the bucket month
}

function guessYearForMonth(month, months, monthDates) {
  for (let i = 0; i < months.length; i++) {
    const p = parseMonthLabel(months[i]);
    if (p && p.month === month && monthDates[i]) return +monthDates[i].slice(0, 4);
  }
  return CURRENT_YEAR;
}

/* ============================================================
   @-mention entities (dates + teams/people/status)
   ============================================================ */
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

// Map a relative/exact date label to an ISO date, given the board axis.
// currentMonthIdx anchors "Today"-like labels to a column.
export function relDateToISO(label, monthDates, currentMonthIdx = 0) {
  const exact = isoOrNull(label);
  if (exact) return exact;
  const base = monthDates?.[currentMonthIdx] || monthDates?.[0] || null;
  switch (label) {
    case "Today":
    case "Tomorrow":
    case "End of month":
      return base;
    case "Next week":
      return monthDates?.[Math.min(currentMonthIdx + 1, (monthDates?.length || 1) - 1)] || base;
    default:
      return null;
  }
}

// ── Natural-language date parsing (Notion-style) ───────────────────────────
// Understands: today, tomorrow, yesterday, weekday names (mon…sun), "next <wd>",
// "last <wd>", "in N days/weeks", "N days ago", and exact dates (ISO + common).
// Returns { iso, label } or null. `now` is injected for testability.
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WD_ALIASES = { sun: 0, mon: 1, tue: 2, tues: 2, wed: 3, weds: 3, thu: 4, thur: 4, thurs: 5, fri: 5, sat: 6 };

function toISO(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function prettyLabel(d, now) {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];
  return `${wd}, ${mon} ${d.getDate()}`;
}
function weekdayIndex(word) {
  word = word.toLowerCase();
  const full = WEEKDAYS.indexOf(word);
  if (full >= 0) return full;
  if (word in WD_ALIASES) return WD_ALIASES[word];
  return -1;
}

export function parseNaturalDate(input, now = new Date()) {
  if (!input) return null;
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mk = (d) => ({ iso: toISO(d), label: prettyLabel(d, now) });

  // exact ISO / common formats first
  const iso = isoOrNull(input.trim());
  if (iso) { const [y, m, d] = iso.split("-").map(Number); return mk(new Date(y, m - 1, d)); }

  if (s === "today") return mk(today);
  if (s === "tomorrow" || s === "tmr" || s === "tmrw") { const d = new Date(today); d.setDate(d.getDate() + 1); return mk(d); }
  if (s === "yesterday") { const d = new Date(today); d.setDate(d.getDate() - 1); return mk(d); }

  // "in N day(s)/week(s)"
  let m = s.match(/^in\s+(\d+)\s+(day|days|week|weeks)$/);
  if (m) { const n = +m[1] * (m[2].startsWith("week") ? 7 : 1); const d = new Date(today); d.setDate(d.getDate() + n); return mk(d); }
  // "N day(s)/week(s) ago"
  m = s.match(/^(\d+)\s+(day|days|week|weeks)\s+ago$/);
  if (m) { const n = +m[1] * (m[2].startsWith("week") ? 7 : 1); const d = new Date(today); d.setDate(d.getDate() - n); return mk(d); }

  // "next <weekday>" / "last <weekday>" / "this <weekday>" / bare "<weekday>"
  m = s.match(/^(next|last|this)?\s*([a-z]+)$/);
  if (m) {
    const wd = weekdayIndex(m[2]);
    if (wd >= 0) {
      const dir = m[1] || "";
      const d = new Date(today);
      if (dir === "last") {
        let back = (d.getDay() - wd + 7) % 7;
        if (back === 0) back = 7;                    // a week ago, not today
        d.setDate(d.getDate() - back);
      } else {
        // bare / this / next → the upcoming occurrence; "next" on today jumps a week
        let fwd = (wd - d.getDay() + 7) % 7;
        if (fwd === 0 && dir === "next") fwd = 7;
        d.setDate(d.getDate() + fwd);
      }
      return mk(d);
    }
  }
  return null;
}

// Suggest a few date options for a typeahead query (Notion-style list).
export function dateSuggestions(query, now = new Date()) {
  const q = (query || "").trim();
  const out = [];
  const seen = new Set();
  const push = (parsed) => { if (parsed && !seen.has(parsed.iso)) { seen.add(parsed.iso); out.push(parsed); } };
  if (!q) {
    // default offers
    ["today", "tomorrow", "next monday", "next friday"].forEach((k) => push(parseNaturalDate(k, now)));
  } else {
    push(parseNaturalDate(q, now));
    // also try prefixing weekday queries with next/last
    const wd = weekdayIndex(q);
    if (wd >= 0) { push(parseNaturalDate("next " + q, now)); push(parseNaturalDate("last " + q, now)); }
  }
  return out;
}

// Legacy: kept for any caller still mapping a label to a month column.
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

/* ---------- small utils ---------- */
function unionStr(a, b) {
  const set = new Set([...(a || []), ...(b || [])]);
  return [...set];
}
