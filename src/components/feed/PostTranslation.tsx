import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { LANGUAGE_META } from '@/i18n/registry';

const translationCache = new Map<string, string>();
// Vietnamese labels live here in v1 so the large auto-generated vi chunk
// does not need a 95k file edit through the API for six short strings.
// Other languages fall back to the English keys in en-main.ts.
const VI_LABELS: Record<string, string> = {
  postSeeTranslation: 'Xem bản dịch',
  postHideTranslation: 'Ẩn bản dịch',
  postTranslating: 'Đang dịch...',
  postTranslatedInto: 'Bản dịch sang {lang}',
  postTranslationAutoNote: 'Bản dịch tự động, có thể chưa hoàn hảo.',
  postTranslationFailed: 'Chưa dịch được lúc này. Vui lòng thử lại sau.',
};
const VIETNAMESE_CHARS = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;
const MAX_CHUNK = 450;
const GOOGLE_MAX_CHUNK = 1800;

function mapTarget(lang: string): string {
  return lang === 'zh' ? 'zh-CN' : lang;
}

type Chunk = { text: string; joinWith: string };

function chunkText(text: string, maxChunk: number = MAX_CHUNK): Chunk[] {
  const paragraphs = text.split('\n');
  const chunks: Chunk[] = [];
  paragraphs.forEach((para, pi) => {
    const isLastPara = pi === paragraphs.length - 1;
    if (!para) {
      chunks.push({ text: '', joinWith: isLastPara ? '' : '\n' });
      return;
    }
    const words = para.split(' ');
    let cur = '';
    const pushCur = (joinWith: string) => {
      if (cur) chunks.push({ text: cur, joinWith });
      cur = '';
    };
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (next.length > maxChunk && cur) {
        pushCur(' ');
        cur = word;
      } else {
        cur = next;
      }
    }
    pushCur(isLastPara ? '' : '\n');
  });
  return chunks;
}

function isApiErrorText(text: string): boolean {
  // MyMemory returns API errors as a 200 response whose "translation" is an
  // English error sentence. Never show that sentence as a translation.
  return /invalid (source|target) language|mymemory warning|query length|no query specified/i.test(text);
}

function detectSourceByScript(text: string): string | null {
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh-CN';
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[\u0400-\u04ff]/.test(text)) return 'ru';
  if (/[\u0600-\u06ff]/.test(text)) return 'ar';
  if (/[\u0e00-\u0e7f]/.test(text)) return 'th';
  if (/[\u0590-\u05ff]/.test(text)) return 'he';
  if (/[\u0900-\u097f]/.test(text)) return 'hi';
  return null;
}

async function translateWithMyMemory(chunk: string, target: string, source: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=${source}|${target}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory ${res.status}`);
  const data = await res.json();
  const translated = data?.responseData?.translatedText as string | undefined;
  if (!translated || isApiErrorText(translated)) {
    throw new Error('MyMemory unavailable');
  }
  return translated;
}

async function translateWithGoogle(chunk: string, target: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(chunk)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Google ${res.status}`);
  const data = await res.json();
  const parts = Array.isArray(data?.[0]) ? data[0] : [];
  const translated = parts
    .map((p: unknown) => (Array.isArray(p) ? String(p[0] ?? '') : ''))
    .join('');
  if (!translated || isApiErrorText(translated)) throw new Error('Google empty');
  return translated;
}

function normalizeForTranslation(text: string): string {
  // Machine translation misreads ALL-CAPS headings: Google translated the
  // all-caps title "A SURGE OF LOVE" as "TÌNH YÊU BỘT DỘI", while the same
  // title in normal case translates correctly. Only the translation INPUT
  // is normalized; the original post on screen is never changed.
  return text.split('\n').map((line) => {
    const upper = (line.match(/[A-Z]/g) || []).length;
    const lower = (line.match(/[a-z]/g) || []).length;
    if (upper >= 4 && lower === 0) {
      const lowered = line.toLowerCase();
      return lowered.replace(/[a-zà-ý]/, (c) => c.toUpperCase());
    }
    return line;
  }).join('\n');
}

function applyFatherGlossary(text: string): string {
  // Vietnamese only, and only for phrases that unambiguously mean the
  // Universal Father in this community. Google renders "Father" as
  // "Chúa Cha" or "Người Cha Hoàn vũ / Phổ Quốc"; the community name is
  // "Cha Vũ Trụ". A bare "Người Cha" (which could mean a human father)
  // is deliberately left untouched.
  return text
    .replace(/Người Cha Hoàn vũ/gi, 'Cha Vũ Trụ')
    .replace(/Người Cha Phổ Quốc/gi, 'Cha Vũ Trụ')
    .replace(/Người Cha Vũ Trụ/gi, 'Cha Vũ Trụ')
    .replace(/Chúa Cha/gi, 'Cha Vũ Trụ');
}

async function translateText(text: string, target: string): Promise<string> {
  const normalized = normalizeForTranslation(text);
  // Larger, paragraph-aware chunks for Google (1800 chars) so a heading and
  // its paragraph keep more context than the old 450-char word cuts.
  const chunks = chunkText(normalized, GOOGLE_MAX_CHUNK);
  const out: string[] = [];
  for (const chunk of chunks) {
    if (!chunk.text) {
      out.push('');
      if (chunk.joinWith) out.push(chunk.joinWith);
      continue;
    }
    let translated: string;
    try {
      // Google accepts sl=auto; MyMemory does NOT accept source "auto" and
      // returns an error sentence instead of a translation, so Google goes first.
      translated = await translateWithGoogle(chunk.text, target);
    } catch {
      const source = detectSourceByScript(chunk.text) ?? 'en';
      const subChunks = chunkText(chunk.text, MAX_CHUNK);
      const subOut: string[] = [];
      for (const sub of subChunks) {
        if (!sub.text) {
          subOut.push('');
          if (sub.joinWith) subOut.push(sub.joinWith);
          continue;
        }
        subOut.push(await translateWithMyMemory(sub.text, target, source));
        if (sub.joinWith) subOut.push(sub.joinWith);
      }
      translated = subOut.join('');
    }
    out.push(translated);
    if (chunk.joinWith) out.push(chunk.joinWith);
  }
  const joined = out.join('').trim();
  return target === 'vi' ? applyFatherGlossary(joined) : joined;
}

export function PostTranslation({ content }: { content: string }) {
  const { language, t } = useLanguage();
  const [show, setShow] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const target = mapTarget(language);
  const label = (key: string, params?: Record<string, string | number>) => {
    if (language === 'vi') {
      const template = VI_LABELS[key] ?? key;
      return params
        ? template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
        : template;
    }
    return t(key, params);
  };

  useEffect(() => {
    setShow(false);
    setTranslated(null);
    setFailed(false);
  }, [target]);

  const handleToggle = useCallback(async () => {
    if (show) {
      setShow(false);
      return;
    }
    if (translated) {
      setShow(true);
      return;
    }
    const key = `${target}::${content}`;
    const cached = translationCache.get(key);
    if (cached) {
      setTranslated(cached);
      setShow(true);
      return;
    }
    setLoading(true);
    setFailed(false);
    try {
      const result = await translateText(content, target);
      if (!result || result.trim().toLowerCase() === content.trim().toLowerCase()) {
        setFailed(true);
        setLoading(false);
        return;
      }
      translationCache.set(key, result);
      setTranslated(result);
      setShow(true);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [show, translated, target, content]);

  if (!content.trim()) return null;
  // v1 heuristic: a Vietnamese post needs no button when the viewer already reads Vietnamese.
  if (language === 'vi' && VIETNAMESE_CHARS.test(content)) return null;

  const nativeName = LANGUAGE_META[language]?.nativeName ?? language;

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        className="min-h-[32px] text-sm font-semibold text-muted-foreground hover:underline disabled:opacity-60"
      >
        {loading ? label('postTranslating') : show ? label('postHideTranslation') : label('postSeeTranslation')}
      </button>
      {failed && !show && (
        <p className="text-sm text-muted-foreground">{label('postTranslationFailed')}</p>
      )}
      {show && translated && (
        <div className="mt-1 rounded-lg border border-border bg-muted/50 px-3 py-2">
          <div className="text-xs font-semibold text-muted-foreground">
            {label('postTranslatedInto', { lang: nativeName })}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{translated}</p>
          <div className="mt-1 text-xs text-muted-foreground">{label('postTranslationAutoNote')}</div>
        </div>
      )}
    </div>
  );
}
