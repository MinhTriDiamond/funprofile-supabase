interface Vault {
  vault_key: string;
  vault_name: string;
  balance: number;
}

export function TreasuryVaultsList({ vaults }: { vaults: Vault[] }) {
  if (!vaults || vaults.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-muted-foreground">Kho Treasury</div>
      <div className="space-y-1.5">
        {vaults.map((v) => (
          <div key={v.vault_key} className="flex items-center justify-between p-2 rounded-md border bg-card text-sm">
            <span className="font-medium">{v.vault_name}</span>
            <span className="font-mono text-primary">
              {Math.floor(Number(v.balance)).toLocaleString('vi-VN')} FUN
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
