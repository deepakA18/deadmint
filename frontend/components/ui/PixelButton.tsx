"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

interface PixelButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "gold" | "outline";
  size?: "sm" | "md" | "lg";
}

const VARIANT_STYLES = {
  primary: {
    bg: "var(--primary)",
    text: "#fff",
    border: "var(--primary-light)",
    shadow: "var(--primary-dark)",
  },
  secondary: {
    bg: "var(--panel)",
    text: "var(--foreground)",
    border: "var(--border-8bit)",
    shadow: "var(--background)",
  },
  danger: {
    bg: "var(--explosion-red)",
    text: "#fff",
    border: "#ff6b6b",
    shadow: "#a93226",
  },
  gold: {
    bg: "var(--loot-gold)",
    text: "var(--background)",
    border: "#f1c40f",
    shadow: "#b45309",
  },
  outline: {
    bg: "transparent",
    text: "var(--primary-light)",
    border: "var(--border-8bit)",
    shadow: "transparent",
  },
};

const SIZE_CLASSES = {
  sm: "px-5 py-2 text-xs",
  md: "px-7 py-3 text-sm",
  lg: "px-12 py-4 text-base",
};

export function PixelButton({
  children,
  variant = "primary",
  size = "md",
  className = "",
  style,
  ...props
}: PixelButtonProps) {
  const v = VARIANT_STYLES[variant];

  return (
    <button
      className={`relative inline-flex items-center justify-center gap-2 m-1.5 font-[family-name:var(--font-press-start)] cursor-pointer select-none transition-transform active:translate-y-0.5 hover:brightness-110 ${SIZE_CLASSES[size]} ${className}`}
      style={{
        background: v.bg,
        color: v.text,
        border: "none",
        ...style,
      }}
      {...props}
    >
      {/* TOP EDGES */}
      <span
        className="absolute -top-1 w-1/2 left-1 h-1 pointer-events-none"
        style={{ background: v.border }}
      />
      <span
        className="absolute -top-1 w-1/2 right-1 h-1 pointer-events-none"
        style={{ background: v.border }}
      />
      {/* BOTTOM EDGES */}
      <span
        className="absolute -bottom-1 w-1/2 left-1 h-1 pointer-events-none"
        style={{ background: v.shadow }}
      />
      <span
        className="absolute -bottom-1 w-1/2 right-1 h-1 pointer-events-none"
        style={{ background: v.shadow }}
      />
      {/* CORNER SQUARES */}
      <span
        className="absolute top-0 left-0 w-1 h-1 pointer-events-none"
        style={{ background: v.border }}
      />
      <span
        className="absolute top-0 right-0 w-1 h-1 pointer-events-none"
        style={{ background: v.border }}
      />
      <span
        className="absolute bottom-0 left-0 w-1 h-1 pointer-events-none"
        style={{ background: v.shadow }}
      />
      <span
        className="absolute bottom-0 right-0 w-1 h-1 pointer-events-none"
        style={{ background: v.shadow }}
      />
      {/* SIDE BARS */}
      <span
        className="absolute top-1 -left-1 h-[calc(100%-8px)] w-1 pointer-events-none"
        style={{ background: v.border }}
      />
      <span
        className="absolute top-1 -right-1 h-[calc(100%-8px)] w-1 pointer-events-none"
        style={{ background: v.shadow }}
      />
      {/* TOP INNER BEVEL */}
      <span className="absolute top-0 left-0 w-full h-0.5 bg-white/15 pointer-events-none" />

      {children}
    </button>
  );
}
