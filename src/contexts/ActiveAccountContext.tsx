import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { toast } from 'sonner';

// ============================================================
// ActiveAccountContext
// Quản lý multi-account state trong cùng 1 ví EVM.
// Lấy danh sách accounts qua EIP-1193 provider (eth_accounts),
// lưu activeAddress bền vững vào localStorage.
// ============================================================

interface ActiveAccountContextValue {
  /** Danh sách địa chỉ được ủy quyền từ provider */
  accounts: string[];
  /** Địa chỉ đang được chọn làm "tài khoản đang dùng" */
  activeAddress: string | null;
  /** Timestamp lần cuối sử dụng mỗi address */
  lastUsedAt: Record<string, number>;
  /** Chọn 1 address làm active */
  setActiveAddress: (address: string) => void;
  /** Gọi lại eth_accounts để làm mới danh sách */
  refreshAccounts: () => Promise<void>;
  /** Đang loading danh sách accounts */
  isLoadingAccounts: boolean;
}

const ActiveAccountContext = createContext<ActiveAccountContextValue>({
  accounts: [],
  activeAddress: null,
  lastUsedAt: {},
  setActiveAddress: () => {},
  refreshAccounts: async () => {},
  isLoadingAccounts: false,
});

// ---- Helper: tạo localStorage key theo connectorId ----
const storageKey = (connectorId: string) => `activeAccount:${connectorId}`;
const lastUsedKey = (connectorId: string) => `lastUsedAt:${connectorId}`;

// ---- Helper: đọc/ghi localStorage an toàn ----
function readLS(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLS(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* noop */ }
}
function removeLS(key: string) {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
}

export const ActiveAccountProvider = ({ children }: { children: React.ReactNode }) => {
  const { address: providerAddress, isConnected, connector } = useAccount();

  const [accounts, setAccounts] = useState<string[]>([]);
  const [activeAddress, setActiveAddressState] = useState<string | null>(null);
  const [lastUsedAt, setLastUsedAt] = useState<Record<string, number>>({});
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

  // Ref để tránh race condition khi fetch accounts
  const connectorIdRef = useRef<string | undefined>(undefined);

  // ---- Lấy danh sách accounts từ EIP-1193 provider ----
  const fetchAccounts = useCallback(async () => {
    if (!connector || !isConnected) return;

    const cId = connector.id || connector.name;
    connectorIdRef.current = cId;
    setIsLoadingAccounts(true);

    try {
      /* wagmi v2 — getProvider() is not exposed in typed connector interface */
      const provider = await (connector as unknown as { getProvider?: () => Promise<{ request: (args: unknown) => Promise<unknown>; on?: (...args: unknown[]) => void }> }).getProvider?.();
      if (!provider?.request) {
        // Fallback: chỉ dùng providerAddress
        if (providerAddress) {
          setAccounts([providerAddress.toLowerCase()]);
          const saved = readLS(storageKey(cId));
          setActiveAddressState(saved?.toLowerCase() === providerAddress.toLowerCase() ? saved : providerAddress);
        }
        return;
      }

      const rawAccounts = (await provider.request({ method: 'eth_accounts' })) as string[];
      const normalized = rawAccounts.map((a: string) => a.toLowerCase());

      if (normalized.length === 0 && providerAddress) {
        // Một số ví chỉ trả về 1 account qua wagmi
        setAccounts([providerAddress.toLowerCase()]);
        setActiveAddressState(providerAddress);
        return;
      }

      setAccounts(normalized);

      // Khôi phục activeAddress từ localStorage hoặc fallback accounts[0]
      const saved = readLS(storageKey(cId))?.toLowerCase();
      if (saved && normalized.includes(saved)) {
        setActiveAddressState(saved);
      } else {
        setActiveAddressState(normalized[0] || null);
      }

      // Khôi phục lastUsedAt
      const savedLastUsed = readJSON<Record<string, number>>(lastUsedKey(cId), {});
      setLastUsedAt(savedLastUsed);

    } catch (err) {
      console.warn('[ActiveAccount] Không thể lấy danh sách accounts:', err);
      // Fallback graceful
      if (providerAddress) {
        setAccounts([providerAddress.toLowerCase()]);
        setActiveAddressState(providerAddress);
      }
    } finally {
      setIsLoadingAccounts(false);
    }
  }, [connector, isConnected, providerAddress]);

  // ---- Khi ví kết nối lần đầu hoặc connector thay đổi -> fetch accounts ----
  useEffect(() => {
    if (isConnected && connector) {
      fetchAccounts();
    }
  }, [isConnected, connector, fetchAccounts]);

  // ---- Lắng nghe accountsChanged từ EIP-1193 provider ----
  useEffect(() => {
    if (!connector || !isConnected) return;

    let provider: any = null;
    let cleanup: (() => void) | null = null;

    const setup = async () => {
      try {
        /* wagmi v2 — getProvider() is not exposed in typed connector interface */
        provider = await (connector as unknown as { getProvider?: () => Promise<{ on?: (event: string, handler: (accounts: string[]) => void) => void }> }).getProvider?.();
        if (!provider?.on) return;

        const handler = (rawAccounts: string[]) => {
          const normalized = rawAccounts.map((a: string) => a.toLowerCase());
          setAccounts(normalized);

          setActiveAddressState(prev => {
            if (!prev || !normalized.includes(prev.toLowerCase())) {
              const fallback = normalized[0] || null;
              if (prev && fallback) {
                toast.info('Tài khoản đã thay đổi trong ví. Đã chuyển sang tài khoản mới.');
              }
              return fallback;
            }
            return prev;
          });
        };

        provider.on('accountsChanged', handler);
        cleanup = () => provider?.removeListener?.('accountsChanged', handler);
      } catch { /* noop */ }
    };

    setup();
    return () => { cleanup?.(); };
  }, [connector, isConnected]);

  // ---- Khi disconnect -> clear state ----
  useEffect(() => {
    if (!isConnected) {
      setAccounts([]);
      setActiveAddressState(null);
      setLastUsedAt({});
      connectorIdRef.current = undefined;
    }
  }, [isConnected]);

  // ---- setActiveAddress public ----
  const setActiveAddress = useCallback((address: string) => {
    const lower = address.toLowerCase();
    setActiveAddressState(lower);

    // Cập nhật lastUsedAt
    setLastUsedAt(prev => {
      const updated = { ...prev, [lower]: Date.now() };
      const cId = connectorIdRef.current;
      if (cId) {
        writeLS(lastUsedKey(cId), JSON.stringify(updated));
      }
      return updated;
    });

    // Lưu vào localStorage
    const cId = connectorIdRef.current;
    if (cId) {
      writeLS(storageKey(cId), lower);
    }
  }, []);

  // ---- refreshAccounts public ----
  const refreshAccounts = useCallback(async () => {
    await fetchAccounts();
    toast.success('Đã làm mới danh sách tài khoản');
  }, [fetchAccounts]);

  return (
    <ActiveAccountContext.Provider
      value={{
        accounts,
        activeAddress,
        lastUsedAt,
        setActiveAddress,
        refreshAccounts,
        isLoadingAccounts,
      }}
    >
      {children}
    </ActiveAccountContext.Provider>
  );
};

/**
 * Hook để truy cập multi-account state.
 * Nếu context chưa sẵn sàng, trả về giá trị mặc định an toàn.
 */
export const useActiveAccount = () => useContext(ActiveAccountContext);
