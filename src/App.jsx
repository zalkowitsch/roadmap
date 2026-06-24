import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { seedBoard, MONTHS, MILESTONES } from "./data.js";

const STORAGE_KEY = "air-billing-roadmap:v2";
const milestoneMonths = new Set(MILESTONES.map((m) => m.monthIndex));
const newId = () => "i" + Math.random().toString(36).slice(2, 9);

/* ---------- persistence ---------- */
function loadBoard() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return seedBoard();
}

/* ---------- sortable item card ---------- */
function Item({ item, areaId, monthIdx, accent, edit, handlers }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: item.id, data: { areaId, monthIdx }, disabled: !edit });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    "--a": accent,
  };

  const commit = (field, idx) => (e) => {
    handlers.onEdit(item.id, field, e.target.textContent.trim(), idx);
  };

  return (
    <div
      ref={setNodeRef}
      className={"item" + (isDragging ? " dragging" : "") + (item.hardDate ? " pinned" : "")}
      style={style}
      {...(edit ? { ...listeners, ...attributes } : {})}
    >
      {item.hardDate && (
        <div className="hard-date" title="Hard date">
          <span className="pin">◆</span>{item.hardDate}
        </div>
      )}

      <div
        className="ititle"
        contentEditable={edit}
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={commit("text")}
        onPointerDown={(e) => edit && e.stopPropagation()}
      >
        {item.text}
      </div>

      {item.sub?.length > 0 && (
        <ul className="subs">
          {item.sub.map((s, i) => (
            <li
              key={i}
              contentEditable={edit}
              suppressContentEditableWarning
              spellCheck={false}
              onBlur={commit("sub", i)}
              onPointerDown={(e) => edit && e.stopPropagation()}
            >
              {s}
            </li>
          ))}
        </ul>
      )}

      {edit && (
        <div className="ctrls" onPointerDown={(e) => e.stopPropagation()}>
          <button
            className={"date" + (item.hardDate ? " active" : "")}
            title={item.hardDate ? "Edit / clear hard date" : "Set a hard date"}
            onClick={() => handlers.onHardDate(item.id, item.hardDate)}
          >◆</button>
          <button title="Add sub-item" onClick={() => handlers.onAddSub(item.id)}>＋</button>
          <button className="del" title="Delete" onClick={() => handlers.onDelete(item.id)}>✕</button>
        </div>
      )}
    </div>
  );
}

/* ---------- droppable + sortable cell ---------- */
function Cell({ areaId, monthIdx, items, accent, edit, overCellId, handlers }) {
  const cellId = `${areaId}::${monthIdx}`;
  // a droppable wrapper id is the cell; sortable items live inside
  const isMs = milestoneMonths.has(monthIdx);
  const isTarget = overCellId === cellId;

  return (
    <div
      className={
        "cell" + (isMs ? " milestone" : "") + (isTarget ? " drop-target" : "") +
        (items.length === 0 ? " empty" : "")
      }
      data-cell={cellId}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <Item
            key={item.id}
            item={item}
            areaId={areaId}
            monthIdx={monthIdx}
            accent={accent}
            edit={edit}
            handlers={handlers}
          />
        ))}
        {/* invisible drop zone so empty cells can receive */}
        <CellDropZone id={cellId} areaId={areaId} monthIdx={monthIdx} empty={items.length === 0} edit={edit} />
      </SortableContext>
      {items.length === 0 && !edit && <span className="empty-dot">·</span>}
      {edit && (
        <button className="add-item" onClick={() => handlers.onAddItem(areaId, monthIdx)}>＋ add</button>
      )}
    </div>
  );
}

/* a thin sortable placeholder so empty cells are valid drop targets */
import { useDroppable } from "@dnd-kit/core";
function CellDropZone({ id, areaId, monthIdx, empty, edit }) {
  const { setNodeRef, isOver } = useDroppable({ id: "cell:" + id, data: { areaId, monthIdx, cell: true } });
  if (!edit) return null;
  return <div ref={setNodeRef} className={"cell-dropzone" + (empty ? " big" : "") + (isOver ? " over" : "")} />;
}

/* ---------- app ---------- */
export default function App() {
  const [board, setBoard] = useState(loadBoard);
  const [edit, setEdit] = useState(false);
  const [activeItem, setActiveItem] = useState(null);
  const [overCellId, setOverCellId] = useState(null);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(board)); } catch { /* quota */ }
  }, [board]);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(null), 1800); };

  const update = (fn) => setBoard((b) => { const next = structuredClone(b); fn(next); return next; });

  const locate = (b, itemId) => {
    for (const a of b.areas) for (const mi of Object.keys(a.months)) {
      const idx = a.months[mi].findIndex((x) => x.id === itemId);
      if (idx >= 0) return { area: a, mi: +mi, idx, item: a.months[mi][idx] };
    }
    return null;
  };

  /* ---------- mutations ---------- */
  const editText = (itemId, field, text, idx) => update((b) => {
    const loc = locate(b, itemId); if (!loc) return;
    if (field === "text") loc.item.text = text;
    else if (field === "sub") {
      if (text === "") loc.item.sub.splice(idx, 1); else loc.item.sub[idx] = text;
    }
  });
  const deleteItem = (itemId) => update((b) => {
    const loc = locate(b, itemId); if (loc) loc.area.months[loc.mi].splice(loc.idx, 1);
  });
  const addSub = (itemId) => update((b) => {
    const loc = locate(b, itemId); if (loc) loc.item.sub.push("New sub-item");
  });
  const addItem = (areaId, monthIdx) => update((b) => {
    const area = b.areas.find((a) => a.id === areaId);
    (area.months[monthIdx] ||= []).push({ id: newId(), text: "New item", sub: [] });
  });
  const setHardDate = (itemId, current) => {
    const val = prompt(
      "Hard date for this item (e.g. “Sep 15”, “Q4”, “2026-09-15”).\nLeave blank to clear.",
      current || ""
    );
    if (val === null) return; // cancelled
    update((b) => { const loc = locate(b, itemId); if (loc) loc.item.hardDate = val.trim() || undefined; });
    flash(val.trim() ? "Hard date set" : "Hard date cleared");
  };

  /* ---------- dnd ---------- */
  const onDragStart = (e) => {
    const loc = locate(board, e.active.id);
    setActiveItem(loc?.item || null);
  };
  const onDragOver = (e) => {
    const o = e.over; if (!o) { setOverCellId(null); return; }
    // over can be an item or a cell-dropzone
    const data = o.data.current;
    if (data?.cell) setOverCellId(`${data.areaId}::${data.monthIdx}`);
    else if (data) setOverCellId(`${data.areaId}::${data.monthIdx}`);
  };
  const onDragEnd = (e) => {
    setActiveItem(null); setOverCellId(null);
    const { active, over } = e;
    if (!over) return;
    update((b) => {
      const from = locate(b, active.id);
      if (!from) return;
      const od = over.data.current;
      let toAreaId, toMonth, beforeId = null;
      if (od?.cell) { toAreaId = od.areaId; toMonth = od.monthIdx; }
      else if (od) { toAreaId = od.areaId; toMonth = od.monthIdx; beforeId = over.id; }
      else return;

      const sameCell = from.area.id === toAreaId && from.mi === toMonth;
      const srcArr = from.area.months[from.mi];
      const [moved] = srcArr.splice(from.idx, 1);
      const toArea = b.areas.find((a) => a.id === toAreaId);
      const dstArr = (toArea.months[toMonth] ||= []);

      if (beforeId && beforeId !== active.id) {
        const insertAt = dstArr.findIndex((x) => x.id === beforeId);
        dstArr.splice(insertAt < 0 ? dstArr.length : insertAt, 0, moved);
      } else if (sameCell && beforeId === active.id) {
        // dropped on itself — restore
        dstArr.splice(from.idx, 0, moved);
      } else {
        dstArr.push(moved);
      }
    });
  };

  /* ---------- export / import / reset ---------- */
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "air-billing-roadmap.json"; a.click(); URL.revokeObjectURL(url);
    flash("Exported air-billing-roadmap.json");
  };
  const importJSON = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { setBoard(JSON.parse(reader.result)); flash("Imported roadmap"); } catch { flash("Import failed — invalid JSON"); } };
    reader.readAsText(file); e.target.value = "";
  };
  const resetBoard = () => {
    if (confirm("Reset to the original roadmap? Your edits will be lost.")) { setBoard(seedBoard()); flash("Reset to original"); }
  };

  const handlers = {
    onEdit: editText, onDelete: deleteItem, onAddSub: addSub,
    onAddItem: addItem, onHardDate: setHardDate,
  };

  const msByMonth = useMemo(() => {
    const m = {}; MILESTONES.forEach((x) => (m[x.monthIndex] = x)); return m;
  }, []);

  return (
    <div className={"app" + (edit ? " editmode" : "")}>
      <header className="masthead">
        <p className="eyebrow">Air Billing · Internal Milestones V0</p>
        <h1>The <em>Self-Serve</em> Roadmap</h1>
        <p className="lede">
          Ten months, eight workstreams, three milestones. In edit mode, drag a card to another
          month, reorder it within a column, or pin a hard date. Everything saves to this browser.
        </p>
        <div className="toolbar">
          <button className={"btn" + (edit ? " on" : "")} onClick={() => setEdit((v) => !v)}>
            <span className="dot" /> {edit ? "Editing — click to lock" : "Edit mode"}
          </button>
          <button className="btn" onClick={exportJSON}>⤓ Export</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⤒ Import</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={importJSON} />
          <button className="btn" onClick={resetBoard}>↺ Reset</button>
          <span className="spacer" />
          <span className="hint">{edit ? "drag to move/reorder · ◆ hard date · click text to edit · ＋ / ✕" : "view mode — toggle Edit to re-plan"}</span>
        </div>
      </header>

      <section className="milestones">
        {MILESTONES.map((m) => (
          <div className="ms-card" key={m.id}>
            <div className="num">{m.label} · {m.date}</div>
            <div className="date">{m.date}</div>
            <div className="title">{m.title}</div>
          </div>
        ))}
      </section>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="board-wrap">
          <div className="board with-guides">
            <div className="month-head corner">
              <div className="mlabel" style={{ fontSize: 15, color: "var(--ink-dim)" }}>Workstream</div>
            </div>
            {MONTHS.map((mo, i) => (
              <div key={i} className={"month-head" + (msByMonth[i] ? " milestone" : "")}>
                <div className="mlabel">{mo}</div>
                <div className="msub">{msByMonth[i] ? msByMonth[i].label : `month ${i + 1}`}</div>
              </div>
            ))}

            {board.areas.map((area, ai) => (
              <React.Fragment key={area.id}>
                <div className="area-label area-row" style={{ animationDelay: `${ai * 55}ms`, "--a": area.accent }}>
                  <div className="aname">
                    <span className="swatch" style={{ background: area.accent }} />
                    {area.name}
                  </div>
                  {area.meta?.subtitle && <div className="asub">{area.meta.subtitle}</div>}
                  {area.meta?.dris?.length > 0 && (
                    <div className="dris">{area.meta.dris.map((d) => <span className="dri" key={d}>{d}</span>)}</div>
                  )}
                </div>
                {MONTHS.map((_, mi) => (
                  <Cell
                    key={mi}
                    areaId={area.id}
                    monthIdx={mi}
                    items={area.months[mi] || []}
                    accent={area.accent}
                    edit={edit}
                    overCellId={overCellId}
                    handlers={handlers}
                  />
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={{ duration: 180 }}>
          {activeItem ? (
            <div className="drag-overlay">
              <div className={"item" + (activeItem.hardDate ? " pinned" : "")} style={{ "--a": "#e9b949", width: 248 }}>
                {activeItem.hardDate && <div className="hard-date"><span className="pin">◆</span>{activeItem.hardDate}</div>}
                <div className="ititle">{activeItem.text}</div>
                {activeItem.sub?.length > 0 && (
                  <ul className="subs">{activeItem.sub.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}</ul>
                )}
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <footer className="foot">
        Air Billing Self-Serve · Internal Milestones V0 · saved locally · {board.areas.length} workstreams
      </footer>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
