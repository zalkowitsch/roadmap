import React, { useEffect, useRef } from "react";

/**
 * EditableText — a contentEditable primitive with real placeholder behaviour.
 *
 * - Renders `value` as text content.
 * - When empty, shows `placeholder` via CSS (data-empty), which disappears
 *   the moment the user types — it is NOT real text the user must delete.
 * - `autoFocus` focuses (and selects-all) on mount — used when a node is
 *   freshly created so the user can just start typing over the placeholder.
 * - Commits on blur and on Enter (Enter also blurs). Escape reverts.
 *
 * Reusable anywhere an inline-editable label is needed.
 */
export default function EditableText({
  value,
  placeholder = "",
  editable = true,
  autoFocus = false,
  onCommit,
  as: Tag = "div",
  className = "",
  spellCheck = false,
  stopPointer = false, // stop pointerdown from reaching a drag handler
  ...rest
}) {
  const ref = useRef(null);

  // Keep DOM text in sync with `value` without clobbering the caret while typing.
  useEffect(() => {
    const el = ref.current;
    if (el && el.textContent !== (value ?? "")) el.textContent = value ?? "";
    syncEmpty(el);
  }, [value]);

  useEffect(() => {
    if (!autoFocus || !editable) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    selectAll(el);
  }, [autoFocus, editable]);

  const commit = () => {
    const el = ref.current;
    const text = (el?.textContent || "").trim();
    syncEmpty(el);
    if (onCommit) onCommit(text);
  };

  return (
    <Tag
      ref={ref}
      className={"ds-editable " + className}
      contentEditable={editable}
      suppressContentEditableWarning
      spellCheck={spellCheck}
      data-placeholder={placeholder}
      onInput={(e) => syncEmpty(e.currentTarget)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
        else if (e.key === "Escape") {
          e.currentTarget.textContent = value ?? "";
          syncEmpty(e.currentTarget);
          e.currentTarget.blur();
        }
      }}
      onPointerDown={stopPointer ? (e) => editable && e.stopPropagation() : undefined}
      {...rest}
    />
  );
}

function syncEmpty(el) {
  if (!el) return;
  const empty = (el.textContent || "").trim().length === 0;
  el.dataset.empty = empty ? "true" : "false";
}

function selectAll(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
