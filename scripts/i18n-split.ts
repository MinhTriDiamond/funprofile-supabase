/**
 * One-shot script: tách `src/i18n/translations.ts` thành các file `src/i18n/locales/<code>.ts`.
 * Chạy: bun scripts/i18n-split.ts
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src/i18n/translations.ts');
const OUT_DIR = join(ROOT, 'src/i18n/locales');

const META: Record<string, { name: string; nativeName: string; flagUrl: string; direction: 'ltr' | 'rtl'; isActive: boolean }> = {
  vi: { name: 'Vietnamese', nativeName: 'Tiếng Việt', flagUrl: 'https://flagcdn.com/w40/vn.png', direction: 'ltr', isActive: true },
  en: { name: 'English', nativeName: 'English', flagUrl: 'https://flagcdn.com/w40/us.png', direction: 'ltr', isActive: true },
  zh: { name: 'Chinese (Simplified)', nativeName: '中文', flagUrl: 'https://flagcdn.com/w40/cn.png', direction: 'ltr', isActive: false },
  ja: { name: 'Japanese', nativeName: '日本語', flagUrl: 'https://flagcdn.com/w40/jp.png', direction: 'ltr', isActive: false },
  ko: { name: 'Korean', nativeName: '한국어', flagUrl: 'https://flagcdn.com/w40/kr.png', direction: 'ltr', isActive: false },
  th: { name: 'Thai', nativeName: 'ไทย', flagUrl: 'https://flagcdn.com/w40/th.png', direction: 'ltr', isActive: false },
  id: { name: 'Indonesian', nativeName: 'Bahasa Indonesia', flagUrl: 'https://flagcdn.com/w40/id.png', direction: 'ltr', isActive: false },
  fr: { name: 'French', nativeName: 'Français', flagUrl: 'https://flagcdn.com/w40/fr.png', direction: 'ltr', isActive: false },
  es: { name: 'Spanish', nativeName: 'Español', flagUrl: 'https://flagcdn.com/w40/es.png', direction: 'ltr', isActive: false },
  de: { name: 'German', nativeName: 'Deutsch', flagUrl: 'https://flagcdn.com/w40/de.png', direction: 'ltr', isActive: false },
  pt: { name: 'Portuguese', nativeName: 'Português', flagUrl: 'https://flagcdn.com/w40/br.png', direction: 'ltr', isActive: false },
  ru: { name: 'Russian', nativeName: 'Русский', flagUrl: 'https://flagcdn.com/w40/ru.png', direction: 'ltr', isActive: false },
  ar: { name: 'Arabic', nativeName: 'العربية', flagUrl: 'https://flagcdn.com/w40/sa.png', direction: 'rtl', isActive: false },
};

const src = readFileSync(SRC, 'utf-8');
const lines = src.split('\n');

// Tìm các block dạng "  <code>: {" và đóng bằng "  }," ở cùng độ thụt
type Block = { code: string; start: number; end: number };
const blocks: Block[] = [];
const headerRe = /^  ([a-z]{2}): \{\s*$/;
let i = 0;
while (i < lines.length) {
  const m = lines[i].match(headerRe);
  if (m && META[m[1]]) {
    const code = m[1];
    const start = i;
    // tìm dòng "  }," kế tiếp ở mức 2 spaces
    let j = i + 1;
    while (j < lines.length && !/^  \},?\s*$/.test(lines[j])) j++;
    blocks.push({ code, start, end: j });
    i = j + 1;
  } else {
    i++;
  }
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

console.log(`Found ${blocks.length} language blocks`);

for (const b of blocks) {
  const meta = META[b.code];
  // Lấy phần thân giữa "{" và "}" — tức từ b.start+1 đến b.end-1
  const body = lines.slice(b.start + 1, b.end).join('\n');
  // De-indent một bậc (4 -> 2 spaces)
  const dedented = body.replace(/^    /gm, '  ').replace(/^  ([a-zA-Z])/gm, '  $1');

  const out = `/**
 * Locale: ${b.code} — ${meta.nativeName}
 * Auto-split from legacy translations.ts.
 *
 * To extend i18n with a new language: copy this file, change \`meta\`, translate the entries.
 * No code changes needed elsewhere.
 */
export const meta = {
  code: '${b.code}' as const,
  name: '${meta.name}',
  nativeName: ${JSON.stringify(meta.nativeName)},
  flagUrl: '${meta.flagUrl}',
  direction: '${meta.direction}' as 'ltr' | 'rtl',
  isActive: ${meta.isActive},
};

const dict = {
${dedented}
} as const;

export default dict;
`;
  writeFileSync(join(OUT_DIR, `${b.code}.ts`), out);
  console.log(`  wrote locales/${b.code}.ts (${dedented.split('\n').length} lines)`);
}

console.log('Done.');
