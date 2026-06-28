import React, { useEffect, useRef, useState } from "react";

/**
 * Sidebar — Notion-style left rail.
 *   • workspace/tenant switcher at the top (click → dropdown: switch, settings,
 *     members, add workspace, log out)
 *   • a page list (the roadmaps) with active highlight + inline rename
 *   • a "+ New roadmap" action and a collapse toggle
 *
 * Pure presentational: all data + handlers come from props, so the same sidebar
 * works against localStorage now and Supabase later.
 *
 * props:
 *   workspace: { name, plan?, memberCount? }
 *   workspaces: [{ id, name }]              // for the switcher list
 *   roadmaps: [{ id, name }]
 *   activeId
 *   collapsed, onToggleCollapse
 *   onSwitchWorkspace(id), onAddWorkspace(), onWorkspaceSettings(), onMembers()
 *   onSelectRoadmap(id), onRenameRoadmap(id, name), onNewRoadmap(), onDeleteRoadmap(id)
 */
export default function Sidebar({
  workspace = { name: "Workspace" },
  workspaces = [],
  roadmaps = [],
  activeId,
  collapsed = false,
  onToggleCollapse,
  onSwitchWorkspace,
  onAddWorkspace,
  onWorkspaceSettings,
  onMembers,
  onSelectRoadmap,
  onRenameRoadmap,
  onNewRoadmap,
  onDeleteRoadmap,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(null); // roadmap id being renamed
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    const onEsc = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [menuOpen]);

  if (collapsed) {
    return (
      <aside className="sb sb--collapsed">
        <button className="sb-collapse-btn" title="Expand sidebar" onClick={onToggleCollapse}>»</button>
        <div className="sb-avatar sb-avatar--mini" title={workspace.name}>{initials(workspace.name)}</div>
      </aside>
    );
  }

  return (
    <aside className="sb">
      {/* workspace switcher */}
      <div className="sb-switcher" ref={menuRef}>
        <button className="sb-tenant" onClick={() => setMenuOpen((v) => !v)}>
          <span className="sb-avatar">{initials(workspace.name)}</span>
          <span className="sb-tenant-name">{workspace.name}</span>
          <span className="sb-caret">⌄</span>
        </button>
        <button className="sb-collapse-btn" title="Collapse sidebar" onClick={onToggleCollapse}>«</button>

        {menuOpen && (
          <div className="sb-menu">
            <div className="sb-menu-head">
              <span className="sb-avatar sb-avatar--lg">{initials(workspace.name)}</span>
              <div className="sb-menu-meta">
                <div className="sb-menu-name">{workspace.name}</div>
                <div className="sb-menu-sub">
                  {workspace.plan || "Free plan"}{workspace.memberCount != null ? ` · ${workspace.memberCount} member${workspace.memberCount === 1 ? "" : "s"}` : ""}
                </div>
              </div>
            </div>
            <div className="sb-menu-actions">
              <button className="sb-menu-btn" onClick={() => { setMenuOpen(false); onWorkspaceSettings?.(); }}>⚙ Settings</button>
              <button className="sb-menu-btn" onClick={() => { setMenuOpen(false); onMembers?.(); }}>👤 Members</button>
            </div>
            {workspaces.length > 0 && <div className="sb-menu-sep" />}
            {workspaces.map((w) => (
              <button key={w.id} className={"sb-menu-item" + (w.id === workspace.id ? " on" : "")}
                onClick={() => { setMenuOpen(false); onSwitchWorkspace?.(w.id); }}>
                <span className="sb-avatar sb-avatar--sm">{initials(w.name)}</span>
                <span className="sb-menu-item-name">{w.name}</span>
                {w.id === workspace.id && <span className="sb-check">✓</span>}
              </button>
            ))}
            <div className="sb-menu-sep" />
            <button className="sb-menu-item" onClick={() => { setMenuOpen(false); onAddWorkspace?.(); }}>
              <span className="sb-avatar sb-avatar--sm sb-avatar--plus">＋</span>
              <span className="sb-menu-item-name">New workspace</span>
            </button>
          </div>
        )}
      </div>

      {/* roadmap (page) list */}
      <div className="sb-section">
        <div className="sb-section-head">
          <span>Roadmaps</span>
          <button className="sb-add" title="New roadmap" onClick={onNewRoadmap}>＋</button>
        </div>
        <nav className="sb-pages">
          {roadmaps.map((r) => (
            <div key={r.id} className={"sb-page" + (r.id === activeId ? " on" : "")}>
              {renaming === r.id ? (
                <input
                  className="sb-page-rename"
                  autoFocus
                  defaultValue={r.name}
                  onBlur={(e) => { onRenameRoadmap?.(r.id, e.target.value.trim() || r.name); setRenaming(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") { setRenaming(null); }
                  }}
                />
              ) : (
                <button className="sb-page-btn" onClick={() => onSelectRoadmap?.(r.id)} onDoubleClick={() => setRenaming(r.id)}>
                  <span className="sb-page-icon">▦</span>
                  <span className="sb-page-name">{r.name || "Untitled"}</span>
                </button>
              )}
              {r.id === activeId && roadmaps.length > 1 && (
                <button className="sb-page-x" title="Delete roadmap"
                  onClick={(e) => { e.stopPropagation(); onDeleteRoadmap?.(r.id); }}>✕</button>
              )}
            </div>
          ))}
          <button className="sb-page sb-page--new" onClick={onNewRoadmap}>
            <span className="sb-page-icon">＋</span>
            <span className="sb-page-name">New roadmap</span>
          </button>
        </nav>
      </div>
    </aside>
  );
}

function initials(name) {
  const s = (name || "").trim();
  if (!s) return "·";
  const parts = s.split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}
