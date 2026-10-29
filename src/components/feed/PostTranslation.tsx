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
  // Vietnamese only, from Ái Vân's canonical translation (2026-10-29).
  // "Ý Chúa Cha" is the community's fixed phrase "Ý Cha" in the canonical
  // text, so it is replaced first, before the generic "Chúa Cha" rule.
  // A bare "Người Cha" is deliberately left untouched: it may mean a
  // human father, not the Universal Father.
  return text
    .replace(/Ý Chúa Cha/gi, 'Ý Cha')
    .replace(/Người Cha Hoàn vũ/gi, 'Cha Vũ Trụ')
    .replace(/Người Cha Phổ Quốc/gi, 'Cha Vũ Trụ')
    .replace(/Người Cha Vũ Trụ/gi, 'Cha Vũ Trụ')
    .replace(/Chúa Cha/gi, 'Cha Vũ Trụ')
    .replace(/Đấng Điều Chỉnh Suy Nghĩ/gi, 'Đấng Điều Chỉnh Tư Tưởng')
    .replace(/Người Điều Chỉnh Suy Nghĩ/gi, 'Đấng Điều Chỉnh Tư Tưởng');
}

function isAllCapsLine(line: string): boolean {
  const upper = (line.match(/[A-Z]/g) || []).length;
  const lower = (line.match(/[a-z]/g) || []).length;
  return upper >= 4 && lower === 0;
}

// SYSTEM-LEVEL TERM PROTECTION (2026-10-29, per Ái Vân's rules).
// There is no AI prompt in this pipeline: translation is Google MT
// (literal, no summarising or rewriting) plus MyMemory fallback. A
// dictionary MT engine cannot know that "Father's Will" here means the
// divine will, not a legal testament — left alone it renders it as
// "Di chúc của Chúa Cha". So key spiritual terms are replaced with
// inert placeholders BEFORE translation (Google preserves tokens like
// ZZTERM01ZZ exactly, verified 2026-10-29) and restored to the canonical
// target-language term AFTER translation. The machine therefore never
// gets a chance to reinterpret the term. This applies to every post,
// not to one article.
// For targets other than Vietnamese/English, only terms the community
// keeps in English (Steward, Conduit, Love & Light Economy) are
// protected; Father terms are left to normal MT for those languages.
type TermRule = {
  patterns: RegExp[];
  vi: string | null;
  en: string | null;
  other: string | null;
};
const TERM_RULES: TermRule[] = [
  { patterns: [/Everything Belongs to the Father/gi, /Tất Cả Là Của Cha/gi], vi: 'Tất Cả Là Của Cha', en: 'Everything Belongs to the Father', other: null },
  { patterns: [/the Father's Will/gi, /Father's Will/gi, /Ý Cha/gi], vi: 'Ý Cha', en: "the Father's Will", other: null },
  { patterns: [/Father Universe/gi, /Universal Father/gi, /Cha Vũ Trụ/gi], vi: 'Cha Vũ Trụ', en: 'Father Universe', other: null },
  { patterns: [/the Almighty/gi, /Đấng Toàn Năng/gi], vi: 'Đấng Toàn Năng', en: 'the Almighty', other: null },
  { patterns: [/Thought Adjuster/gi, /Đấng Điều Chỉnh Tư Tưởng/gi], vi: 'Đấng Điều Chỉnh Tư Tưởng', en: 'Thought Adjuster', other: null },
  { patterns: [/Love & Light Economy/gi, /Nền Kinh Tế Tình Yêu & Ánh Sáng/gi, /nền kinh tế Tình Yêu và Ánh Sáng/gi], vi: 'nền kinh tế Tình Yêu và Ánh Sáng', en: 'Love & Light Economy', other: 'Love & Light Economy' },
  { patterns: [/Stewards/gi], vi: 'Stewards', en: 'Stewards', other: 'Stewards' },
  { patterns: [/Steward/gi, /Người quản lý trung tín/gi], vi: 'Steward', en: 'Steward', other: 'Steward' },
  { patterns: [/Conduits/gi], vi: 'Kênh dẫn', en: 'Conduits', other: 'Conduits' },
  { patterns: [/Conduit/gi, /Kênh dẫn/gi, /Ống dẫn/gi], vi: 'Kênh dẫn', en: 'Conduit', other: 'Conduit' },
];

function protectTerms(text: string, target: string): { text: string; map: Record<string, string> } {
  let out = text;
  const map: Record<string, string> = {};
  TERM_RULES.forEach((rule, idx) => {
    const restored = target === 'vi' ? rule.vi : target === 'en' || target.startsWith('en-') ? rule.en : rule.other;
    if (!restored) return;
    const placeholder = `ZZTERM${String(idx + 1).padStart(2, '0')}ZZ`;
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(out)) {
        pattern.lastIndex = 0;
        out = out.replace(pattern, placeholder);
        map[placeholder] = restored;
      }
    }
  });
  return { text: out, map };
}

function restoreTerms(text: string, map: Record<string, string>): string {
  let out = text;
  for (const [placeholder, restored] of Object.entries(map)) {
    out = out.replace(new RegExp(placeholder, 'gi'), restored);
  }
  return out;
}

function applyBackupGlossary(text: string, target: string): string {
  if (target === 'vi' || target.startsWith('vi-')) {
    return text
      .replace(/Di chúc của Cha Vũ Trụ/gi, 'Ý Cha Vũ Trụ')
      .replace(/Di chúc của Chúa Cha/gi, 'Ý Cha')
      .replace(/Di chúc của người cha/gi, 'Ý Cha')
      .replace(/Di chúc của cha/gi, 'Ý Cha');
  }
  if (target === 'en' || target.startsWith('en-')) {
    return text
      .replace(/father's testament/gi, "the Father's Will")
      .replace(/the testament of the father/gi, "the Father's Will")
      .replace(/Universe Father/gi, 'Father Universe')
      .replace(/Father of the Universe/gi, 'Father Universe');
  }
  return text;
}

async function translateText(text: string, target: string): Promise<string> {
  // Translate paragraph by paragraph, so headings keep their style and
  // each paragraph keeps its context. A paragraph that was ALL-CAPS in
  // the original is uppercased again after translation, matching the
  // canonical translation's heading style.
  // BUG FIX (2026-10-29): wasAllCaps must be read from the ORIGINAL
  // paragraph, not the normalized one — normalization already converts
  // ALL-CAPS to sentence case, so checking after normalization was
  // always false and headings never became uppercase again.
  const originalParagraphs = text.split('\n');
  const paragraphs = normalizeForTranslation(text).split('\n');
  const out: string[] = [];
  for (let pi = 0; pi < paragraphs.length; pi++) {
    const para = paragraphs[pi];
    if (!para) {
      if (pi < paragraphs.length - 1) out.push('\n');
      continue;
    }
    const wasAllCaps = isAllCapsLine(originalParagraphs[pi] ?? '');
    const protectedPara = protectTerms(para, target);
    const paraToTranslate = protectedPara.text;
    let translated: string;
    try {
      // Google accepts sl=auto; MyMemory does NOT accept source "auto" and
      // returns an error sentence instead of a translation, so Google goes first.
      const subChunks = chunkText(paraToTranslate, GOOGLE_MAX_CHUNK);
      const subOut: string[] = [];
      for (const sub of subChunks) {
        if (!sub.text) continue;
        subOut.push(await translateWithGoogle(sub.text, target));
        if (sub.joinWith) subOut.push(sub.joinWith);
      }
      translated = subOut.join('');
    } catch {
      const source = detectSourceByScript(para) ?? 'en';
      const subChunks = chunkText(paraToTranslate, MAX_CHUNK);
      const subOut: string[] = [];
      for (const sub of subChunks) {
        if (!sub.text) {
          if (sub.joinWith) subOut.push(sub.joinWith);
          continue;
        }
        subOut.push(await translateWithMyMemory(sub.text, target, source));
        if (sub.joinWith) subOut.push(sub.joinWith);
      }
      translated = subOut.join('');
    }
    translated = restoreTerms(translated, protectedPara.map);
    if (wasAllCaps) translated = translated.toUpperCase();
    out.push(translated);
    if (pi < paragraphs.length - 1) out.push('\n');
  }
  const joined = out.join('').trim();
  let finalText = target === 'vi' || target.startsWith('vi-') ? applyFatherGlossary(joined) : joined;
  finalText = applyBackupGlossary(finalText, target);
  return finalText;
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
