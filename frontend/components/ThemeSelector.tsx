"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme } from "@/providers/ThemeProvider";
import { THEMES } from "@/lib/themes";

export function ThemeSelector() {
  const { activeTheme, setActiveTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = THEMES.find((t) => t.name === activeTheme) ?? THEMES[0];

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative z-50">
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 text-xs transition-all hover:brightness-125 active:translate-y-0.5 cursor-pointer"
        style={{
          backgroundColor: "var(--panel)",
          border: "3px solid var(--border-8bit)",
          color: "var(--foreground)",
        }}
      >
        <span
          className="w-3 h-3 flex-shrink-0"
          style={{ backgroundColor: current.indicatorColor }}
        />
        <span>{current.label}</span>
        <span
          className="text-[10px] ml-1"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s",
            display: "inline-block",
          }}
        >
          {"\u25BC"}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute top-full right-0 mt-1 w-48 max-h-72 overflow-y-auto"
          style={{
            backgroundColor: "var(--background)",
            border: "3px solid var(--border-8bit)",
          }}
        >
          {THEMES.map((theme) => (
            <button
              key={theme.name}
              onClick={() => {
                setActiveTheme(theme.name);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:brightness-125 cursor-pointer"
              style={{
                backgroundColor:
                  theme.name === activeTheme
                    ? "var(--panel)"
                    : "transparent",
                color: "var(--foreground)",
              }}
            >
              <span
                className="w-3 h-3 flex-shrink-0"
                style={{
                  backgroundColor: theme.indicatorColor,
                  border: "1px solid var(--foreground)",
                }}
              />
              <span className="flex-1">{theme.label}</span>
              {theme.name === activeTheme && (
                <span style={{ color: "var(--primary)" }}>{"\u2713"}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
