/**
 * M6B #8 guard — nhánh `transactions` của v_unified_transactions không được
 * bỏ sót token/chain production đang có dữ liệu thật (CAMLY 56/137, FUN 56),
 * và KHÔNG được để lọt dữ liệu testnet (chain 97) vào view/export production.
 *
 * Lớp 1 (offline): snapshot bằng chứng đã commit (mốc 54 dòng).
 * Lớp 2 (live, tự SKIP nếu không có PGHOST): kiểm tra định nghĩa view + đếm gap = 0.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EV = resolve(
  process.cwd(),
  "docs/audit/bsc-m6b-20260827/evidence/m6b-gap-preview.txt",
);
const hasPg = Boolean(process.env.PGHOST);
const psql = (sql: string) =>
  execFileSync("psql", ["-At", "-c", sql], { encoding: "utf8" }).trim();

/** Whitelist production ĐÃ CHỐT (loại chain 97 testnet). */
const WHITELIST_SQL = `
  (upper(t.token_symbol) = 'BTC' and t.chain_id = 0)
  or (t.chain_id = 56 and upper(t.token_symbol) = 'USDT')
  or (t.chain_id = 56 and upper(t.token_symbol) = 'BNB' and t.token_address is null)
  or (upper(t.token_symbol) = 'CAMLY' and t.chain_id in (56, 137))
  or (upper(t.token_symbol) = 'FUN' and t.chain_id = 56)
`;

describe("M6B gap — bằng chứng offline", () => {
  const ev = readFileSync(EV, "utf8");

  it("nêu đúng nguyên nhân là whitelist view, không phải lỗi dữ liệu nguồn", () => {
    expect(ev).toContain("Dữ liệu nguồn KHÔNG lỗi");
  });

  it("ghi nhận mốc đã áp dụng: 1118 → 1172 (+54), không mất dòng, 0 dòng chain 97", () => {
    expect(ev).toMatch(/1118 \|\s*1172 \|\s*54 \|\s*0 \|\s*0/);
  });
});

describe.skipIf(!hasPg)("M6B gap — kiểm tra live", () => {
  it("view whitelist CAMLY và FUN, và KHÔNG whitelist chain 97", () => {
    const viewDef = psql(
      "select pg_get_viewdef('public.v_unified_transactions'::regclass, true)",
    );
    expect(viewDef).toContain("'CAMLY'");
    expect(viewDef).toContain("'FUN'");
    // Nhánh transactions không được nhận chain 97 vào whitelist
    expect(viewDef).not.toMatch(/'FUN'::text AND t\.chain_id = ANY \(ARRAY\[56, 97\]\)/);
    expect(viewDef).not.toMatch(/'FUN'::text AND t\.chain_id = 97/);
  });

  it("không còn dòng transactions production nào bị loại khỏi view, và 0 dòng chain 97 lọt vào", () => {
    const gap = psql(`
      select count(*) from public.transactions t
      left join public.donations d
        on lower(d.tx_hash) = lower(t.tx_hash) and d.chain_id = t.chain_id
      left join public.wallet_transfers w
        on lower(w.tx_hash) = lower(t.tx_hash) and w.chain_id = t.chain_id and w.user_id = t.user_id
      where d.tx_hash is null and w.tx_hash is null
        and t.chain_id <> 97
        and not (${WHITELIST_SQL})
    `);
    expect(Number(gap)).toBe(0);

    const testnetLeak = psql(`
      select count(*) from public.v_unified_transactions
      where source_table = 'transactions' and chain_id = 97
    `);
    expect(Number(testnetLeak)).toBe(0);
  });

  it("không dòng donation spam nào lọt vào nguồn dữ liệu sạch (_primary)", () => {
    // Cột cờ is_spam phải tồn tại ở cả 2 view (additive, không đổi cột cũ)
    const rawFlag = psql(`
      select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'v_unified_transactions'
        and column_name = 'is_spam'
    `);
    expect(Number(rawFlag)).toBe(1);

    // View thô CÓ đánh dấu spam (không lọc — dùng cho audit)
    const rawSpam = psql(
      "select count(*) from public.v_unified_transactions where is_spam is true",
    );
    expect(Number(rawSpam)).toBeGreaterThan(0);

    // _primary (nguồn của RPC get_unified_transactions) phải sạch spam tuyệt đối
    const primSpam = psql(
      "select count(*) from public.v_unified_transactions_primary where is_spam is true",
    );
    expect(Number(primSpam)).toBe(0);

    // Kiểm tra chéo qua bảng gốc `donations`, không phụ thuộc cột cờ
    const primSpamJoin = psql(`
      select count(*) from public.v_unified_transactions_primary p
      join public.donations d on d.id::text = p.source_id
      where p.source_table = 'donations' and d.filter_status = 'filtered_spam'
    `);
    expect(Number(primSpamJoin)).toBe(0);
  }, 60_000);
});


/**
 * M6B #4 guard — is_external ở nhánh `transactions` phải được TÍNH THẬT theo
 * universe ví nội bộ (v_internal_addresses), lấy tập chuẩn là
 * v_unified_transactions_primary (550 dòng), KHÔNG dùng tập thô.
 */
describe("M6B #4 is_external — bằng chứng offline", () => {
  const sets = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "docs/audit/bsc-m6b-20260827/evidence/is-external-primary-sets.json",
      ),
      "utf8",
    ),
  ) as {
    scope: string;
    total: number;
    flip_true: number;
    keep_false_ids: string[];
    undetermined_ids: string[];
  };

  it("chốt tập chuẩn là _primary: 550 = 483 true + 55 keep_false + 12 undetermined", () => {
    expect(sets.scope).toContain("v_unified_transactions_primary");
    expect(sets.total).toBe(550);
    expect(sets.flip_true).toBe(483);
    expect(sets.keep_false_ids).toHaveLength(55);
    expect(sets.undetermined_ids).toHaveLength(12);
    expect(
      sets.keep_false_ids.filter((id) => sets.undetermined_ids.includes(id)),
    ).toEqual([]);
  });
});

describe.skipIf(!hasPg)("M6B #4 is_external — kiểm tra live", () => {
  const sets = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        "docs/audit/bsc-m6b-20260827/evidence/is-external-primary-sets.json",
      ),
      "utf8",
    ),
  ) as { keep_false_ids: string[]; undetermined_ids: string[] };

  it("view không còn hardcode false ở nhánh transactions và có join universe nội bộ", () => {
    const def = psql(
      "select pg_get_viewdef('public.v_unified_transactions'::regclass, true)",
    );
    expect(def).toContain("v_internal_addresses fi");
    expect(def).toContain("v_internal_addresses ti");
    expect(def).toContain("external_undetermined");
  });

  it("đúng 483 dòng is_external=true, 67 dòng false (55 keep_false + 12 undetermined)", () => {
    const row = psql(`
      select count(*) filter (where is_external)
             || '|' || count(*) filter (where not is_external)
             || '|' || count(*)
      from public.v_unified_transactions_primary
      where source_table = 'transactions'
    `);
    expect(row).toBe("483|67|550");
  }, 60_000);

  it("55 dòng keep_false đúng SET ID của tập _primary (không phải tập thô)", () => {
    const list = sets.keep_false_ids.map((i) => `'${i}'`).join(",");
    const wrong = psql(`
      select count(*) from public.v_unified_transactions_primary
      where source_table = 'transactions' and id in (${list}) and is_external is true
    `);
    expect(Number(wrong)).toBe(0);

    const found = psql(`
      select count(*) from public.v_unified_transactions_primary
      where source_table = 'transactions' and id in (${list})
    `);
    expect(Number(found)).toBe(55);
  }, 60_000);

  it("12 dòng undetermined giữ false VÀ được đánh dấu rõ trong metadata", () => {
    const list = sets.undetermined_ids.map((i) => `'${i}'`).join(",");
    const row = psql(`
      select count(*) || '|' || count(*) filter (where not is_external)
             || '|' || count(*) filter (where (metadata->>'external_undetermined') = 'true')
      from public.v_unified_transactions_primary
      where source_table = 'transactions' and id in (${list})
    `);
    expect(row).toBe("12|12|12");

    const leaked = psql(`
      select count(*) from public.v_unified_transactions_primary
      where source_table = 'transactions'
        and (metadata->>'external_undetermined') = 'true'
        and id not in (${list})
    `);
    expect(Number(leaked)).toBe(0);
  }, 60_000);
});
