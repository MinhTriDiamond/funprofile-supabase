# FUN Money Contract v1.2.1

## Địa chỉ (BSC Mainnet, chainId 56)

| Loại | Địa chỉ |
|---|---|
| **FUN Money v1.2.1** | `0x39A1b047D5d143f8874888cfa1d30Fb2AE6F0CD6` |
| Decimals | `18` |
| Symbol | `FUN` |

LoveHUB **dùng chung** contract này với FUN Profile — không deploy lại.

## 6 On-chain Action Types (đã register 21/04/2026)

| Action | Base rate | Ý nghĩa |
|---|---|---|
| `INNER_WORK` | 100 FUN | Chấm cho nội tâm, sám hối, chuyển hóa |
| `CHANNELING` | 80 FUN | Truyền tải, dẫn dắt cộng đồng |
| `GIVING` | 60 FUN | Cho đi, trao tặng |
| `HELPING` | 50 FUN | Giúp đỡ cụ thể |
| `GRATITUDE` | 40 FUN | Biết ơn, chia sẻ tri ân |
| `SERVICE` | 30 FUN | Phụng sự dài hạn |

**Trần EPOCH_CAP:** 950 000 FUN / action / UTC day (throttle bởi `pplp-auto-submit`).

**Fallback action** khi mint không map được: `INNER_WORK`.

## Multisig Attester

Contract yêu cầu **2/3 chữ ký EIP-712** từ 3 attester đã whitelist. LoveHUB
share **cùng 3 attester với FUN Profile** — chỉ cần cấu hình public
addresses trong secret `PPLP_ATTESTER_PUBLIC_ADDRESSES`. Private key **KHÔNG**
lưu bên LoveHUB; edge function `pplp-attester-sign` sẽ gọi HTTPS về webhook
của FUN Profile (`FUN_PROFILE_ATTESTER_URL`) để lấy chữ ký.
