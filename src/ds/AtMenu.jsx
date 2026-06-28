import React, { useEffect, useRef, useState } from "react";
import { REL_DATES, TEAMS, PEOPLE, STATUSES, relDateToISO } from "../data.js";

/**
 * AtMenu — the "@" popover. Sets a node's start/end date (relative or exact),
 * or attaches entities (team / person / status). Positioned like FormatMenu.
 *
 * props:
 *   x, y          screen coords to anchor near
 *   monthDates    board.monthDates (for relative-date resolution)
 *   currentMonth  month index the node currently sits in (anchors "Today")
 *   onPick(action) action = { kind:"date", field:"end_date"|"start_date", iso }
 *                        | { kind:"team", value } | { kind:"person", value }
 *                        | { kind:"status", value }
 *   onClose()
 */
export default function AtMenu({ x, y, monthDates, currentMonth = 0, onPick, onClose }) {
  const ref = useRef(null);
  const [pane, setPane] = useState("root"); // root | end | start | team | person | status
  const [exact, setExact] = useState("");

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onEsc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [onClose]);

  const style = {
    left: Math.min(x, window.innerWidth - 230),
    top: Math.min(y, window.innerHeight - 360),
  };

  const pickDate = (field, label) => {
    const iso = relDateToISO(label, monthDates, currentMonth);
    if (iso) { onPick({ kind: "date", field, iso }); onClose(); }
  };
  const pickExact = (field) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(exact)) { onPick({ kind: "date", field, iso: exact }); onClose(); }
  };

  return (
    <div ref={ref} className="ds-at" style={style} onMouseDown={(e) => e.preventDefault()}>
      {pane === "root" && (
        <>
          <div className="ds-at__head">Set</div>
          <button className="ds-at__item" onClick={() => setPane("end")}>◆ End date <span className="ds-at__chev">›</span></button>
          <button className="ds-at__item" onClick={() => setPane("start")}>▷ Start date <span className="ds-at__chev">›</span></button>
          <div className="ds-at__sep" />
          <div className="ds-at__head">Attach</div>
          <button className="ds-at__item" onClick={() => setPane("status")}>● Status <span className="ds-at__chev">›</span></button>
          <button className="ds-at__item" onClick={() => setPane("team")}>▣ Team <span className="ds-at__chev">›</span></button>
          <button className="ds-at__item" onClick={() => setPane("person")}>@ Person <span className="ds-at__chev">›</span></button>
        </>
      )}

      {(pane === "end" || pane === "start") && (
        <>
          <button className="ds-at__back" onClick={() => setPane("root")}>‹ {pane === "end" ? "End date" : "Start date"}</button>
          {REL_DATES.map((d) => (
            <button key={d} className="ds-at__item" onClick={() => pickDate(pane === "end" ? "end_date" : "start_date", d)}>{d}</button>
          ))}
          <div className="ds-at__sep" />
          <div className="ds-at__exact">
            <input
              className="ds-at__input" placeholder="YYYY-MM-DD" value={exact}
              onChange={(e) => setExact(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") pickExact(pane === "end" ? "end_date" : "start_date"); }}
            />
            <button className="ds-at__go" onClick={() => pickExact(pane === "end" ? "end_date" : "start_date")}>Set</button>
          </div>
        </>
      )}

      {pane === "status" && (
        <>
          <button className="ds-at__back" onClick={() => setPane("root")}>‹ Status</button>
          {STATUSES.map((s) => (
            <button key={s.key} className="ds-at__item" onClick={() => { onPick({ kind: "status", value: s.key }); onClose(); }}>
              <span className="ds-at__dot" style={{ background: s.dot }} /> {s.key}
            </button>
          ))}
        </>
      )}

      {pane === "team" && (
        <>
          <button className="ds-at__back" onClick={() => setPane("root")}>‹ Team</button>
          <div className="ds-at__grid">
            {TEAMS.map((t) => (
              <button key={t.key} className="ds-at__tag" style={{ "--c": t.color }}
                onClick={() => { onPick({ kind: "team", value: t.key }); onClose(); }}>{t.key}</button>
            ))}
          </div>
        </>
      )}

      {pane === "person" && (
        <>
          <button className="ds-at__back" onClick={() => setPane("root")}>‹ Person</button>
          <div className="ds-at__grid">
            {PEOPLE.map((p) => (
              <button key={p} className="ds-at__tag" onClick={() => { onPick({ kind: "person", value: p }); onClose(); }}>{p}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
