import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners, useDroppable,
} from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  emptyBoard, normalizeBoard, nextAccent, newId,
  projectAreaToMonths, locateNode, makeNode, mergeNodeInto, foldName,
  monthIndexToISO, endDateToMonthIndex,
  sliceContextSplit, sliceKeys, reconcileSlice,
} from "./data.js";
import { Button, IconButton, Chip, Row, Spacer, EditableText, Outline, AtMenu, Sidebar } from "./ds";

const ROOT_KEY = "roadmaps:v3";     // workspaces layer
const STORE_KEY = "roadmaps:v2";    // legacy: { roadmaps, activeId }
const OLD_STORE_KEY = "roadmaps:v1";

/* ============================================================
   Multi-tenant store (localStorage)
   shape: {
     version: 1,
     workspaces: [{ id, name, roadmaps: [{ id, name, board }], activeId }],
     activeWorkspaceId,
   }
   Every board flows through normalizeBoard so v1 data upgrades to v2.
   The app derives a { roadmaps, activeId } view of the ACTIVE workspace, so
   every existing roadmap handler keeps working unchanged (see the setStore shim).
   ============================================================ */
function freshRoadmap() {
  return { id: "rm-" + newId(), name: "Untitled roadmap", board: emptyBoard() };
}
function freshWorkspace(name = "My workspace") {
  const r = freshRoadmap();
  return { id: "ws-" + newId(), name, roadmaps: [r], activeId: r.id };
}

// upgrade a legacy { roadmaps, activeId } object (normalize every board)
function upgradeLegacy(s) {
  if (!s?.roadmaps?.length) return null;
  return {
    roadmaps: s.roadmaps.map((r) => {
      const res = normalizeBoard(r.board);
      return { ...r, board: res.ok ? res.board : emptyBoard() };
    }),
    activeId: s.activeId,
  };
}

function loadStore() {
  // v3: workspaces layer
  try {
    const raw = localStorage.getItem(ROOT_KEY);
    if (raw) {
      const root = JSON.parse(raw);
      if (root?.workspaces?.length) {
        // re-normalize every board on load (forward-compatible)
        root.workspaces = root.workspaces.map((w) => {
          const up = upgradeLegacy({ roadmaps: w.roadmaps, activeId: w.activeId });
          return up ? { ...w, ...up } : { ...w, ...freshWorkspace(w.name) };
        });
        if (!root.activeWorkspaceId || !root.workspaces.some((w) => w.id === root.activeWorkspaceId)) {
          root.activeWorkspaceId = root.workspaces[0].id;
        }
        return root;
      }
    }
  } catch { /* fall through */ }

  // migrate from legacy v2 → wrap as a single workspace
  const wrapLegacy = (legacy) => {
    const up = upgradeLegacy(legacy);
    if (!up) return null;
    const ws = { id: "ws-default", name: "My workspace", roadmaps: up.roadmaps, activeId: up.activeId };
    return { version: 1, workspaces: [ws], activeWorkspaceId: ws.id };
  };
  for (const key of [STORE_KEY, OLD_STORE_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const root = wrapLegacy(JSON.parse(raw));
        if (root) { try { localStorage.setItem(ROOT_KEY, JSON.stringify(root)); } catch { /* quota */ } return root; }
      }
    } catch { /* fall through */ }
  }

  // brand-new
  const ws = freshWorkspace();
  return { version: 1, workspaces: [ws], activeWorkspaceId: ws.id };
}

/* ============================================================
   Display helpers — render a (sliced) node subtree inside a card.
   A node is "delivered here" when its own end_date lands in this month;
   otherwise it is shown dimmed as context (a parent of something that does).
   ============================================================ */
function NodeTree({ node, monthIdx, monthDates, depth = 0 }) {
  const here = node.end_date != null && endDateToMonthIndex(node.end_date, monthDates) === monthIdx;
  const hasKids = (node.children?.length || 0) > 0;
  return (
    <li className={"tn" + (here ? " here" : " ctx") + (hasKids ? " group" : "")} style={{ "--d": depth }}>
      <span className="tn-text">{node.text || <span className="tn-empty">—</span>}</span>
      {node.description && <div className="tn-desc">{node.description}</div>}
      {renderMeta(node)}
      {hasKids && (
        <ul className="tn-kids">
          {node.children.map((c) => (
            <NodeTree key={c.id} node={c} monthIdx={monthIdx} monthDates={monthDates} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function renderMeta(node) {
  const bits = [];
  if (node.status) bits.push(<Chip key="st" className="tn-chip">{node.status}</Chip>);
  for (const t of node.teams || []) bits.push(<Chip key={"t" + t} className="tn-chip">{t}</Chip>);
  for (const p of node.people || []) bits.push(<Chip key={"p" + p} className="tn-chip">@{p}</Chip>);
  if (!bits.length) return null;
  return <Row wrap gap={1} className="tn-meta">{bits}</Row>;
}

/* ---------- a draggable deliverable card (one projected top-level node) ----------
   The card edits ONLY this month's slice. Context-only ancestors (delivered in
   an earlier month, present here just so a descendant can show) collapse into
   the breadcrumb; only the part that lands in THIS month is editable. */
function Card({ card, areaId, monthIdx, monthDates, accent, edit, autoFocusId, onCommitCard, onDeleteCard, onAt }) {
  // a top-level node can project into several months → make the DnD id unique
  // per cell, but carry the real node id for mutations.
  const dndId = `${card.id}@${monthIdx}`;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: dndId, data: { areaId, monthIdx, nodeId: card.id }, disabled: !edit });
  const style = { transform: CSS.Translate.toString(transform), transition, "--a": accent };

  // split the slice: context prefix (breadcrumb) + editable roots (this month)
  const { contextPath, roots } = useMemo(
    () => sliceContextSplit(card, monthIdx, monthDates),
    [card, monthIdx, monthDates]
  );

  // editor seed = only the editable roots (the month slice from the branch down)
  const seed = useMemo(() => roots.map(stripToText), [roots]);

  // @-menu path for the card-level button targets the first editable root.
  const atPath = [...contextPath, roots[0]?.text].filter(Boolean);

  return (
    <div
      ref={setNodeRef}
      className={"item card" + (isDragging ? " dragging" : "")}
      style={style}
      {...(edit ? { ...listeners, ...attributes } : {})}
    >
      {edit ? (
        <Outline
          className="card-tree"
          seed={seed}
          editable
          autoFocus={autoFocusId === card.id}
          stopPointer
          onCommit={(nodes) => onCommitCard(card, nodes, monthIdx, contextPath, roots)}
          onAt={({ rect, path }) => onAt({ rect, path: [...contextPath, ...path], areaId, monthIdx })}
        />
      ) : (
        <ul className="tn-root">
          {roots.map((r) => (
            <NodeTree key={r.id} node={r} monthIdx={monthIdx} monthDates={monthDates} />
          ))}
        </ul>
      )}

      {edit && (
        <div className="ctrls" onPointerDown={(e) => e.stopPropagation()}>
          <IconButton title="@ dates / teams / status"
            onClick={(e) => onAt({ rect: e.currentTarget.getBoundingClientRect(), path: atPath, areaId, monthIdx })}>@</IconButton>
          <IconButton tone="danger" title="Delete" onClick={() => onDeleteCard(card, monthIdx, contextPath, roots)}>✕</IconButton>
        </div>
      )}
    </div>
  );
}

function CellDropZone({ id, areaId, monthIdx, empty, edit }) {
  const { setNodeRef, isOver } = useDroppable({ id: "cell:" + id, data: { areaId, monthIdx, cell: true } });
  if (!edit) return null;
  return <div ref={setNodeRef} className={"cell-dropzone" + (empty ? " big" : "") + (isOver ? " over" : "")} />;
}

function Cell({ areaId, monthIdx, cards, monthDates, accent, edit, overCellId, milestone, autoFocusId, onCommitCard, onDeleteCard, onAddHere, onAt }) {
  const cellId = `${areaId}::${monthIdx}`;
  const isTarget = overCellId === cellId;
  return (
    <div className={"cell" + (milestone ? " milestone" : "") + (isTarget ? " drop-target" : "") + (cards.length === 0 ? " empty" : "")}>
      {cards.map((card) => (
        <Card key={card.id} card={card}
          areaId={areaId} monthIdx={monthIdx} monthDates={monthDates}
          accent={accent} edit={edit} autoFocusId={autoFocusId}
          onCommitCard={onCommitCard} onDeleteCard={onDeleteCard} onAt={onAt} />
      ))}
      <CellDropZone id={cellId} areaId={areaId} monthIdx={monthIdx} empty={cards.length === 0} edit={edit} />
      {cards.length === 0 && !edit && <span className="empty-dot">·</span>}
      {edit && <Button variant="dashed" className="add-item" onClick={() => onAddHere(areaId, monthIdx)}>＋ add</Button>}
    </div>
  );
}

/* ---------- node → {text, description, children} (drop dates/ids for the seed) ---------- */
function stripToText(node) {
  return {
    text: node.text,
    description: node.description ?? null,
    children: (node.children || []).map(stripToText),
  };
}

/* ============================================================ */
export default function App() {
  const [root, setRoot] = useState(loadStore);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sb:collapsed") === "1"; } catch { return false; }
  });

  // Derive a { roadmaps, activeId } view of the ACTIVE workspace, and a
  // setStore shim that writes those updates back INTO that workspace — so every
  // existing roadmap handler (newRoadmap, commitCard, addHere, …) keeps working
  // unchanged against `store`/`setStore` while data really lives per-workspace.
  const activeWorkspace =
    root.workspaces.find((w) => w.id === root.activeWorkspaceId) || root.workspaces[0];
  const store = { roadmaps: activeWorkspace.roadmaps, activeId: activeWorkspace.activeId };
  const setStore = (updater) => setRoot((r) => {
    const cur = r.workspaces.find((w) => w.id === r.activeWorkspaceId) || r.workspaces[0];
    const view = { roadmaps: cur.roadmaps, activeId: cur.activeId };
    const next = typeof updater === "function" ? updater(view) : updater;
    return {
      ...r,
      workspaces: r.workspaces.map((w) =>
        w.id === cur.id ? { ...w, roadmaps: next.roadmaps, activeId: next.activeId } : w
      ),
    };
  });

  const [edit, setEdit] = useState(false);
  const [activeCard, setActiveCard] = useState(null);
  const [overCellId, setOverCellId] = useState(null);
  const [toast, setToast] = useState(null);
  const [dragFile, setDragFile] = useState(false);
  const [justAddedId, setJustAddedId] = useState(null);
  const [atMenu, setAtMenu] = useState(null); // { x, y, areaId, monthIdx, path }
  const fileRef = useRef(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const active = store.roadmaps.find((r) => r.id === store.activeId) || store.roadmaps[0];
  const board = active.board;
  const months = board.months;
  const monthDates = board.monthDates;

  const milestoneMonths = useMemo(
    () => new Set((board.milestones || []).map((m) => m.monthIndex)),
    [board.milestones]
  );
  const msByMonth = useMemo(() => {
    const m = {}; (board.milestones || []).forEach((x) => (m[x.monthIndex] = x)); return m;
  }, [board.milestones]);

  // projection: area.id -> { monthIdx -> cards[] }
  const projections = useMemo(() => {
    const out = {};
    for (const a of board.areas) out[a.id] = projectAreaToMonths(a, monthDates);
    return out;
  }, [board.areas, monthDates]);

  useEffect(() => {
    try { localStorage.setItem(ROOT_KEY, JSON.stringify(root)); } catch { /* quota */ }
  }, [root]);

  useEffect(() => {
    try { localStorage.setItem("sb:collapsed", collapsed ? "1" : "0"); } catch { /* quota */ }
  }, [collapsed]);



  useEffect(() => {
    if (!justAddedId) return;
    const t = setTimeout(() => setJustAddedId(null), 400);
    return () => clearTimeout(t);
  }, [justAddedId]);

  // Keyboard shortcut: ⌘/Ctrl+E toggles edit mode; Esc leaves it. We ignore ⌘E
  // while the caret is in an editable field so it never fights typing.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName || "");
      if ((e.metaKey || e.ctrlKey) && (e.key === "e" || e.key === "E")) {
        if (typing) return;
        e.preventDefault();
        setEdit((v) => !v);
      } else if (e.key === "Escape" && edit && !typing && !atMenu) {
        setEdit(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [edit, atMenu]);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 1900); };

  const setBoard = (fn) => setStore((s) => {
    const next = structuredClone(s);
    const a = next.roadmaps.find((r) => r.id === next.activeId);
    fn(a.board);
    return next;
  });

  /* ---------- tree commit: replace a card's subtree, stamping new leaves ---------- */
  // Build an index of existing dates/meta by path-key so re-merging preserves them.
  const indexByPath = (tree, rootName) => {
    const idx = new Map();
    const walk = (nodes, anc) => {
      for (const n of nodes) {
        const key = [...anc, foldName(n.text)].join("›");
        idx.set(key, n);
        walk(n.children || [], [...anc, foldName(n.text)]);
      }
    };
    walk(tree, [foldName(rootName)]);
    return idx;
  };

  // Convert editor nodes ({text,children}) into board nodes, preserving existing
  // dates/meta by path and stamping NEW leaves with this month's end_date.
  const materialize = (editorNodes, anc, idx, stampISO) => {
    return editorNodes
      .filter((n) => (n.text || "").trim() !== "" || (n.children && n.children.length))
      .map((n) => {
        const keyAnc = [...anc, foldName(n.text)];
        const existing = idx.get(keyAnc.join("›"));
        const kids = materialize(n.children || [], keyAnc, idx, stampISO);
        const isLeaf = kids.length === 0;
        const node = makeNode(n.text, existing ? {
          type: existing.type, start_date: existing.start_date, end_date: existing.end_date,
          status: existing.status, cycleId: existing.cycleId, assigneeId: existing.assigneeId,
          teams: existing.teams, people: existing.people,
          // description comes from the EDITOR (what the user just typed); fall
          // back to the existing one only when the editor produced none.
          description: n.description != null ? n.description : existing.description,
        } : { description: n.description });
        if (existing?.id) node.id = existing.id;
        node.children = kids;
        // stamp a freshly-created leaf with the month it was authored in
        if (isLeaf && !node.end_date && !existing) node.end_date = stampISO;
        return node;
      });
  };

  // Commit one card: reconcile the edited month-slice back into the area tree.
  //   contextPath = the non-editable breadcrumb tail (context nodes under the
  //                 area root); the editable roots live directly under it.
  //   roots       = the slice's editable roots BEFORE the edit (for delete diff).
  const commitCard = (areaId, card, editorNodes, monthIdx, contextPath, roots) => setBoard((b) => {
    const area = b.areas.find((a) => a.id === areaId);
    if (!area) return;
    const idx = indexByPath(area.tree, area.name);
    const stampISO = monthIndexToISO(monthIdx, b.monthDates);
    // anchor (folded) = the context nodes from the area root down. The area root
    // is implicit (tree level), so it is NOT part of anchorFolds.
    const ctxFolds = (contextPath || []).map(foldName);
    // materialize editor text into board nodes, keyed under area.name › context…
    const matAnc = [foldName(area.name), ...ctxFolds];
    const built = materialize(editorNodes, matAnc, idx, stampISO);
    // before-set: keys of this-month nodes that existed under the anchor
    const beforeKeys = sliceKeys(roots || []);
    reconcileSlice(area.tree, monthIdx, b.monthDates, ctxFolds, built, beforeKeys);
  });

  // Delete every part of this card's slice that belongs to THIS month, leaving
  // other-month descendants intact.
  const deleteCard = (areaId, card, monthIdx, contextPath, roots) => setBoard((b) => {
    const area = b.areas.find((a) => a.id === areaId);
    if (!area) return;
    const ctxFolds = (contextPath || []).map(foldName);
    const beforeKeys = sliceKeys(roots || []);
    // reconcile with NO built roots → every before-key not re-added is removed
    // (subject to allInMonth guard inside reconcileSlice)
    reconcileSlice(area.tree, monthIdx, b.monthDates, ctxFolds, [], beforeKeys);
    // prune now-empty context chain (a context node left with no children and
    // no own date in any month is dead weight)
    pruneEmptyChain(area.tree, ctxFolds);
  });

  // "+ add": create an empty top-level node in this area, stamped to this month.
  const addHere = (areaId, monthIdx) => {
    const id = newId();
    setBoard((b) => {
      const area = b.areas.find((a) => a.id === areaId);
      const node = makeNode("", { end_date: monthIndexToISO(monthIdx, b.monthDates) });
      node.id = id;
      area.tree.push(node);
    });
    setJustAddedId(id);
  };

  /* ---------- @-menu: set a node's date / entity ---------- */
  const applyAt = (action) => {
    if (!atMenu) return;
    const { areaId, path } = atMenu;
    setBoard((b) => {
      const area = b.areas.find((a) => a.id === areaId);
      if (!area) return;
      // resolve the node by path (path = node texts from the card root down)
      const target = resolveByPath(area.tree, path);
      if (!target) return;
      if (action.kind === "date") target[action.field] = action.iso;
      else if (action.kind === "status") target.status = action.value;
      else if (action.kind === "team") target.teams = uniq([...(target.teams || []), action.value]);
      else if (action.kind === "person") target.people = uniq([...(target.people || []), action.value]);
    });
    if (action.kind === "date") flash(`${action.field === "end_date" ? "End" : "Start"} date set`);
  };

  /* ---------- area mutations ---------- */
  const addArea = () => {
    const id = "area-" + newId();
    setBoard((b) => { b.areas.push({ id, name: "", accent: nextAccent(b.areas.length), meta: null, tree: [] }); });
    setJustAddedId(id);
  };
  const renameArea = (areaId, name) => setBoard((b) => { const a = b.areas.find((x) => x.id === areaId); if (a) a.name = name; });
  const deleteArea = (areaId) => {
    if (!confirm("Delete this workstream and all its items?")) return;
    setBoard((b) => { b.areas = b.areas.filter((a) => a.id !== areaId); });
  };

  /* ---------- dnd: dragging a card to a month sets its end_date ---------- */
  const onDragStart = (e) => {
    const d = e.active.data.current;
    if (!d) return;
    const card = projections[d.areaId]?.[d.monthIdx]?.find((c) => c.id === d.nodeId);
    setActiveCard(card || null);
  };
  const onDragOver = (e) => {
    const o = e.over; if (!o) { setOverCellId(null); return; }
    const d = o.data.current; if (d) setOverCellId(`${d.areaId}::${d.monthIdx}`);
  };
  const onDragEnd = (e) => {
    setActiveCard(null); setOverCellId(null);
    const { active: act, over } = e; if (!over) return;
    const ad = act.data.current, od = over.data.current;
    if (!ad || !od) return;
    if (od.monthIdx === ad.monthIdx && od.areaId === ad.areaId) return; // no-op
    setBoard((b) => {
      const area = b.areas.find((a) => a.id === ad.areaId);
      if (!area) return;
      const found = locateNode(area.tree, ad.nodeId);
      if (!found) return;
      found.node.end_date = monthIndexToISO(od.monthIdx, b.monthDates);
    });
    flash("Moved to " + months[od.monthIdx]);
  };

  /* ---------- workspace (tenant) management ---------- */
  const switchWorkspace = (id) => setRoot((r) => ({ ...r, activeWorkspaceId: id }));
  const addWorkspace = () => setRoot((r) => {
    const ws = freshWorkspace("New workspace");
    return { ...r, workspaces: [...r.workspaces, ws], activeWorkspaceId: ws.id };
  });
  const workspaceSettings = () => flash("Workspace settings — coming soon");
  const workspaceMembers = () => flash("Members & sharing — coming soon");

  /* ---------- roadmap management ---------- */
  const newRoadmap = () => setStore((s) => {
    const r = { id: "rm-" + newId(), name: "Untitled roadmap", board: emptyBoard() };
    return { roadmaps: [...s.roadmaps, r], activeId: r.id };
  });
  const switchRoadmap = (id) => setStore((s) => ({ ...s, activeId: id }));
  const renameRoadmap = (id, name) => {
    // sidebar passes the new name inline; legacy callers omit it → prompt
    if (name == null) {
      const cur = store.roadmaps.find((r) => r.id === id);
      name = prompt("Roadmap name:", cur?.name || "");
      if (name == null) return;
    }
    const clean = (name || "").trim();
    setStore((s) => ({ ...s, roadmaps: s.roadmaps.map((r) => r.id === id ? { ...r, name: clean || r.name } : r) }));
  };
  const deleteRoadmap = (id) => {
    if (store.roadmaps.length === 1) { flash("Keep at least one roadmap"); return; }
    if (!confirm("Delete this roadmap? This can't be undone.")) return;
    setStore((s) => {
      const roadmaps = s.roadmaps.filter((r) => r.id !== id);
      return { roadmaps, activeId: s.activeId === id ? roadmaps[0].id : s.activeId };
    });
  };

  /* ---------- import / export ---------- */
  const importBoard = (raw, name) => {
    const res = normalizeBoard(raw);
    if (!res.ok) { flash("Import failed — " + res.error); return; }
    setStore((s) => {
      const r = { id: "rm-" + newId(), name: name || "Imported roadmap", board: res.board };
      return { roadmaps: [...s.roadmaps, r], activeId: r.id };
    });
    flash("Imported as a new roadmap");
  };
  const importFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try { importBoard(JSON.parse(reader.result), file.name.replace(/\.json$/i, "")); }
      catch { flash("Import failed — invalid JSON"); }
    };
    reader.readAsText(file);
  };
  const onFileInput = (e) => { importFile(e.target.files?.[0]); e.target.value = ""; };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = (active.name || "roadmap").replace(/\s+/g, "-").toLowerCase() + ".json";
    a.click(); URL.revokeObjectURL(url);
    flash("Exported " + a.download);
  };

  /* ---------- whole-window file drop ---------- */
  const onDrop = (e) => {
    e.preventDefault(); setDragFile(false);
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.name.endsWith(".json") || f.type === "application/json");
    if (file) importFile(file); else flash("Drop a .json roadmap file");
  };
  const onDragEnterWin = (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); setDragFile(true); } };
  const onDragOverWin = (e) => { if (dragFile) e.preventDefault(); };
  const onDragLeaveWin = (e) => { if (e.clientX <= 0 && e.clientY <= 0) setDragFile(false); };

  const openAt = ({ rect, path, areaId, monthIdx }) => {
    setAtMenu({ x: rect.left, y: (rect.bottom || rect.top || 200) + 4, path, areaId, monthIdx });
  };

  return (
    <div className="shell">
      <Sidebar
        workspace={{ id: activeWorkspace.id, name: activeWorkspace.name, plan: "Free plan", memberCount: 1 }}
        workspaces={root.workspaces.map((w) => ({ id: w.id, name: w.name }))}
        roadmaps={store.roadmaps.map((r) => ({ id: r.id, name: r.name }))}
        activeId={store.activeId}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
        onSwitchWorkspace={switchWorkspace}
        onAddWorkspace={addWorkspace}
        onWorkspaceSettings={workspaceSettings}
        onMembers={workspaceMembers}
        onSelectRoadmap={switchRoadmap}
        onRenameRoadmap={renameRoadmap}
        onNewRoadmap={newRoadmap}
        onDeleteRoadmap={deleteRoadmap}
      />
    <div
      className={"app shell-main" + (edit ? " editmode" : "")}
      onDrop={onDrop} onDragEnter={onDragEnterWin} onDragOver={onDragOverWin} onDragLeave={onDragLeaveWin}
    >
      {/* Header = a SLIM sticky topbar (always pinned, FIXED height) + a non-sticky
          intro that simply scrolls away. No animated heights, no two stickies
          depending on each other → no flicker. The month-head sticks below the
          topbar at a CONSTANT offset (--topbar-h). */}
      <header className={"topbar" + (edit ? " editing" : "")}>
        <h1 className="topbar-title" title={active.name}>{active.name || "Untitled roadmap"}</h1>
        <Row wrap gap={3} className="toolbar">
          <Button active={edit} dot onClick={() => setEdit((v) => !v)} title="⌘E / Ctrl+E">{edit ? "Editing — click to lock" : "Edit mode"}</Button>
          <Button onClick={exportJSON}>⤓ Export</Button>
          <Button onClick={() => fileRef.current?.click()}>⤒ Import JSON</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFileInput} />
        </Row>
      </header>

      {/* intro — eyebrow, big title, lede, roadmap tabs, hint. Scrolls away. */}
      <section className="intro">
        <p className="eyebrow">Roadmap Studio</p>
        <EditableText
          as="h1"
          className="editable-h1 intro-title"
          value={active.name}
          placeholder="Untitled roadmap"
          editable={edit}
          onCommit={(t) => renameRoadmap_inline(t)}
          title={edit ? "Click to rename" : undefined}
        />
        <p className="lede">
          A roadmap is a JSON you bring. Items live in a unified tree — type <code>Title › item › subitem</code> with
          Tab to nest, and the same path merges across months. Drag a card to a month, or use <code>@</code> to set dates.
        </p>

        <span className="hint">{edit ? "Tab nests · drag card → month · @ dates/teams/status · ✕ delete" : "view mode — toggle Edit to plan"}</span>
      </section>

      {/* milestone banner */}
      {(board.milestones?.length > 0) && (
        <section className="milestones">
          {board.milestones.map((m) => (
            <div className="ms-card" key={m.id || m.label}>
              <div className="num">{m.label}{m.date ? " · " + m.date : ""}</div>
              <div className="date">{m.date || months[m.monthIndex] || "—"}</div>
              <div className="title">{m.title}</div>
            </div>
          ))}
        </section>
      )}

      {/* board */}
      <DndContext sensors={sensors} collisionDetection={closestCorners}
        onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <div className="board-wrap">
          <div className="board"
            style={{ gridTemplateColumns: `var(--row-label-w) repeat(${months.length}, var(--col-w))` }}>
            <div className="month-head corner">
              <div className="mlabel" style={{ fontSize: 15, color: "var(--ink-dim)" }}>Workstream</div>
            </div>
            {months.map((mo, i) => (
              <div key={i} className={"month-head" + (msByMonth[i] ? " milestone" : "")}>
                <div className="mlabel">{mo}</div>
                <div className="msub">{msByMonth[i] ? msByMonth[i].label : `month ${i + 1}`}</div>
              </div>
            ))}

            {board.areas.map((area, ai) => (
              <React.Fragment key={area.id}>
                <div className="area-label area-row" style={{ animationDelay: `${ai * 50}ms`, "--a": area.accent }}>
                  <div className="aname">
                    <span className="swatch" style={{ background: area.accent }} />
                    <EditableText
                      className="aname-text"
                      value={area.name}
                      placeholder="New workstream"
                      editable={edit}
                      autoFocus={justAddedId === area.id}
                      onCommit={(t) => renameArea(area.id, t)}
                    />
                  </div>
                  {area.meta?.subtitle && <div className="asub">{area.meta.subtitle}</div>}
                  {area.meta?.dris?.length > 0 && (
                    <Row wrap gap={2} className="dris">{area.meta.dris.map((d) => <Chip key={d}>{d}</Chip>)}</Row>
                  )}
                  {edit && <Button variant="dashed" className="area-del" onClick={() => deleteArea(area.id)} title="Delete workstream">✕ remove</Button>}
                </div>
                {months.map((_, mi) => (
                  <Cell key={mi} areaId={area.id} monthIdx={mi}
                    cards={projections[area.id]?.[mi] || []}
                    monthDates={monthDates}
                    accent={area.accent} edit={edit} overCellId={overCellId}
                    milestone={milestoneMonths.has(mi)} autoFocusId={justAddedId}
                    onCommitCard={(card, nodes, monthIdx, contextPath, roots) => commitCard(area.id, card, nodes, monthIdx, contextPath, roots)}
                    onDeleteCard={(card, monthIdx, contextPath, roots) => deleteCard(area.id, card, monthIdx, contextPath, roots)}
                    onAddHere={addHere} onAt={openAt} />
                ))}
              </React.Fragment>
            ))}

            {edit && (
              <div className="add-area-row" style={{ gridColumn: `1 / -1` }}>
                <Button variant="dashed" className="add-area" onClick={addArea}>＋ Add workstream</Button>
              </div>
            )}
          </div>
        </div>

        <DragOverlay dropAnimation={{ duration: 180 }}>
          {activeCard ? (
            <div className="drag-overlay">
              <div className="item card" style={{ "--a": "#e9b949", width: 248 }}>
                {activeCard._path?.length > 0 && <div className="card-path">{activeCard._path.join(" › ")}</div>}
                <ul className="tn-root"><NodeTree node={activeCard} monthIdx={-1} monthDates={monthDates} /></ul>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <footer className="foot">
        Roadmap Studio · {store.roadmaps.length} roadmap{store.roadmaps.length > 1 ? "s" : ""} · saved locally · drop a .json to import
      </footer>

      {/* file drop overlay */}
      {dragFile && (
        <div className="dropzone-overlay">
          <div className="dz-card"><div className="dz-icon">⤓</div><div className="dz-text">Drop a <b>.json</b> roadmap to load it</div></div>
        </div>
      )}

      {/* @-menu */}
      {atMenu && (
        <AtMenu
          x={atMenu.x} y={atMenu.y}
          monthDates={monthDates}
          currentMonth={atMenu.monthIdx}
          onPick={applyAt}
          onClose={() => setAtMenu(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
    </div>
  );

  function renameRoadmap_inline(name) {
    if (name === active.name) return;
    setStore((s) => ({ ...s, roadmaps: s.roadmaps.map((r) => r.id === active.id ? { ...r, name: name || "Untitled roadmap" } : r) }));
  }
}

/* ---------- small helpers ---------- */
function uniq(arr) { return [...new Set(arr)]; }

// Remove trailing context nodes that ended up empty (no children, no own date)
// after a deletion. Walks the folded chain from the deepest node up.
function pruneEmptyChain(tree, ctxFolds) {
  for (let depth = ctxFolds.length; depth >= 1; depth--) {
    let arr = tree, parentArr = null, idx = -1, node = null;
    for (let i = 0; i < depth; i++) {
      const j = arr.findIndex((n) => foldName(n.text) === ctxFolds[i]);
      if (j < 0) { node = null; break; }
      if (i === depth - 1) { parentArr = arr; idx = j; node = arr[j]; }
      else arr = arr[j].children;
    }
    if (node && (node.children || []).length === 0 && node.end_date == null && parentArr) {
      parentArr.splice(idx, 1);
    }
  }
}

// resolve a node by a path of texts (from a card root downward) within a tree
function resolveByPath(tree, path) {
  if (!path || !path.length) return null;
  let level = tree;
  let node = null;
  for (const name of path) {
    node = level.find((n) => foldName(n.text) === foldName(name));
    if (!node) return null;
    level = node.children;
  }
  return node;
}
