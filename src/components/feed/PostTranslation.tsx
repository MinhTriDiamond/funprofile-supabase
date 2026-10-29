import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/i18n/LanguageContext';
import { LANGUAGE_META } from '@/i18n/registry';

const translationCache = new Map<string, string>();
const VIETNAMESE_CHARS = /[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i;
const MAX_CHUNK = 450;

function mapTarget(lang: string): string {
  return lang === 'zh' ? 'zh-CN' : lang;
}

type Chunk = { text: string; joinWith: string };

function chunkText(text: string): Chunk[] {
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
      if (next.length > MAX_CHUNK && cur) {
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

async function translateWithMyMemory(chunk: string, target: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=auto|${target}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory ${res.status}`);
  const data = await res.json();
  const translated = data?.responseData?.translatedText as string | undefined;
  if (!translated || /MYMEMORY WARNING|QUERY LENGTH LIMIT|NO QUERY SPECIFIED/i.test(translated)) {
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
  if (!translated) throw new Error('Google empty');
  return translated;
}

async function translateText(text: string, target: string): Promise<string> {
  const chunks = chunkText(text);
  const out: string[] = [];
  for (const chunk of chunks) {
    if (!chunk.text) {
      out.push('');
      if (chunk.joinWith) out.push(chunk.joinWith);
      continue;
    }
    let translated: string;
    try {
      translated = await translateWithMyMemory(chunk.text, target);
    } catch {
      translated = await translateWithGoogle(chunk.text, target);
    }
    out.push(translated);
    if (chunk.joinWith) out.push(chunk.joinWith);
  }
  return out.join('').trim();
}

export function PostTranslation({ content }: { content: string }) {
  const { language, t } = useLanguage();
  const [show, setShow] = useState(false);
  const [translated, setTranslated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const target = mapTarget(language);

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
        {loading ? t('postTranslating') : show ? t('postHideTranslation') : t('postSeeTranslation')}
      </button>
      {failed && !show && (
        <p className="text-sm text-muted-foreground">{t('postTranslationFailed')}</p>
      )}
      {show && translated && (
        <div className="mt-1 rounded-lg border border-border bg-muted/50 px-3 py-2">
          <div className="text-xs font-semibold text-muted-foreground">
            {t('postTranslatedInto', { lang: nativeName })}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-relaxed">{translated}</p>
          <div className="mt-1 text-xs text-muted-foreground">{t('postTranslationAutoNote')}</div>
        </div>
      )}
    </div>
  );
}
