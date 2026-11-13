/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { CelebrationCardModal } from '../CelebrationCardModal';
import type { UnifiedTransactionRow } from '../types';

const detail = vi.hoisted(() => ({ data: null as unknown }));
vi.mock('@/hooks/useUnifiedTransactionHistory', () => ({ useUnifiedTransactionDetail: () => detail }));
vi.mock('@/i18n/LanguageContext', () => ({ useLanguage: () => ({ t: (key: string) => key, language: 'vi' }) }));
vi.mock('@/components/ui/dialog', () => ({ Dialog: ({ children }: any) => children, DialogContent: ({ children }: any) => <div>{children}</div> }));
vi.mock('@/components/donations/DonationCelebration', () => ({ DonationCelebration: () => null }));
vi.mock('@/components/donations/RichTextOverlay', () => ({ RichTextOverlay: () => null }));
vi.mock('@/lib/celebrationSounds', () => ({ playCelebrationMusic: vi.fn(), stopCelebrationMusic: vi.fn() }));

const senderId = '11111111-1111-4111-8111-111111111111';
const recipientId = '22222222-2222-4222-8222-222222222222';
const seed = {
  source_id: 'receipt', direction: 'out', user_id: senderId, counterparty_user_id: recipientId,
  sender_user_id: senderId, sender_username: 'sender', sender_display_name: 'Sender Name',
  recipient_user_id: recipientId, recipient_username: 'recipient', recipient_display_name: 'Recipient Name',
  amount_decimal: 50, token_symbol: 'USDT', status: 'confirmed', occurred_at: '2026-11-11T10:16:00Z',
} as UnifiedTransactionRow;
function Location() { return <output data-testid="path">{useLocation().pathname}</output>; }
function mount(row: UnifiedTransactionRow | null = seed) {
  const close = vi.fn();
  const bubble = vi.fn();
  render(<MemoryRouter initialEntries={['/history']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><div onClick={bubble}>
    <CelebrationCardModal open onOpenChange={close} seed={row} txHash="0xtest" />
  </div><Location /></MemoryRouter>);
  return { close, bubble };
}
afterEach(() => { cleanup(); detail.data = null; });

describe('gift receipt profile navigation', () => {
  it('opens the recipient profile from a sent history row and closes the card', () => {
    const { close, bubble } = mount();
    const button = screen.getByRole('button', { name: /Recipient Name/ });
    expect(button.hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByText('Recipient Name'));
    expect(screen.getByTestId('path').textContent).toBe(`/profile/${recipientId}`);
    expect(close).toHaveBeenCalledWith(false);
    expect(bubble).not.toHaveBeenCalled();
  });
  it('resolves the recipient from the owner of an incoming row', () => {
    mount({ ...seed, direction: 'in', user_id: recipientId, counterparty_user_id: senderId, recipient_user_id: null });
    fireEvent.click(screen.getByRole('button', { name: /Recipient Name/ }));
    expect(screen.getByTestId('path').textContent).toBe(`/profile/${recipientId}`);
  });
  it('uses the recipient ID returned by detail RPC when opened via transaction link', () => {
    detail.data = { primary: seed, sender: { user_id: senderId, username: 'sender' }, recipient: { user_id: recipientId, username: 'recipient', display_name: 'RPC Recipient' } };
    mount(null);
    fireEvent.click(screen.getByRole('button', { name: /RPC Recipient/ }));
    expect(screen.getByTestId('path').textContent).toBe(`/profile/${recipientId}`);
  });
  it('does not offer navigation for an external recipient without a profile', () => {
    mount({ ...seed, recipient_user_id: null, counterparty_user_id: null });
    const recipient = screen.getByRole('button', { name: /Recipient Name/ });
    expect(recipient.hasAttribute('disabled')).toBe(true);
    fireEvent.click(recipient);
    expect(screen.getByTestId('path').textContent).toBe('/history');
  });
  it('opens the same recipient profile when its avatar is clicked', () => {
    mount();
    const recipient = screen.getByRole('button', { name: /Recipient Name/ });
    fireEvent.click(recipient.firstElementChild!);
    expect(screen.getByTestId('path').textContent).toBe(`/profile/${recipientId}`);
  });
  it('preserves sender navigation', () => {
    const { close } = mount();
    fireEvent.click(screen.getByRole('button', { name: /Sender Name/ }));
    expect(screen.getByTestId('path').textContent).toBe(`/profile/${senderId}`);
    expect(close).toHaveBeenCalledWith(false);
  });
});
