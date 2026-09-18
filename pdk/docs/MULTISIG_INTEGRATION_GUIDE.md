# 🔐 Hướng dẫn Tích hợp Multisig 3-of-3 (WILL + WISDOM + LOVE)

> **Phiên bản**: 1.0.0  
> **Ngày cập nhật**: 2026-03-02  
> **Áp dụng cho**: FUN Play, ANGEL AI, và các platform trong hệ sinh thái FUN

---

## 📋 Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Smart Contract](#2-smart-contract)
3. [Luồng hoạt động End-to-End](#3-luồng-hoạt-động-end-to-end)
4. [Cấu trúc file PDK](#4-cấu-trúc-file-pdk)
5. [Database Schema](#5-database-schema)
6. [EIP-712 PureLoveProof](#6-eip-712-pureloveproof)
7. [GOV Groups](#7-gov-groups)
8. [Frontend Hooks](#8-frontend-hooks)
9. [Edge Function](#9-edge-function)
10. [Bảo mật](#10-bảo-mật)
11. [Checklist triển khai](#11-checklist-triển-khai)

---

## 1. Tổng quan kiến trúc

Hệ thống **PPLP (Proof of Pure Love Protocol)** sử dụng cơ chế **Multisig 3-of-3** với 3 nhóm đại diện cộng đồng:

| Nhóm       | Tên tiếng Việt | Emoji | Vai trò             |
| ---------- | -------------- | ----- | ------------------- |
| **WILL**   | Ý Chí          | 💪    | Kỹ thuật & Ý chí    |
| **WISDOM** | Trí Tuệ        | 🌟    | Tầm nhìn chiến lược |
| **LOVE**   | Yêu Thương     | ❤️    | Nhân ái & Chữa lành |

**Quy tắc**: Mỗi yêu cầu mint FUN Money cần **1 chữ ký từ mỗi nhóm** (tổng 3 chữ ký).

### Sơ đồ kiến trúc

```
┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│   User App   │────▶│  Edge Function   │────▶│  pplp_mint_requests│
│  (Frontend)  │     │  pplp-mint-fun   │     │   (Database)       │
└──────────────┘     └──────────────────┘     └────────┬──────────┘
                                                        │
                     ┌──────────────────┐               │ Realtime
                     │  Attester Panel  │◀──────────────┘
                     │  (GOV Members)   │
                     └────────┬─────────┘
                              │ EIP-712 Sign (x3)
                     ┌────────▼─────────┐
                     │  Admin Submit    │
                     │  (On-chain TX)   │
                     └────────┬─────────┘
                              │ lockWithPPLP()
                     ┌────────▼─────────┐
                     │  FUN Money       │
                     │  Smart Contract  │
                     │  BSC Testnet     │
                     └──────────────────┘
```

---

## 2. Smart Contract

| Thuộc tính       | Giá trị                                      |
| ---------------- | -------------------------------------------- |
| **Tên contract** | FUNMoneyProductionV1_2_1                     |
| **Địa chỉ**      | `0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6` |
| **Chain**        | BSC Testnet (Chain ID: 97)                   |
| **Token**        | FUN Money (FUN), 18 decimals                 |

### Contract ABI (các hàm cần dùng)

```typescript
// lockWithPPLP - Hàm chính để mint/lock FUN
lockWithPPLP(
  user: address,        // Địa chỉ người nhận
  action: string,       // Tên action (STRING, không phải bytes32!)
  amount: uint256,      // Số lượng FUN (wei)
  evidenceHash: bytes32,// Hash bằng chứng
  sigs: bytes[]         // Mảng 3 chữ ký [WILL, WISDOM, LOVE]
)

// nonces - Lấy nonce hiện tại
nonces(account: address) → uint256

// isAttester - Kiểm tra có phải attester
isAttester(attester: address) → bool

// alloc - Xem số dư locked/activated
alloc(user: address) → (locked: uint256, activated: uint256)

// actions - Kiểm tra action đã đăng ký chưa
actions(actionHash: bytes32) → (allowed: bool, version: uint32, deprecated: bool)
```

---

## 3. Luồng hoạt động End-to-End

```
Bước 1: USER tạo yêu cầu mint
   │  POST /pplp-mint-fun { action_ids, recipient_address }
   │  → Tạo row trong pplp_mint_requests (status: pending_sig)
   ▼
Bước 2: GOV ATTESTER ký (tuần tự, mỗi nhóm 1 người)
   │  2a. WILL member ký EIP-712 → status: signing
   │  2b. WISDOM member ký EIP-712 → status: signing
   │  2c. LOVE member ký EIP-712 → status: signed (đủ 3/3)
   ▼
Bước 3: ADMIN verify nonce on-chain
   │  Đọc nonces(user) từ contract
   │  So sánh với nonce trong DB
   │  Nếu không khớp → reject, yêu cầu tạo lại
   ▼
Bước 4: ADMIN submit on-chain
   │  Gọi lockWithPPLP(user, action, amount, evidenceHash, [sig1, sig2, sig3])
   │  → status: submitted
   ▼
Bước 5: Chờ TX confirmed
   │  waitForTransactionReceipt (2 confirmations)
   │  → status: confirmed (thành công) hoặc failed (revert)
```

### ⚠️ Lưu ý quan trọng

- **Ký tuần tự**: Mỗi thông điệp EIP-712 có `nonce` riêng. **KHÔNG** ký song song nhiều request vì sẽ gây lỗi "Nonce already used".
- **Thứ tự chữ ký**: Khi submit on-chain, mảng `sigs` phải theo thứ tự **[WILL, WISDOM, LOVE]**.
- **Nonce verification**: Luôn kiểm tra nonce on-chain trước khi submit để tránh lỗi `SIGS_LOW`.

---

## 4. Cấu trúc file PDK

```
pdk/
├── docs/
│   └── MULTISIG_INTEGRATION_GUIDE.md  ← Bạn đang đọc file này
├── core/
│   └── multisig/
│       ├── pplp-config.ts       # Config chính: contract, GOV groups, helpers
│       ├── pplp-eip712.ts       # EIP-712 cho Edge Functions (Deno)
│       ├── pplp-crypto.ts       # SHA-256, evidence hashing
│       ├── pplp-types.ts        # Types, constants, interfaces
│       ├── database/
│       │   └── migration.sql    # SQL tạo bảng pplp_mint_requests
│       ├── edge-functions/
│       │   └── pplp-mint-fun.ts # Template Edge Function
│       └── hooks/
│           ├── useAttesterSigning.ts  # Hook cho Attester ký
│           └── useMintSubmit.ts       # Hook cho Admin submit
```

---

## 5. Database Schema

### Bảng `pplp_mint_requests`

| Cột                             | Kiểu       | Mô tả                                                            |
| ------------------------------- | ---------- | ---------------------------------------------------------------- |
| `id`                            | UUID       | Primary key                                                      |
| `user_id`                       | UUID       | ID người dùng tạo request                                        |
| `recipient_address`             | TEXT       | Địa chỉ ví nhận FUN                                              |
| `action_ids`                    | UUID[]     | Danh sách light action IDs                                       |
| `action_type`                   | TEXT       | Loại action (POST_CREATE, etc.)                                  |
| `amount`                        | NUMERIC    | Số FUN (human readable)                                          |
| `amount_wei`                    | TEXT       | Số FUN dạng Wei (18 decimals)                                    |
| `action_hash`                   | TEXT       | Keccak256 hash của action type                                   |
| `evidence_hash`                 | TEXT       | SHA-256 hash của evidence                                        |
| `nonce`                         | TEXT       | Nonce on-chain tại thời điểm tạo                                 |
| **`multisig_signatures`**       | **JSONB**  | `{ will: {...}, wisdom: {...}, love: {...} }`                    |
| **`multisig_completed_groups`** | **TEXT[]** | `['will', 'wisdom']`                                             |
| **`multisig_required_groups`**  | **TEXT[]** | `['will', 'wisdom', 'love']`                                     |
| `status`                        | TEXT       | `pending_sig` → `signing` → `signed` → `submitted` → `confirmed` |
| `tx_hash`                       | TEXT       | Transaction hash on-chain                                        |
| `platform_id`                   | TEXT       | `fun_profile`, `fun_play`, `angel_ai`                            |

### Cấu trúc `multisig_signatures` (JSONB)

```json
{
  "will": {
    "signer": "0xe32d50a0badE4cbD5B0d6120d3A5FD07f63694f1",
    "signature": "0xabc123...",
    "signed_at": "2026-03-02T10:30:00Z",
    "signer_name": "Minh Trí"
  },
  "wisdom": {
    "signer": "0xCa319fBc39F519822385F2D0a0114B14fa89A301",
    "signature": "0xdef456...",
    "signed_at": "2026-03-02T10:31:00Z",
    "signer_name": "Bé Giàu"
  },
  "love": {
    "signer": "0xE418a560611e80E4239F5513D41e583fC9AC2E6d",
    "signature": "0x789ghi...",
    "signed_at": "2026-03-02T10:32:00Z",
    "signer_name": "Thanh Tiên"
  }
}
```

---

## 6. EIP-712 PureLoveProof

### Domain Separator

```typescript
const EIP712_DOMAIN = {
  name: 'FUN Money',
  version: '1.2.1',
  chainId: 97,
  verifyingContract: '0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6',
};
```

### Struct (PHẢI khớp chính xác với contract)

```
PureLoveProof(
  address user,
  bytes32 actionHash,
  uint256 amount,
  bytes32 evidenceHash,
  uint256 nonce
)
```

### TypeHash trên contract

```solidity
PPLP_TYPEHASH = keccak256(
  "PureLoveProof(address user,bytes32 actionHash,uint256 amount,bytes32 evidenceHash,uint256 nonce)"
);
```

---

## 7. GOV Groups

### WILL (Ý Chí) 💪 - 3 thành viên

| Tên        | Địa chỉ ví                                   |
| ---------- | -------------------------------------------- |
| Minh Trí   | `0xe32d50a0badE4cbD5B0d6120d3A5FD07f63694f1` |
| Ánh Nguyệt | `0xfd0Da7a744245e7aCECCd786d5a743Ef9291a557` |
| Thu Trang  | `0x02D5578173bd0DB25462BB32A254Cd4b2E6D9a0D` |

### WISDOM (Trí Tuệ) 🌟 - 4 thành viên

| Tên     | Địa chỉ ví                                   |
| ------- | -------------------------------------------- |
| Bé Giàu | `0xCa319fBc39F519822385F2D0a0114B14fa89A301` |
| Bé Ngọc | `0xDf8249159BB67804D718bc8186f95B75CE5ECbe8` |
| Ái Vân  | `0x5102Ecc4a458a1af76aFA50d23359a712658a402` |

### LOVE (Yêu Thương) ❤️ - 4 thành viên

| Tên        | Địa chỉ ví                                   |
| ---------- | -------------------------------------------- |
| Thanh Tiên | `0xE418a560611e80E4239F5513D41e583fC9AC2E6d` |
| Bé Kim     | `0x67464Df3082828b3Cf10C5Cb08FC24A28228EFd1` |
| Bé Hà      | `0x9ec8C51175526BEbB1D04100256De71CF99B7CCC` |

> **Lưu ý**: Tất cả 11 địa chỉ phải được đăng ký trên contract qua `govRegisterAttester()` trước khi ký.

---

## 8. Frontend Hooks

### `useAttesterSigning` - Cho GOV Attester

```tsx
import { useAttesterSigning } from './hooks/useAttesterSigning';

function AttesterPanel() {
  const {
    pendingRequests,
    signRequest,
    myGroup,
    myName,
    isAttester,
  } = useAttesterSigning(supabase);

  if (!isAttester) return <p>Bạn không phải Attester</p>;

  return (
    <div>
      <p>Nhóm: {myGroup} | Tên: {myName}</p>
      {pendingRequests.map(req => (
        <button onClick={() => signRequest(req)}>
          Ký {req.amount} FUN
        </button>
      ))}
    </div>
  );
}
```

### `useMintSubmit` - Cho Admin submit on-chain

```tsx
import { useMintSubmit } from './hooks/useMintSubmit';

function AdminMintPanel() {
  const { submitMint, verifyNonce, isSubmitting } = useMintSubmit(supabase);

  const handleSubmit = async (request) => {
    // Kiểm tra nonce trước
    const valid = await verifyNonce(request.recipient_address, request.nonce);
    if (!valid) {
      alert('Nonce không khớp! Cần tạo lại request.');
      return;
    }
    await submitMint(request);
  };
}
```

---

## 9. Edge Function

File `pplp-mint-fun.ts` là template Edge Function. Cần thay đổi:

1. **`PLATFORM_ID`**: Đổi từ `'fun_profile'` thành `'fun_play'` hoặc `'angel_ai'`
2. **CORS headers**: Cấu hình `Access-Control-Allow-Origin` phù hợp
3. **Supabase client**: Import từ đúng path

### Deploy

```bash
# Copy template vào dự án
cp pdk/core/multisig/edge-functions/pplp-mint-fun.ts \
   supabase/functions/pplp-mint-fun/index.ts

# Deploy
supabase functions deploy pplp-mint-fun
```

---

## 10. Bảo mật

### RLS Policies

| Policy          | Mô tả                                             |
| --------------- | ------------------------------------------------- |
| User SELECT     | User chỉ xem request của chính mình               |
| Attester SELECT | Attester chỉ xem request `signing` hoặc `signed`  |
| Attester UPDATE | Attester chỉ cập nhật chữ ký trên request đang ký |
| User INSERT     | User chỉ tạo request cho chính mình               |

### Anti-Fraud Checks

- ✅ Kiểm tra nonce on-chain trước khi submit
- ✅ Giới hạn 2 request/ngày/user
- ✅ Tối thiểu 200 FUN/request
- ✅ Kiểm tra user không bị cấm (is_banned)
- ✅ Kiểm tra light actions hợp lệ (is_eligible, mint_status = approved)
- ✅ Evidence hash anchoring (SHA-256)
- ✅ Canonical JSON cho dedup

### Nonce Verification

```
1. Tạo request → lưu nonce từ contract vào DB
2. Trước khi submit → đọc lại nonce từ contract
3. Nếu nonce DB ≠ nonce on-chain → CHẶN submit, yêu cầu tạo lại request
```

---

## 11. Checklist triển khai

### Bước 1: Database

- [ ] Chạy `migration.sql` trên Supabase project
- [ ] Kiểm tra RLS policies hoạt động đúng
- [ ] Bật Realtime cho bảng `pplp_mint_requests`
- [ ] Tạo bảng `light_actions` nếu chưa có (xem schema FUN Profile)

### Bước 2: Smart Contract (trên BSC Testnet)

- [ ] Gọi `govRegisterAttester()` cho tất cả 11 địa chỉ GOV
- [ ] Gọi `govRegisterAction()` cho các action types cần dùng
- [ ] Kiểm tra `isAttester()` trả về `true` cho mỗi địa chỉ
- [ ] Kiểm tra `actions()` trả về `allowed = true` cho mỗi action

### Bước 3: Edge Function

- [ ] Copy và chỉnh sửa `pplp-mint-fun.ts`
- [ ] Đổi `PLATFORM_ID` thành platform tương ứng
- [ ] Deploy edge function
- [ ] Test với Postman/curl

### Bước 4: Frontend

- [ ] Cài đặt dependencies: `wagmi`, `viem`, `@rainbow-me/rainbowkit`
- [ ] Bọc app trong `WagmiProvider` + `RainbowKitProvider`
- [ ] Copy hooks vào `src/hooks/`
- [ ] Sửa import path cho `supabase` client
- [ ] Tạo UI cho Attester Panel và Admin Panel
- [ ] Test ký EIP-712 trên BSC Testnet

### Bước 5: Testing

- [ ] Test tạo mint request (Edge Function)
- [ ] Test ký EIP-712 với 3 ví khác nhau (1 WILL + 1 WISDOM + 1 LOVE)
- [ ] Test submit on-chain với đủ 3 chữ ký
- [ ] Test nonce verification (tạo request, ký, nhưng chờ nonce thay đổi)
- [ ] Test RLS: user A không xem được request của user B
- [ ] Test daily cap: tạo > 2 request/ngày → bị từ chối

---

## 📞 Liên hệ hỗ trợ

Nếu cần hỗ trợ triển khai, liên hệ team FUN Profile:

- **Kỹ thuật**: Minh Trí (WILL group)
- **Smart Contract**: Kiểm tra trên [BSC Testnet Explorer](https://testnet.bscscan.com/address/0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6)

---

_Tài liệu này được tạo tự động từ mã nguồn FUN Profile. Vui lòng kiểm tra phiên bản mới nhất trước khi triển khai._
