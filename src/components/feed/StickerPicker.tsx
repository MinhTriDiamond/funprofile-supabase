import { useState, useCallback } from 'react';
import { X } from 'lucide-react';
import { STICKER_CATEGORIES } from '@/data/curatedStickers';
import { TwemojiImage } from '@/components/ui/TwemojiImage';

interface StickerPickerProps {
  onSelect: (stickerUrl: string) => void;
  onClose: () => void;
}

const StickerImage = ({ url, alt }: { url: string; alt: string }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <span className="text-3xl leading-none select-none">{alt}</span>
    );
  }

  return (
    <>
      {!loaded && (
        <div className="absolute inset-1.5 rounded-lg bg-muted/50 animate-pulse" />
      )}
      <img
        src={url}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`w-full h-full object-contain transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </>
  );
};

const StickerPicker = ({ onSelect, onClose }: StickerPickerProps) => {
  const [activeCategory, setActiveCategory] = useState(0);
  const category = STICKER_CATEGORIES[activeCategory];

  const handleSelect = useCallback((url: string) => {
    onSelect(url);
  }, [onSelect]);

  return (
    <div className="w-80 max-h-96 bg-card border border-border rounded-xl shadow-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="font-semibold text-sm">Stickers</span>
        <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-secondary flex items-center justify-center">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Category tabs */}
      <div className="flex gap-0.5 px-2 py-1.5 border-b border-border overflow-x-auto scrollbar-none">
        {STICKER_CATEGORIES.map((cat, i) => (
          <button
            key={cat.name}
            onClick={() => setActiveCategory(i)}
            className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
              i === activeCategory ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-secondary'
            }`}
            title={cat.name}
          >
            <TwemojiImage emoji={cat.icon} size={20} />
          </button>
        ))}
      </div>

      {/* Sticker grid — responsive: 4 cols mobile, 5 cols desktop */}
      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-4 sm:grid-cols-5 gap-2">
        {category.stickers.map((sticker, i) => (
          <button
            key={i}
            onClick={() => handleSelect(sticker.url)}
            className="relative aspect-square rounded-xl p-1.5 hover:bg-primary/5 active:scale-95 transition-all hover:scale-110 flex items-center justify-center"
          >
            <StickerImage url={sticker.url} alt={sticker.alt} />
          </button>
        ))}
      </div>
    </div>
  );
};

export default StickerPicker;
