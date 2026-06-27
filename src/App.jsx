import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners, useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { emptyBoard, normalizeBoard, nextAccent, newId } from "./data.js";
import { Button, IconButton, Chip, Row, Spacer, EditableText } from "./ds";

const STORE_KEY = "roadmaps:v1";

/* ============================================================
   Multi-roadmap store (localStorage)
   shape: { roadmaps: [{ id, name, board }], activeId }
   ============================================================ */
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s?.roadmaps?.length) return s;
    }
  } catch { /* fall through */ }
  const first = { id: "rm-" + newId(), name: "Untitled roadmap", board: emptyBoard() };
  return { roadmaps: [first], activeId: first.id };
}

/* ---------- sortable item ---------- */
function Item({ item, areaId, monthIdx, accent, edit, autoFocus, handlers }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, data: { areaId, monthIdx }, disabled: !edit });
  const style = { transform: CSS.Translate.toString(transform), transition, "--a": accent };

  return (
    <div
      ref={setNodeRef}
      className={"item" + (isDragging ? " dragging" : "") + (item.hardDate ? " pinned" : "")}
      style={style}
      {...(edit ? { ...listeners, ...attributes } : {})}
    >
      {item.hardDate && (
        <div className="hard-date" title="Hard date"><span className="pin">◆</span>{item.hardDate}</div>
      )}
      <EditableText
        className="ititle"
        value={item.text}
        placeholder="New item"
        editable={edit}
        autoFocus={autoFocus}
        stopPointer
        onCommit={(t) => handlers.onEdit(item.id, "text", t)}
      />
      {item.sub?.length > 0 && (
        <ul className="subs">
          {item.sub.map((s, i) => (
            <EditableText
              key={i}
              as="li"
              value={s}
              placeholder="New sub-item"
              editable={edit}
              autoFocus={item._focusSub === i}
              stopPointer
              onCommit={(t) => handlers.onEdit(item.id, "sub", t, i)}
            />
          ))}
        </ul>
      )}
      {edit && (
        <div className="ctrls" onPointerDown={(e) => e.stopPropagation()}>
          <IconButton active={!!item.hardDate} title="Set/clear hard date"
            onClick={() => handlers.onHardDate(item.id, item.hardDate)}>◆</IconButton>
          <IconButton title="Add sub-item" onClick={() => handlers.onAddSub(item.id)}>＋</IconButton>
          <IconButton tone="danger" title="Delete" onClick={() => handlers.onDelete(item.id)}>✕</IconButton>
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

function Cell({ areaId, monthIdx, items, accent, edit, overCellId, milestone, justAddedId, handlers }) {
  const cellId = `${areaId}::${monthIdx}`;
  const isTarget = overCellId === cellId;
  return (
    <div className={"cell" + (milestone ? " milestone" : "") + (isTarget ? " drop-target" : "") + (items.length === 0 ? " empty" : "")}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <Item key={item.id} item={item} areaId={areaId} monthIdx={monthIdx} accent={accent}
            edit={edit} autoFocus={justAddedId === item.id} handlers={handlers} />
        ))}
        <CellDropZone id={cellId} areaId={areaId} monthIdx={monthIdx} empty={items.length === 0} edit={edit} />
      </SortableContext>
      {items.length === 0 && !edit && <span className="empty-dot">·</span>}
      {edit && <Button variant="dashed" className="add-item" onClick={() => handlers.onAddItem(areaId, monthIdx)}>＋ add</Button>}
    </div>
  );
}

/* ============================================================ */
export default function App() {
  const [store, setStore] = useState(loadStore);
  const [edit, setEdit] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const [overCellId, setOverCellId] = useState(null);
  const [toast, setToast] = useState(null);
  const [scrolled, setScrolled] = useState(false);
  const [dragFile, setDragFile] = useState(false);
  // id of the node (item or area) just created — gets autofocus once, then cleared
  const [justAddedId, setJustAddedId] = useState(null);
  const fileRef = useRef(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const active = store.roadmaps.find((r) => r.id === store.activeId) || store.roadmaps[0];
  const board = active.board;
  const months = board.months;
  const milestoneMonths = useMemo(
    () => new Set((board.milestones || []).map((m) => m.monthIndex)),
    [board.milestones]
  );
  const msByMonth = useMemo(() => {
    const m = {}; (board.milestones || []).forEach((x) => (m[x.monthIndex] = x)); return m;
  }, [board.milestones]);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* quota */ }
  }, [store]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 150);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // clear the autofocus marker after it's been consumed by the mounted node
  useEffect(() => {
    if (!justAddedId) return;
    const t = setTimeout(() => setJustAddedId(null), 300);
    return () => clearTimeout(t);
  }, [justAddedId]);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 1900); };

  /* mutate the active board */
  const setBoard = (fn) => setStore((s) => {
    const next = structuredClone(s);
    const a = next.roadmaps.find((r) => r.id === next.activeId);
    fn(a.board);
    return next;
  });

  const locate = (b, itemId) => {
    for (const a of b.areas) for (const mi of Object.keys(a.months)) {
      const idx = a.months[mi].findIndex((x) => x.id === itemId);
      if (idx >= 0) return { area: a, mi: +mi, idx, item: a.months[mi][idx] };
    }
    return null;
  };

  /* ---------- item mutations ---------- */
  const editText = (itemId, field, text, idx) => setBoard((b) => {
    const loc = locate(b, itemId); if (!loc) return;
    if (field === "text") loc.item.text = text;
    else if (field === "sub") { if (text === "") loc.item.sub.splice(idx, 1); else loc.item.sub[idx] = text; }
    if (loc.item._focusSub != null) delete loc.item._focusSub;
  });
  const deleteItem = (itemId) => setBoard((b) => { const l = locate(b, itemId); if (l) l.area.months[l.mi].splice(l.idx, 1); });
  const addSub = (itemId) => setBoard((b) => {
    const l = locate(b, itemId); if (!l) return;
    l.item.sub.push("");
    l.item._focusSub = l.item.sub.length - 1; // focus the new sub-item
  });
  const addItem = (areaId, monthIdx) => {
    const id = newId();
    setBoard((b) => {
      const area = b.areas.find((a) => a.id === areaId);
      (area.months[monthIdx] ||= []).push({ id, text: "", sub: [] });
    });
    setJustAddedId(id); // triggers autoFocus on the new card's title
  };
  const setHardDate = (itemId, current) => {
    const val = prompt("Hard date (e.g. “Sep 15”, “Q4”). Blank to clear.", current || "");
    if (val === null) return;
    setBoard((b) => { const l = locate(b, itemId); if (l) l.item.hardDate = val.trim() || undefined; });
    flash(val.trim() ? "Hard date set" : "Hard date cleared");
  };

  /* ---------- area mutations ---------- */
  const addArea = () => {
    const id = "area-" + newId();
    setBoard((b) => {
      b.areas.push({ id, name: "", accent: nextAccent(b.areas.length), meta: null, months: {} });
    });
    setJustAddedId(id); // focus the new workstream's name
  };
  const renameArea = (areaId, name) => setBoard((b) => { const a = b.areas.find((x) => x.id === areaId); if (a) a.name = name; });
  const deleteArea = (areaId) => {
    if (!confirm("Delete this workstream and all its items?")) return;
    setBoard((b) => { b.areas = b.areas.filter((a) => a.id !== areaId); });
  };

  /* ---------- dnd ---------- */
  const onDragStart = (e) => { const l = locate(board, e.active.id); setActiveItem(l?.item || null); };
  const onDragOver = (e) => {
    const o = e.over; if (!o) { setOverCellId(null); return; }
    const d = o.data.current; if (d) setOverCellId(`${d.areaId}::${d.monthIdx}`);
  };
  const onDragEnd = (e) => {
    setActiveItem(null); setOverCellId(null);
    const { active: act, over } = e; if (!over) return;
    setBoard((b) => {
      const from = locate(b, act.id); if (!from) return;
      const od = over.data.current; if (!od) return;
      const toAreaId = od.areaId, toMonth = od.monthIdx, beforeId = od.cell ? null : over.id;
      const sameCell = from.area.id === toAreaId && from.mi === toMonth;
      const [moved] = from.area.months[from.mi].splice(from.idx, 1);
      const toArea = b.areas.find((a) => a.id === toAreaId);
      const dst = (toArea.months[toMonth] ||= []);
      if (beforeId && beforeId !== act.id) {
        const at = dst.findIndex((x) => x.id === beforeId);
        dst.splice(at < 0 ? dst.length : at, 0, moved);
      } else if (sameCell && beforeId === act.id) {
        dst.splice(from.idx, 0, moved);
      } else dst.push(moved);
    });
  };

  /* ---------- roadmap management ---------- */
  const newRoadmap = () => setStore((s) => {
    const r = { id: "rm-" + newId(), name: "Untitled roadmap", board: emptyBoard() };
    return { roadmaps: [...s.roadmaps, r], activeId: r.id };
  });
  const switchRoadmap = (id) => setStore((s) => ({ ...s, activeId: id }));
  const renameRoadmap = (id) => {
    const cur = store.roadmaps.find((r) => r.id === id);
    const name = prompt("Roadmap name:", cur?.name || "");
    if (name == null) return;
    setStore((s) => ({ ...s, roadmaps: s.roadmaps.map((r) => r.id === id ? { ...r, name: name.trim() || r.name } : r) }));
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

  const handlers = { onEdit: editText, onDelete: deleteItem, onAddSub: addSub, onAddItem: addItem, onHardDate: setHardDate };

  return (
    <div
      className={"app" + (edit ? " editmode" : "") + (scrolled ? " scrolled" : "")}
      onDrop={onDrop} onDragEnter={onDragEnterWin} onDragOver={onDragOverWin} onDragLeave={onDragLeaveWin}
    >
      {/* sticky bar */}
      <div className={"stickybar" + (scrolled ? " show" : "") + (edit ? " editing" : "")}>
        <div className="sb-brand"><span className="sb-mark">◆</span><span className="sb-title">{active.name || "Untitled roadmap"}</span></div>
        <Button variant="ghost" active={edit} dot onClick={() => setEdit((v) => !v)}>{edit ? "Editing" : "Edit mode"}</Button>
        <Button variant="ghost" onClick={exportJSON}>⤓ Export</Button>
        <Button variant="ghost" onClick={() => fileRef.current?.click()}>⤒ Import</Button>
        <Spacer />
        <span className="sb-hint">{edit ? "drag · ◆ date · click to edit" : "view mode"}</span>
        <Button variant="ghost" className="sb-top" title="Top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>↑</Button>
      </div>

      {/* masthead */}
      <header className="masthead">
        <p className="eyebrow">Roadmap Studio</p>
        <EditableText
          as="h1"
          className="editable-h1"
          value={active.name}
          placeholder="Untitled roadmap"
          editable={edit}
          onCommit={(t) => renameRoadmap_inline(t)}
          title={edit ? "Click to rename" : undefined}
        />
        <p className="lede">
          A roadmap is a JSON you bring. Drop a <code>.json</code> file anywhere to load it,
          start from the skeleton below, or switch between saved roadmaps. Everything saves to this browser.
        </p>

        {/* roadmap switcher */}
        <div className="rm-bar">
          {store.roadmaps.map((r) => (
            <button
              key={r.id}
              className={"rm-tab" + (r.id === store.activeId ? " on" : "")}
              onClick={() => switchRoadmap(r.id)}
              onDoubleClick={() => renameRoadmap(r.id)}
              title="Click to open · double-click to rename"
            >
              {r.name || "Untitled roadmap"}
              {r.id === store.activeId && store.roadmaps.length > 1 && (
                <span className="rm-x" title="Delete roadmap" onClick={(e) => { e.stopPropagation(); deleteRoadmap(r.id); }}>✕</span>
              )}
            </button>
          ))}
          <button className="rm-tab add" onClick={newRoadmap} title="New roadmap">＋</button>
        </div>

        <Row wrap gap={3} className="toolbar">
          <Button active={edit} dot onClick={() => setEdit((v) => !v)}>{edit ? "Editing — click to lock" : "Edit mode"}</Button>
          <Button onClick={exportJSON}>⤓ Export</Button>
          <Button onClick={() => fileRef.current?.click()}>⤒ Import JSON</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFileInput} />
          <Spacer />
          <span className="hint">{edit ? "drag to move/reorder · ◆ hard date · click text to edit · ＋ / ✕" : "view mode — toggle Edit to plan"}</span>
        </Row>
      </header>

      {/* milestone banner (only if the board defines milestones) */}
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
                  <Cell key={mi} areaId={area.id} monthIdx={mi} items={area.months[mi] || []}
                    accent={area.accent} edit={edit} overCellId={overCellId}
                    milestone={milestoneMonths.has(mi)} justAddedId={justAddedId} handlers={handlers} />
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
          {activeItem ? (
            <div className="drag-overlay">
              <div className={"item" + (activeItem.hardDate ? " pinned" : "")} style={{ "--a": "#e9b949", width: 248 }}>
                {activeItem.hardDate && <div className="hard-date"><span className="pin">◆</span>{activeItem.hardDate}</div>}
                <div className="ititle">{activeItem.text || "New item"}</div>
                {activeItem.sub?.length > 0 && <ul className="subs">{activeItem.sub.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}</ul>}
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );

  // inline H1 rename helper (kept inside to capture active.id)
  function renameRoadmap_inline(name) {
    if (name === active.name) return;
    setStore((s) => ({ ...s, roadmaps: s.roadmaps.map((r) => r.id === active.id ? { ...r, name: name || "Untitled roadmap" } : r) }));
  }
}
