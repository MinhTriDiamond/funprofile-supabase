import { useTokenPrices } from './useTokenPrices';

interface CamlyPriceResult {
  /** null = chưa có giá thị trường thật (không bao giờ trả giá bịa) */
  price: number | null;
  change24h: number | null;
  isLoading: boolean;
  priceUnavailable: boolean;
}

export const useCamlyPrice = (): CamlyPriceResult => {
  const { data: prices, isLoading } = useTokenPrices();
  const camly = prices?.CAMLY;
  const price = typeof camly?.usd === 'number' ? camly.usd : null;

  return {
    price,
    change24h: typeof camly?.usd_24h_change === 'number' ? camly.usd_24h_change : null,
    isLoading,
    priceUnavailable: price === null && !isLoading,
  };
};
