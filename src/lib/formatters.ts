/**
 * Centralized formatting utilities
 * Ensures consistent number and date formatting across the app
 */

/**
 * Format number with Vietnamese locale (dot as thousands separator)
 */
export const formatNumber = (num: number, decimals: number = 0): string => {
  if (decimals === 0) {
    return num.toLocaleString('vi-VN');
  }
  
  const fixed = num.toFixed(decimals);
  const [integerPart, decimalPart] = fixed.split('.');
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  
  if (decimals > 0 && decimalPart) {
    return `${formattedInteger},${decimalPart}`;
  }
  return formattedInteger;
};

/**
 * Format USD value (always 2 decimals, with $ prefix)
 */
export const formatUsd = (num: number): string => {
  return `$${formatNumber(num, 2)}`;
};

/**
 * Format token balance with smart decimal handling
 */
export const formatTokenBalance = (num: number): string => {
  if (num > 0 && num < 0.000001) {
    return formatNumber(num, 8);
  }
  if (num > 0 && num < 0.01) {
    return formatNumber(num, 6);
  }
  if (Number.isInteger(num) || Math.abs(num - Math.round(num)) < 0.0001) {
    return formatNumber(Math.round(num), 0);
  }
  return formatNumber(num, 4);
};

/**
 * Format date with Vietnamese locale
 */
export const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleString('vi-VN');
};

/**
 * Format relative time (e.g., "5 phút trước")
 * Used for comments, posts, notifications display
 */
export const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút`;
  if (hours < 24) return `${hours} giờ`;
  if (days < 7) return `${days} ngày`;
  return date.toLocaleDateString('vi-VN');
};

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 * Used for video upload progress, media durations
 */
export const formatDurationTime = (seconds: number): string => {
  if (!isFinite(seconds) || seconds <= 0) return '--:--';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Shorten wallet address for display
 */
export const shortenAddress = (address: string, chars: number = 4): string => {
  if (!address) return '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
};
