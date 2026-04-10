import { useState, useRef, useEffect } from "react";
import { Eye, EyeOff } from "lucide-react";

interface Props {
  name: string;
  truncateAt?: number;
  className?: string;
  popoverClassName?: string;
}

/**
 * Renders a product name truncated at `truncateAt` characters.
 * An eye icon appears at the top-right corner; clicking it toggles a
 * floating card that shows the full name. Clicks outside close it.
 */
export function TruncatedProductName({
  name,
  truncateAt = 60,
  className = "",
  popoverClassName = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (name.length <= truncateAt) {
    return <span className={className}>{name}</span>;
  }

  return (
    <span ref={wrapRef} className={`relative inline-block pr-5 ${className}`}>
      {name.slice(0, truncateAt)}&hellip;
      {/* Eye toggle button — absolutely positioned top-right */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="absolute top-0 right-0 text-muted-foreground hover:text-primary transition-colors"
        title={open ? "Hide full name" : "Show full name"}
        aria-label={open ? "Hide full product name" : "Show full product name"}
      >
        {open ? (
          <EyeOff className="h-3.5 w-3.5" />
        ) : (
          <Eye className="h-3.5 w-3.5" />
        )}
      </button>
      {/* Full-name popover */}
      {open && (
        <span
          className={`absolute top-6 left-0 z-50 min-w-[200px] max-w-xs p-2.5 rounded-lg border border-border bg-popover text-popover-foreground text-xs font-normal leading-relaxed shadow-lg ${popoverClassName}`}
        >
          {name}
        </span>
      )}
    </span>
  );
}
