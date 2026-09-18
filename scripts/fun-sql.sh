#!/usr/bin/env bash
# fun-sql.sh — Wrapper gọi edge function admin-sql từ terminal.
#
# Cách dùng:
#   export FUN_JWT="eyJhbGciOi..."   # access_token admin lấy từ trình duyệt
#   ./scripts/fun-sql.sh "select count(*) from profiles"
#   ./scripts/fun-sql.sh --write "update profiles set bio = 'x' where id = '...'"
#
# Lấy JWT:
#   1. Đăng nhập funprofile.lovable.app bằng tài khoản admin.
#   2. DevTools -> Application -> Local Storage -> key sb-bhtsnervqiwchluwuxki-auth-token
#   3. Copy field "access_token" trong JSON đó vào FUN_JWT.
#
# JWT hết hạn ~1h, cần lấy lại.

set -euo pipefail

SUPABASE_URL="https://bhtsnervqiwchluwuxki.supabase.co"
ANON_KEY="sb_publishable_2O67-byTv7js8tDjj7HGxg_hiFQ3WkI"

if [[ -z "${FUN_JWT:-}" ]]; then
  echo "❌ Thiếu biến môi trường FUN_JWT." >&2
  echo "   Chạy: export FUN_JWT=\"<access_token>\"" >&2
  exit 1
fi

MODE="read"
EXTRA_HEADER=()

if [[ "${1:-}" == "--write" ]]; then
  MODE="write"
  EXTRA_HEADER=(-H "x-admin-confirm: yes")
  shift
fi

if [[ $# -lt 1 ]]; then
  echo "Cách dùng: $0 [--write] \"<SQL>\"" >&2
  exit 1
fi

SQL="$*"

# Tạo JSON payload an toàn bằng python (có sẵn ở mọi máy)
PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'sql': sys.argv[1], 'mode': sys.argv[2]}))" "$SQL" "$MODE")

curl -sS -X POST \
  "$SUPABASE_URL/functions/v1/admin-sql" \
  -H "Authorization: Bearer $FUN_JWT" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  "${EXTRA_HEADER[@]}" \
  -d "$PAYLOAD" | python3 -m json.tool
