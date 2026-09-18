import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';

interface SmartDescriptionInputProps {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}

export function SmartDescriptionInput({
  value,
  onChange,
  maxLength = 5000,
  placeholder = 'Nhấn để thêm mô tả...',
  className = '',
}: SmartDescriptionInputProps) {
  const [expanded, setExpanded] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!expanded) return;
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const max = Math.min(Math.floor(viewportHeight * 0.42), 320);
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
  }, [value, expanded]);

  if (!expanded) {
    const preview = value.trim();
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true);
          setTimeout(() => taRef.current?.focus(), 30);
        }}
        className={`flex min-h-12 w-full items-center gap-2 rounded-2xl border border-white/15 bg-black/45 px-4 py-3 text-left shadow-lg shadow-black/20 backdrop-blur-md transition-colors hover:border-white/30 ${className}`}
      >
        <Pencil className="h-4 w-4 shrink-0 text-white/70" />
        <span
          className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[16px] leading-5 ${
            preview ? 'text-white' : 'text-white/60'
          }`}
        >
          {preview || placeholder}
        </span>
      </button>
    );
  }

  return (
    <div className={`animate-fade-in rounded-2xl border border-white/20 bg-black/80 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl ${className}`}>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
        onBlur={() => setExpanded(false)}
        placeholder={placeholder}
        maxLength={maxLength}
        enterKeyHint="enter"
        autoCapitalize="sentences"
        inputMode="text"
        rows={1}
        className="w-full resize-none bg-transparent px-3 py-2 text-[16px] leading-relaxed text-white placeholder:text-white/60 focus:outline-none"
        style={{ maxHeight: 'min(42dvh, 320px)' }}
      />
      <div className="flex items-center justify-between px-2 pb-1">
        <span className="text-[11px] text-white/40">
          {value.length >= maxLength - 500
            ? `${value.length}/${maxLength}`
            : ''}
        </span>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setExpanded(false)}
          className="rounded-lg px-3 py-1 text-sm font-semibold text-white/90 hover:text-white"
        >
          Xong
        </button>
      </div>
    </div>
  );
}
