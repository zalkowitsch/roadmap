import React, { useEffect, useRef, useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";

/**
 * RichText — a live-rendering markdown editor primitive (TipTap/ProseMirror).
 *
 * - WYSIWYG even while editing: you type markdown-ish and it renders inline.
 * - Stores/loads plain MARKDOWN strings (item.text), so the roadmap JSON
 *   shape is unchanged.
 * - Commits markdown via onCommit(blur).
 * - autoFocus focuses + selects-all on mount (freshly created nodes).
 * - Right-click opens a formatting menu (B / I / code / strike / H1–H3 /
 *   bullet / ordered list).
 *
 * Reusable anywhere a rich, markdown-backed text field is needed.
 */
export default function RichText({
  value,
  placeholder = "",
  editable = true,
  autoFocus = false,
  onCommit,
  className = "",
  singleLine = false, // collapse to inline-ish (used for short labels)
  stopPointer = false,
}) {
  const [menu, setMenu] = useState(null); // { x, y } when context menu open
  const lastCommitted = useRef(value ?? "");

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: singleLine ? false : { levels: [1, 2, 3] },
        // keep it lightweight; drop block features that don't fit a card
        horizontalRule: false,
        blockquote: singleLine ? false : undefined,
        codeBlock: singleLine ? false : undefined,
      }),
      Markdown,
    ],
    content: value ?? "",
    contentType: "markdown",
    editorProps: {
      attributes: {
        class: "ds-rt__content",
        "data-placeholder": placeholder,
      },
    },
  });

  // keep editor in sync when the value prop changes from outside (e.g. import)
  useEffect(() => {
    if (!editor) return;
    const incoming = value ?? "";
    if (incoming !== lastCommitted.current) {
      const md = editor.getMarkdown();
      if (md !== incoming) {
        editor.commands.setContent(incoming, { contentType: "markdown" });
        lastCommitted.current = incoming;
      }
    }
  }, [value, editor]);

  // reflect editable changes
  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editable, editor]);

  // autofocus + select-all on freshly created nodes
  useEffect(() => {
    if (autoFocus && editor && editable) {
      editor.commands.focus("end");
      editor.commands.selectAll();
    }
  }, [autoFocus, editor, editable]);

  const commit = useCallback(() => {
    if (!editor || !onCommit) return;
    const md = editor.getMarkdown().trim();
    lastCommitted.current = md;
    onCommit(md);
  }, [editor, onCommit]);

  // commit on blur
  useEffect(() => {
    if (!editor) return;
    const onBlur = () => { setMenu(null); commit(); };
    editor.on("blur", onBlur);
    return () => { editor.off("blur", onBlur); };
  }, [editor, commit]);

  const openMenu = (e) => {
    if (!editable) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const run = (fn) => () => { fn(editor.chain().focus()).run(); setMenu(null); };

  const isEmpty = editor ? editor.isEmpty : !(value || "").trim();

  return (
    <div
      className={"ds-rt " + className}
      data-empty={isEmpty ? "true" : "false"}
      data-placeholder={placeholder}
      onContextMenu={openMenu}
      onPointerDown={stopPointer ? (e) => editable && e.stopPropagation() : undefined}
    >
      <EditorContent editor={editor} />

      {menu && editor && (
        <FormatMenu
          x={menu.x} y={menu.y} editor={editor} singleLine={singleLine}
          onClose={() => setMenu(null)} run={run}
        />
      )}
    </div>
  );
}

/* ---------- right-click formatting menu ---------- */
function FormatMenu({ x, y, editor, singleLine, onClose, run }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [onClose]);

  const is = (name, attrs) => editor.isActive(name, attrs);

  // clamp into viewport
  const style = {
    left: Math.min(x, window.innerWidth - 190),
    top: Math.min(y, window.innerHeight - 320),
  };

  return (
    <div ref={ref} className="ds-rt-menu" style={style} onMouseDown={(e) => e.preventDefault()}>
      <div className="ds-rt-menu__row">
        <MenuBtn active={is("bold")} label="B" title="Bold (⌘B)" style={{ fontWeight: 700 }}
          onClick={run((c) => c.toggleBold())} />
        <MenuBtn active={is("italic")} label="I" title="Italic (⌘I)" style={{ fontStyle: "italic" }}
          onClick={run((c) => c.toggleItalic())} />
        <MenuBtn active={is("strike")} label="S" title="Strikethrough" style={{ textDecoration: "line-through" }}
          onClick={run((c) => c.toggleStrike())} />
        <MenuBtn active={is("code")} label="‹›" title="Inline code" mono
          onClick={run((c) => c.toggleCode())} />
      </div>
      {!singleLine && (
        <>
          <div className="ds-rt-menu__sep" />
          <MenuItem active={is("heading", { level: 1 })} label="Heading 1"
            onClick={run((c) => c.toggleHeading({ level: 1 }))} />
          <MenuItem active={is("heading", { level: 2 })} label="Heading 2"
            onClick={run((c) => c.toggleHeading({ level: 2 }))} />
          <MenuItem active={is("heading", { level: 3 })} label="Heading 3"
            onClick={run((c) => c.toggleHeading({ level: 3 }))} />
          <div className="ds-rt-menu__sep" />
          <MenuItem active={is("bulletList")} label="• Bullet list"
            onClick={run((c) => c.toggleBulletList())} />
          <MenuItem active={is("orderedList")} label="1. Numbered list"
            onClick={run((c) => c.toggleOrderedList())} />
        </>
      )}
    </div>
  );
}

function MenuBtn({ label, title, active, onClick, mono, style }) {
  return (
    <button className={"ds-rt-menu__btn" + (active ? " on" : "") + (mono ? " mono" : "")}
      title={title} onClick={onClick} style={style}>{label}</button>
  );
}
function MenuItem({ label, active, onClick }) {
  return (
    <button className={"ds-rt-menu__item" + (active ? " on" : "")} onClick={onClick}>{label}</button>
  );
}
