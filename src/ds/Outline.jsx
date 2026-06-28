import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseMarkdownToTree } from "../data.js";

/**
 * Outline — a pure-React block outline editor (no ProseMirror).
 *
 * The tree is plain JS: each node is { id, text, description, children, ... }.
 * Each node renders as a full-width "chip" row whose background tier and indent
 * encode its depth. Hover reveals a ＋ (add) and a six-dot grip ⠿ at the left.
 *   • grip click  → opens the entity menu (dates / status / team / person)
 *   • grip drag   → reorder (vertical) + reparent (horizontal), with drop-lines
 *
 * Keys: Enter = sibling · Tab/Shift+Tab = nest/outdent · Backspace-at-empty =
 * delete & merge up. Paste of markdown runs parseMarkdownToTree → blocks.
 *
 * Props mirror the old editor so the host (App.jsx Card) is unchanged:
 *   seed: node[]              initial blocks ({text, description, children})
 *   editable, autoFocus, stopPointer
 *   onCommit(nodes)           called (debounced + on blur/unmount) with the tree
 *   onAt({ rect, path })      open the host's @-menu for a node (path = title chain)
 */

let _k = 0;
const kid = () => "b" + (++_k) + Math.random().toString(36).slice(2, 6);

// normalize incoming seed into editable nodes with stable local keys
function seedToNodes(seed) {
  const walk = (n) => ({
    _k: kid(),
    text: n.text || "",
    description: n.description || "",
    open: false,
    children: (n.children || []).map(walk),
  });
  const out = (seed && seed.length ? seed : [{ text: "", children: [] }]).map(walk);
  return out;
}

// strip local fields back to the committed shape
function nodesToCommit(nodes) {
  const walk = (n) => {
    const o = { text: n.text.trim(), children: n.children.map(walk).filter(Boolean) };
    if (n.description && n.description.trim()) o.description = n.description.trim();
    return o;
  };
  return nodes.map(walk).filter((n) => n.text || n.children.length || n.description);
}

// flatten the tree into render rows with depth + a path-to-node for mutation
function flatten(nodes, depth = 0, path = [], ancestors = []) {
  const rows = [];
  nodes.forEach((n, i) => {
    const here = [...path, i];
    rows.push({ node: n, depth, index: i, path: here, ancestors });
    if (n.children.length && n.open !== "collapsed") {
      rows.push(...flatten(n.children, depth + 1, here, [...ancestors, n.text]));
    }
  });
  return rows;
}

/* ---- immutable tree ops by path ---- */
const clone = (nodes) => nodes.map((n) => ({ ...n, children: clone(n.children) }));
function getParentArr(root, path) {
  // returns the array that directly contains the node at `path` (or null if the
  // path is stale — e.g. a key event fired against a tree that just mutated)
  let arr = root;
  for (let i = 0; i < path.length - 1; i++) {
    const n = arr[path[i]];
    if (!n) return null;
    arr = n.children;
  }
  return arr;
}
function nodeAt(root, path) {
  let n = null, arr = root;
  for (let i = 0; i < path.length; i++) {
    n = arr[path[i]];
    if (!n) return null;          // stale path → bail safely
    arr = n.children;
  }
  return n;
}

export default function Outline({
  seed = [],
  editable = true,
  autoFocus = false,
  onCommit,
  onAt,
  stopPointer = false,
  className = "",
}) {
  const [nodes, setNodes] = useState(() => seedToNodes(seed));
  const rootRef = useRef(null);
  const focusRef = useRef(null);        // _k of the row to focus after a mutation
  const seedSig = useRef(JSON.stringify(seed));

  // Re-seed ONLY when the incoming seed changes AND the user isn't editing this
  // editor. Our own onCommit mutates the board, which re-projects a new `seed`
  // back to us — if we re-seeded on that, we'd wipe in-progress edits (empty
  // blocks, caret, focus). So while focused, ignore seed changes we caused.
  useEffect(() => {
    const sig = JSON.stringify(seed);
    if (sig === seedSig.current) return;
    const editing = rootRef.current?.contains(document.activeElement);
    if (editing) { seedSig.current = sig; return; } // accept the new sig, keep our state
    seedSig.current = sig;
    setNodes(seedToNodes(seed));
  }, [seed]);

  // Commit on BLUR (focus leaves the whole editor) and on unmount — NOT on
  // every keystroke. Committing mid-edit would round-trip through the board's
  // re-projection and fight the live editing state.
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  // Commit at most once per distinct tree. A blur commits; the unmount commit
  // then re-runs as the board re-projects and React tears this editor down — if
  // that second commit fires with stale/empty teardown state it WIPES the card.
  // So we skip a flush whose payload equals the one we just committed.
  const lastCommitted = useRef(null);
  const flush = useCallback(() => {
    const c = nodesToCommit(nodesRef.current);
    const sig = JSON.stringify(c);
    if (sig === lastCommitted.current) return; // nothing new since last commit
    lastCommitted.current = sig;
    commitRef.current?.(c);
  }, []);
  useEffect(() => () => flush(), [flush]);
  const onBlurCapture = (e) => {
    // only commit when focus actually left the editor (not block→block)
    if (!rootRef.current?.contains(e.relatedTarget)) flush();
  };

  const rows = useMemo(() => flatten(nodes), [nodes]);

  // focus the title element flagged in focusRef after a structural change
  useEffect(() => {
    if (!focusRef.current) return;
    const el = rootRef.current?.querySelector(`[data-k="${focusRef.current}"] .ol2-title`);
    if (el) { placeCaretEnd(el); }
    focusRef.current = null;
  });

  useEffect(() => {
    if (autoFocus && editable) {
      const first = rootRef.current?.querySelector(".ol2-title");
      if (first) placeCaretEnd(first);
    }
  }, [autoFocus, editable]);

  const mutate = (fn) => setNodes((prev) => { const next = clone(prev); fn(next); return next; });

  /* ---------- text + structural edits (all bail on a stale path) ---------- */
  const setText = (path, text) => mutate((root) => { const n = nodeAt(root, path); if (n) n.text = text; });
  const setDescription = (path, description) => mutate((root) => { const n = nodeAt(root, path); if (n) n.description = description; });

  const addSibling = (path, focusNew = true) => mutate((root) => {
    const arr = getParentArr(root, path);
    if (!arr) return;
    const at = path[path.length - 1];
    const fresh = { _k: kid(), text: "", description: "", open: null, children: [] };
    arr.splice(at + 1, 0, fresh);
    if (focusNew) focusRef.current = fresh._k;
  });

  const removeMergeUp = (path) => mutate((root) => {
    const arr = getParentArr(root, path);
    if (!arr) return;
    const at = path[path.length - 1];
    if (arr.length === 1 && path.length === 1) return; // keep at least one root
    const [removed] = arr.splice(at, 1);
    // promote its children into its place
    if (removed.children.length) arr.splice(at, 0, ...removed.children);
    // focus previous sibling (or parent)
    const prev = at > 0 ? arr[at - 1] : null;
    focusRef.current = prev ? lastLeafK(prev) : null;
  });

  const indent = (path) => mutate((root) => {
    const arr = getParentArr(root, path);
    if (!arr) return;
    const at = path[path.length - 1];
    if (at <= 0 || at >= arr.length) return;     // no preceding sibling / stale path → no-op
    const [moved] = arr.splice(at, 1);
    if (!moved) return;
    arr[at - 1].children.push(moved);
    focusRef.current = moved._k;
  });

  const outdent = (path) => mutate((root) => {
    if (path.length < 2) return;                // already at top level
    const parentPath = path.slice(0, -1);
    const pArr = getParentArr(root, parentPath); // array that contains the parent
    const parentNode = nodeAt(root, parentPath);
    if (!pArr || !parentNode) return;
    const parentIdx = parentPath[parentPath.length - 1];
    const arr = parentNode.children;            // the node's current siblings
    const at = path[path.length - 1];
    if (at < 0 || at >= arr.length) return;      // stale path → no-op
    const [moved] = arr.splice(at, 1);
    if (!moved) return;
    pArr.splice(parentIdx + 1, 0, moved);       // place just after the old parent
    focusRef.current = moved._k;
  });

  /* ---------- key handling on a title ---------- */
  const onTitleKeyDown = (e, path, hooks) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      // ⌘/Ctrl+Enter → drop into this item's description
      e.preventDefault();
      hooks?.openDesc?.();
    } else if (e.key === "Enter") {
      e.preventDefault();
      addSibling(path);
    } else if (e.key === "Tab") {
      e.preventDefault();
      e.shiftKey ? outdent(path) : indent(path);
    } else if (e.key === "Backspace") {
      const text = e.currentTarget.textContent;
      if (text === "") { e.preventDefault(); removeMergeUp(path); }
    }
  };

  /* ---------- paste markdown → blocks ---------- */
  const onPaste = (e, path) => {
    const text = e.clipboardData?.getData("text/plain") || "";
    if (!/[\n#-]/.test(text) || !text.includes("\n")) return; // let single-line paste be native
    e.preventDefault();
    const parsed = parseMarkdownToTree(normalizeIndent(text));
    if (!parsed.length) return;
    const fresh = parsed.map(function rekey(n) {
      return { _k: kid(), text: n.text || "", description: n.description || "", open: null, children: (n.children || []).map(rekey) };
    });
    mutate((root) => {
      const arr = getParentArr(root, path);
      const at = path[path.length - 1];
      const cur = arr[at];
      // if the current block is empty, replace it; else insert after
      if (!cur.text.trim() && !cur.children.length) arr.splice(at, 1, ...fresh);
      else arr.splice(at + 1, 0, ...fresh);
      focusRef.current = fresh[0]._k;
    });
  };

  /* ---------- drag: reorder (vertical) + reparent (horizontal) ---------- */
  const [drag, setDrag] = useState(null); // { fromK, overK, where:'before'|'after'|'child' }
  const dragData = useRef(null);

  const onGripPointerDown = (e, path, rect) => {
    if (e.button !== 0) return;
    const startX = e.clientX, startY = e.clientY;
    const fromK = nodeAt(nodes, path)._k;
    let started = false;
    const move = (ev) => {
      if (!started && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return;
      if (!started) document.body.classList.add("ol2-dragging"); // closed-hand cursor everywhere
      started = true;
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.("[data-k]");
      if (!target) { setDrag({ fromK, overK: null, where: null }); return; }
      const overK = target.getAttribute("data-k");
      if (overK === fromK) { setDrag({ fromK, overK: null, where: null }); return; }
      const r = target.getBoundingClientRect();
      const rel = (ev.clientY - r.top) / r.height;
      // Drop zones along the row height: the big middle band nests the item AS A
      // CHILD of the target; thin top/bottom edges reorder it as a sibling.
      const where = rel < 0.28 ? "before" : rel > 0.72 ? "after" : "child";
      const depth = +(target.style.getPropertyValue("--depth") || 0);
      dragData.current = { fromK, overK, where };
      setDrag({ fromK, overK, where, depth });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.classList.remove("ol2-dragging");
      if (started && dragData.current?.overK) applyDrop(dragData.current);
      else if (!started) openEntityMenu(path, rect); // a click (no drag) → entity menu
      dragData.current = null;
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const applyDrop = ({ fromK, overK, where }) => mutate((root) => {
    const from = findByK(root, fromK);
    const over = findByK(root, overK);
    if (!from || !over) return;
    if (isAncestor(from.node, over.node)) return; // can't drop into own subtree
    // detach
    from.arr.splice(from.idx, 1);
    // re-find over (indices may have shifted if same array)
    const over2 = findByK(root, overK);
    if (!over2) return;
    if (where === "child") {
      over2.node.children.unshift(from.node);
    } else {
      const insertAt = where === "before" ? over2.idx : over2.idx + 1;
      over2.arr.splice(insertAt, 0, from.node);
    }
    focusRef.current = from.node._k;
  });

  const openEntityMenu = (path, rect) => {
    if (!onAt) return;
    const n = nodeAt(nodes, path);
    const r = rect || { left: 200, bottom: 200 };
    onAt({ rect: r, path: [...flatten(nodes).find((x) => x.node._k === n._k)?.ancestors || [], n.text].filter(Boolean) });
  };

  return (
    <div
      ref={rootRef}
      className={"ol2 " + className}
      data-empty={rows.length === 1 && !rows[0].node.text ? "true" : "false"}
      onBlurCapture={onBlurCapture}
      onPointerDown={stopPointer ? (e) => editable && e.stopPropagation() : undefined}
    >
      {rows.map((row) => (
        <Block
          key={row.node._k}
          row={row}
          editable={editable}
          drag={drag}
          onText={setText}
          onDescription={setDescription}
          onKeyDown={onTitleKeyDown}
          onPaste={onPaste}
          onAddBelow={(p) => addSibling(p)}
          onGripDown={onGripPointerDown}
        />
      ))}
    </div>
  );
}

/* ============================================================ */
function Block({ row, editable, drag, onText, onDescription, onPaste, onAddBelow, onGripDown, onKeyDown }) {
  const { node, depth, path } = row;
  const titleRef = useRef(null);
  const hasDesc = !!(node.description && node.description.trim());
  const [descOpen, setDescOpen] = useState(false);
  const dropping = drag?.overK === node._k ? drag.where : null;

  // The title is an UNCONTROLLED contentEditable. React must NOT rewrite its
  // textContent on every keystroke — doing so corrupts the DOM text nodes (the
  // browser was mid-edit) and the caret, which is what made typing render one
  // char per line and commit empty. So: seed the text once on mount, and only
  // re-sync from state when this element is NOT focused (i.e. the change came
  // from a structural op like paste/merge, not from the user typing here).
  useEffect(() => {
    const el = titleRef.current;
    if (el && document.activeElement !== el && el.textContent !== node.text) {
      el.textContent = node.text;
    }
  }, [node.text]);

  return (
    <div
      className={"ol2-block" + (dropping ? " drop-" + dropping : "") + (drag?.fromK === node._k ? " ghost" : "")}
      data-k={node._k}
      style={{ "--depth": depth, "--tier": depth % 5 }}
    >
      <div className="ol2-gutter" contentEditable={false}>
        <button className="ol2-add" title="Add block below" tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()} onClick={() => onAddBelow(path)}>＋</button>
        <button
          className="ol2-grip" title="Drag to move · click for dates / status / @"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onPointerDown={(e) => onGripDown(e, path, e.currentTarget.getBoundingClientRect())}
        >
          <i /><i /><i /><i /><i /><i />
        </button>
      </div>

      <div className="ol2-main">
        <div className="ol2-row">
          <div
            ref={(el) => {
              titleRef.current = el;
              // seed initial text exactly once, when the node first mounts
              if (el && el.dataset.seeded !== "1") { el.textContent = node.text; el.dataset.seeded = "1"; }
            }}
            className="ol2-title"
            contentEditable={editable}
            suppressContentEditableWarning
            spellCheck={false}
            data-placeholder="Untitled"
            onInput={(e) => onText(path, e.currentTarget.textContent)}
            onKeyDown={(e) => onKeyDown(e, path, { openDesc: () => setDescOpen(true) })}
            onPaste={(e) => onPaste(e, path)}
          />
        </div>

        {/* description: shown when it has content OR was opened with ⌘/Ctrl+Enter */}
        {(hasDesc || descOpen) && (
          <DescriptionField
            value={node.description}
            autoFocus={descOpen && !hasDesc}
            onChange={(v) => onDescription(path, v)}
            editable={editable}
          />
        )}
      </div>
    </div>
  );
}

/* description: a lightweight UNCONTROLLED contentEditable (markdown text). Same
   rule as the title — seed once on mount, only re-sync from state when unfocused. */
function DescriptionField({ value, onChange, editable, autoFocus }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.textContent !== value) el.textContent = value;
  }, [value]);
  useEffect(() => { if (autoFocus && ref.current) placeCaretEnd(ref.current); }, [autoFocus]);
  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (el && el.dataset.seeded !== "1") { el.textContent = value || ""; el.dataset.seeded = "1"; }
      }}
      className="ol2-desc"
      contentEditable={editable}
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder="Add a description…"
      onInput={(e) => onChange(e.currentTarget.textContent)}
    />
  );
}

/* ---------- helpers ---------- */
function placeCaretEnd(el) {
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
function lastLeafK(n) { return n.children.length ? lastLeafK(n.children[n.children.length - 1]) : n._k; }
function findByK(nodes, k, arr = nodes, parent = null) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]._k === k) return { node: arr[i], arr, idx: i, parent };
    const hit = findByK(nodes, k, arr[i].children, arr[i]);
    if (hit) return hit;
  }
  return null;
}
function isAncestor(a, b) {
  if (a === b) return true;
  return a.children.some((c) => isAncestor(c, b));
}
// normalize paste indentation so each visual step = one level (tabs → 2 spaces,
// smallest nonzero indent becomes the unit)
function normalizeIndent(text) {
  const lines = text.replace(/\r/g, "").split("\n");
  const indents = lines.map((l) => (l.match(/^[\t ]*/)[0] || "").replace(/\t/g, "  ").length).filter((n, i) => lines[i].trim());
  const unit = Math.min(...indents.filter((n) => n > 0).concat([2]));
  return lines.map((l) => {
    const lead = (l.match(/^[\t ]*/)[0] || "").replace(/\t/g, "  ");
    const rest = l.slice(l.match(/^[\t ]*/)[0].length);
    const steps = unit ? Math.round(lead.length / unit) : 0;
    return "  ".repeat(steps) + rest;
  }).join("\n");
}
