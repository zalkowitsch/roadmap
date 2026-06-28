/* ============================================================
   Design System — public API
   Import primitives from one place:  import { Button, Chip } from "./ds"
   ============================================================ */
import React from "react";
import "./tokens.css";
import "./primitives.css";

export { default as EditableText } from "./EditableText.jsx";
export { default as RichText } from "./RichText.jsx";
export { default as Outline } from "./Outline.jsx";
export { default as AtMenu } from "./AtMenu.jsx";
export { default as Sidebar } from "./Sidebar.jsx";
import "./sidebar.css";

const cx = (...xs) => xs.filter(Boolean).join(" ");

/* ---------- Button ----------
   variant: "default" | "primary" | "ghost" | "dashed"
   active:  toggles the "on" treatment
   dot:     renders a leading status dot                              */
export function Button({ variant = "default", active = false, dot = false, className, children, ...rest }) {
  return (
    <button
      className={cx(
        "ds-btn",
        variant !== "default" && `ds-btn--${variant}`,
        active && "ds-btn--on",
        className
      )}
      {...rest}
    >
      {dot && <span className="ds-btn__dot" />}
      {children}
    </button>
  );
}

/* ---------- IconButton ----------
   tone: "default" | "danger";  active toggles the accent treatment   */
export function IconButton({ tone = "default", active = false, className, children, ...rest }) {
  return (
    <button
      className={cx("ds-iconbtn", tone === "danger" && "ds-iconbtn--danger", active && "ds-iconbtn--on", className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Chip ---------- */
export function Chip({ swatch, className, children, ...rest }) {
  return (
    <span className={cx("ds-chip", className)} {...rest}>
      {swatch && <span className="ds-chip__swatch" style={{ background: swatch }} />}
      {children}
    </span>
  );
}

/* ---------- Layout ---------- */
export function Row({ wrap = false, gap = 3, className, style, children, ...rest }) {
  return (
    <div className={cx("ds-row", wrap && "ds-row--wrap", `ds-gap-${gap}`, className)} style={style} {...rest}>
      {children}
    </div>
  );
}
export function Stack({ gap = 3, className, style, children, ...rest }) {
  return (
    <div className={cx("ds-stack", `ds-gap-${gap}`, className)} style={style} {...rest}>
      {children}
    </div>
  );
}
export function Spacer() { return <span className="ds-spacer" />; }
