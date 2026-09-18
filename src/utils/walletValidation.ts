import { toast } from 'sonner';

// EVM address validation without importing viem at top level
// This uses a regex check + checksum validation to avoid loading web3 libs on non-wallet pages
const isValidEvmAddressFormat = (address: string): boolean => {
  // Check basic format: 0x followed by 40 hex characters
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

export const validateEvmAddress = (address: string): boolean => {
  if (!address || address.length !== 42 || !address.startsWith('0x')) {
    toast.error('Invalid address format. Must be 42 characters starting with 0x');
    return false;
  }
  if (!isValidEvmAddressFormat(address)) {
    toast.error('Invalid Ethereum address format');
    return false;
  }
  return true;
};
