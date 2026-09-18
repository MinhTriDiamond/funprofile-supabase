// btc-parser-v2 · classifier
// ⭐ PURE FUNCTION. KHÔNG DB, KHÔNG flag, KHÔNG side effect.
// Chỉ phân loại money flow từ RawTx + OwnershipMap. Human intent thuộc semantic layer G5.

import type {
  RawTx,
  OwnershipMap,
  SemanticResult,
  FlowRow,
  ReviewItem,
  Classification,
  ParserMetrics,
} from './types.ts';
import { CLASSIFIER_VERSION, REVIEW_QUEUE_UUID_NAMESPACE } from './types.ts';
import { uuidv5 } from './uuidv5.ts';
import { btcNormalizeAddress } from '../_shared/btcAddress.ts';

/** Chuẩn hoá địa chỉ BTC (bech32 lowercase, legacy giữ case). */
function lc(s?: string | null): string {
  return btcNormalizeAddress(s);
}

function classifyRow(
  category: Classification['category'],
  subtype: Classification['subtype'],
): Classification {
  return { category, subtype, flow_type: `${category}:${subtype}` };
}

function reviewId(tx_hash: string, vout: number | null, reason: string): string {
  return uuidv5(`${tx_hash}:${vout ?? '*'}:${reason}`, REVIEW_QUEUE_UUID_NAMESPACE);
}

export function classify(rawTx: RawTx, ownership: OwnershipMap): SemanticResult {
  const tx_hash = rawTx.txid;
  const block_height = rawTx.status?.block_height ?? null;
  const block_time = rawTx.status?.block_time
    ? new Date(rawTx.status.block_time * 1000).toISOString()
    : null;

  const warnings: string[] = [];
  const flows: FlowRow[] = [];
  const reviewItems: ReviewItem[] = [];

  const metrics: ParserMetrics = {
    total_inputs: rawTx.vin.length,
    total_outputs: rawTx.vout.length,
    resolved_inputs: 0,
    resolved_outputs: 0,
    unknown_addresses: 0,
    change_outputs: 0,
    donation_outputs: 0,
    transfer_outputs: 0,
    review_outputs: 0,
    coinjoin: false,
  };

  // 1. Input side analysis (owners only — do NOT learn addresses from inputs)
  const inputAddresses = new Set<string>();
  const inputOwners = new Set<string>();
  let inputHasFather = false;
  let inputHasTreasury = false;

  for (const vin of rawTx.vin) {
    const addr = lc(vin.prevout?.scriptpubkey_address);
    if (!addr) continue;
    inputAddresses.add(addr);
    const own = ownership.get(addr);
    if (own && own.user_id) {
      inputOwners.add(own.user_id);
      metrics.resolved_inputs++;
      if (own.is_father) inputHasFather = true;
      if (own.is_treasury) inputHasTreasury = true;
    }
  }

  const senderUser = inputOwners.size === 1 ? [...inputOwners][0] : null;
  const isCoinjoin = inputOwners.size > 1;
  metrics.coinjoin = isCoinjoin;

  // 2. Coinjoin holdout: NO donation, NO transfer. Only holdout rows + review.
  if (isCoinjoin) {
    for (let i = 0; i < rawTx.vout.length; i++) {
      const vout = rawTx.vout[i];
      const addr = lc(vout.scriptpubkey_address);
      if (!addr) continue;
      const own = ownership.get(addr);
      const recipientUser = own?.user_id ?? null;
      if (own && own.user_id) metrics.resolved_outputs++;
      else metrics.unknown_addresses++;

      flows.push({
        chain_family: 'bitcoin',
        tx_hash,
        vout_index: i,
        block_height,
        block_time,
        classification: classifyRow('coinjoin_holdout', 'multi_owner'),
        sender_user: null,
        recipient_user: recipientUser,
        sender_address: null,
        recipient_address: addr,
        amount_sat: vout.value,
        is_self_transfer: false,
        is_change: false,
        is_treasury: inputHasTreasury,
        is_coinjoin: true,
        tags: ['coinjoin_flag'],
      });
    }
    metrics.review_outputs++;
    reviewItems.push({
      id: reviewId(tx_hash, null, 'coinjoin_multi_owner'),
      tx_hash,
      vout_index: null,
      reason: 'coinjoin_multi_owner',
      severity: 'high',
      evidence: {
        input_owners: [...inputOwners],
        input_addresses: [...inputAddresses],
        vout_count: rawTx.vout.length,
        block_height,
      },
    });

    return finalize(tx_hash, flows, reviewItems, warnings, metrics, {
      inputOwners,
      inputAddresses,
      rawTx,
    });
  }

  // 3. Per-vout classification (non-coinjoin path)
  for (let i = 0; i < rawTx.vout.length; i++) {
    const vout = rawTx.vout[i];
    const addr = lc(vout.scriptpubkey_address);
    if (!addr) {
      warnings.push(`vout[${i}] has no address (OP_RETURN?)`);
      continue;
    }

    const own = ownership.get(addr);
    const recipientUser = own?.user_id ?? null;
    const recipientIntegrity = own?.integrity ?? 'unknown';

    if (recipientUser) metrics.resolved_outputs++;
    else metrics.unknown_addresses++;

    const isChange = inputAddresses.has(addr); // return-to-sender pattern
    const isSelf = senderUser !== null && recipientUser === senderUser;
    const isTreasury = inputHasTreasury || !!own?.is_treasury;

    let cls: Classification;
    const tags: string[] = [];

    if (isChange) {
      cls = classifyRow('change', 'return_to_sender');
      metrics.change_outputs++;
      tags.push('change');
    } else if (isSelf) {
      cls = classifyRow('transfer', 'self');
      metrics.transfer_outputs++;
      tags.push('self_transfer');
    } else if (senderUser && recipientUser && senderUser !== recipientUser) {
      cls = classifyRow('donation', 'internal');
      metrics.donation_outputs++;
    } else if (senderUser && !recipientUser) {
      cls = classifyRow('transfer', 'external_out');
      metrics.transfer_outputs++;
      tags.push('external_wallet');
    } else if (!senderUser && recipientUser) {
      cls = classifyRow('donation', 'external_in');
      metrics.donation_outputs++;
      tags.push('external_wallet');
    } else {
      cls = classifyRow('unknown', 'unknown');
      tags.push('ambiguous_ownership');
    }

    if (isTreasury) {
      // Do NOT rewrite category — treasury is a MFO overlay, not intent.
      tags.push('treasury_flow');
    }

    if (recipientIntegrity === 'needs_review') {
      tags.push('recipient_needs_review');
      metrics.review_outputs++;
      reviewItems.push({
        id: reviewId(tx_hash, i, 'ambiguous_ownership'),
        tx_hash,
        vout_index: i,
        reason: 'ambiguous_ownership',
        severity: 'medium',
        evidence: {
          address: addr,
          integrity_status: recipientIntegrity,
          amount_sat: vout.value,
        },
      });
    }

    if (isTreasury && cls.category === 'unknown') {
      metrics.review_outputs++;
      reviewItems.push({
        id: reviewId(tx_hash, i, 'treasury_flow_unclassified'),
        tx_hash,
        vout_index: i,
        reason: 'treasury_flow_unclassified',
        severity: 'medium',
        evidence: { address: addr, amount_sat: vout.value, input_has_treasury: inputHasTreasury },
      });
    }

    flows.push({
      chain_family: 'bitcoin',
      tx_hash,
      vout_index: i,
      block_height,
      block_time,
      classification: cls,
      sender_user: senderUser,
      recipient_user: recipientUser,
      sender_address: senderUser
        ? [...inputAddresses].find((a) => ownership.get(a)?.user_id === senderUser) ?? null
        : null,
      recipient_address: addr,
      amount_sat: vout.value,
      is_self_transfer: isSelf,
      is_change: isChange,
      is_treasury: isTreasury,
      is_coinjoin: false,
      tags,
    });
  }

  // 4. Father guard — never auto-learn Father aux; if father is sender and there is any
  // unknown recipient that looks like change (address type match), flag for manual review.
  if (inputHasFather) {
    for (const flow of flows) {
      if (flow.classification.category === 'change' && !flow.recipient_user) {
        metrics.review_outputs++;
        reviewItems.push({
          id: reviewId(tx_hash, flow.vout_index, 'father_aux_manual'),
          tx_hash,
          vout_index: flow.vout_index,
          reason: 'father_aux_manual',
          severity: 'high',
          evidence: {
            address: flow.recipient_address,
            amount_sat: flow.amount_sat,
            note: 'Father input detected; change output not resolved. Manual review only.',
          },
        });
        flow.tags.push('father_manual_review');
      }
    }
  }

  return finalize(tx_hash, flows, reviewItems, warnings, metrics, {
    inputOwners,
    inputAddresses,
    rawTx,
  });
}

function finalize(
  tx_hash: string,
  flows: FlowRow[],
  reviewItems: ReviewItem[],
  warnings: string[],
  metrics: ParserMetrics,
  ctx: {
    inputOwners: Set<string>;
    inputAddresses: Set<string>;
    rawTx: RawTx;
  },
): SemanticResult {
  const outputAddresses = new Set<string>();
  for (const v of ctx.rawTx.vout) {
    const a = lc(v.scriptpubkey_address);
    if (a) outputAddresses.add(a);
  }

  return {
    tx_hash,
    flows,
    reviewItems,
    warnings,
    metrics,
    stats: {
      input_owners_distinct: ctx.inputOwners.size,
      input_addresses_distinct: ctx.inputAddresses.size,
      output_addresses_distinct: outputAddresses.size,
    },
  };
}

export { CLASSIFIER_VERSION };
