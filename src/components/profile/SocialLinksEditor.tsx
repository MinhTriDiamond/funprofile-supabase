import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Plus } from 'lucide-react';
import type { SocialLink } from './AvatarOrbit';

export const PLATFORM_PRESETS: Record<string, { label: string; color: string; favicon: string }> = {
  angel: {
    label: 'Angel AI',
    color: '#C9A227',
    favicon: '/angel-logo.jpg',
  },
  funplay: {
    label: 'Fun Play',
    color: '#1a56db',
    favicon: '/funplay-logo.png',
  },
  facebook: {
    label: 'Facebook',
    color: '#1877F2',
    favicon: 'https://www.facebook.com/favicon.ico',
  },
  youtube: {
    label: 'YouTube',
    color: '#FF0000',
    favicon: 'https://www.youtube.com/favicon.ico',
  },
  twitter: {
    label: 'Twitter / X',
    color: '#000000',
    favicon: 'https://abs.twimg.com/favicons/twitter.3.ico',
  },
  telegram: {
    label: 'Telegram',
    color: '#2AABEE',
    favicon: 'https://telegram.org/favicon.ico',
  },
  tiktok: {
    label: 'TikTok',
    color: '#010101',
    favicon: 'https://www.tiktok.com/favicon.ico',
  },
  linkedin: {
    label: 'LinkedIn',
    color: '#0077B5',
    favicon: 'https://www.linkedin.com/favicon.ico',
  },
  zalo: {
    label: 'Zalo',
    color: '#0068FF',
    favicon: '/zalo-logo-v2.png',
  },
};

export const PLATFORM_ORDER = ['angel', 'funplay', 'facebook', 'youtube', 'twitter', 'telegram', 'tiktok', 'linkedin', 'zalo'];

interface SocialLinksEditorProps {
  value: SocialLink[];
  onChange: (links: SocialLink[]) => void;
}

export function SocialLinksEditor({ value, onChange }: SocialLinksEditorProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('facebook');
  const [inputUrl, setInputUrl] = useState('');

  const usedPlatforms = new Set(value.map((l) => l.platform));

  const handleAdd = () => {
    const url = inputUrl.trim();
    if (!url || !selectedPlatform) return;
    if (value.length >= 9) return;

    const preset = PLATFORM_PRESETS[selectedPlatform];
    if (!preset) return;

    // Normalize URL
    const normalized = url.startsWith('http') ? url : `https://${url}`;

    onChange([
      ...value,
      {
        platform: selectedPlatform,
        label: preset.label,
        url: normalized,
        color: preset.color,
        favicon: preset.favicon,
      },
    ]);
    setInputUrl('');
    // Auto-select next available platform
    const next = PLATFORM_ORDER.find((p) => p !== selectedPlatform && !usedPlatforms.has(p) && p !== selectedPlatform);
    if (next) setSelectedPlatform(next);
  };

  const handleRemove = (platform: string) => {
    onChange(value.filter((l) => l.platform !== platform));
  };

  const availablePlatforms = PLATFORM_ORDER.filter((p) => !usedPlatforms.has(p));

  return (
    <div className="space-y-3">
      <Label>🌐 Mạng xã hội <span className="text-muted-foreground text-xs">({value.length}/9)</span></Label>

      {/* Existing links */}
      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((link) => (
            <div key={link.platform} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-muted/30">
              <div
                className="w-7 h-7 rounded-full bg-white flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden"
                style={{ border: `2px solid ${link.color}` }}
              >
                {link.avatarUrl ? (
                  <img
                    src={link.avatarUrl}
                    alt={link.label}
                    className="w-full h-full object-cover rounded-full"
                    onError={(e) => {
                      e.currentTarget.src = link.favicon;
                      e.currentTarget.className = 'w-4 h-4 object-contain';
                    }}
                  />
                ) : (
                  <img
                    src={link.favicon}
                    alt={link.label}
                    className="w-4 h-4 object-contain"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{link.label}</p>
                <p className="text-xs text-muted-foreground truncate">{link.url}</p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(link.platform)}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new link */}
      {availablePlatforms.length > 0 && value.length < 9 && (
        <div className="space-y-2 p-3 rounded-lg border border-dashed border-border bg-muted/20">
          <p className="text-xs font-medium text-muted-foreground">Thêm mạng xã hội</p>
          <div className="grid grid-cols-3 gap-1.5">
            {availablePlatforms.map((p) => {
              const preset = PLATFORM_PRESETS[p];
              const isSelected = selectedPlatform === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPlatform(p)}
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border text-xs transition-all"
                  style={{
                    borderColor: isSelected ? preset.color : 'transparent',
                    background: isSelected ? `${preset.color}18` : 'transparent',
                    color: isSelected ? preset.color : undefined,
                  }}
                >
                  <div
                    className="w-4 h-4 rounded-full bg-white flex items-center justify-center flex-shrink-0"
                    style={{ border: `1.5px solid ${preset.color}` }}
                  >
                    <img
                      src={preset.favicon}
                      alt={preset.label}
                      className="w-3 h-3 object-contain"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                  <span className="truncate">{preset.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder={`Link trang cá nhân ${PLATFORM_PRESETS[selectedPlatform]?.label || ''}`}
              className="text-sm h-8"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            />
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={!inputUrl.trim()}
              className="h-8 px-3"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {value.length >= 9 && (
        <p className="text-xs text-muted-foreground">Đã đạt tối đa 9 mạng xã hội.</p>
      )}
    </div>
  );
}
