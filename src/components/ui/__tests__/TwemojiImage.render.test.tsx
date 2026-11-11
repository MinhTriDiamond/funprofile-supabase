/**
 * @vitest-environment jsdom
 *
 * Khoá lỗi hồi quy sự cố 2026-11-09 (Android, đăng bài):
 * `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be
 * removed is not a child of this node`.
 *
 * Nguyên nhân: `TwemojiImage` cũ thay thế node `<img>` do React quản lý bằng
 * `e.currentTarget.replaceWith(span)`. Test cuối cùng trong file mô phỏng lại
 * đúng cách cũ để chứng minh nó ném lỗi, còn cách mới thì không.
 */
import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { TwemojiImage } from '@/components/ui/TwemojiImage';

describe('TwemojiImage', () => {
  it('render ảnh Twemoji bình thường', () => {
    const { container } = render(<TwemojiImage emoji="🙏" size={22} />);
    const img = container.querySelector('img');

    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('🙏');
    expect(img?.getAttribute('src')).toContain('twemoji');
    expect(img?.getAttribute('width')).toBe('22');
  });

  it('ảnh lỗi thì render emoji gốc bằng React state và gỡ trang an toàn', () => {
    const { container, unmount } = render(<TwemojiImage emoji="🫩" />);

    const img = container.querySelector('img');
    expect(img).not.toBeNull();

    fireEvent.error(img!);

    expect(container.querySelector('img')).toBeNull();
    const fallback = container.querySelector('span[role="img"]');
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toBe('🫩');

    // Cây DOM vẫn do React sở hữu ⇒ unmount không ném NotFoundError.
    expect(() => unmount()).not.toThrow();
    expect(container.childNodes.length).toBe(0);
  });

  it('emoji khác sau khi lỗi vẫn thử tải ảnh mới', () => {
    const { container, rerender } = render(<TwemojiImage emoji="🫩" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('span[role="img"]')).not.toBeNull();

    rerender(<TwemojiImage emoji="🙏" />);

    expect(container.querySelector('img')?.getAttribute('alt')).toBe('🙏');
  });

  it('cách cũ (replaceWith bằng tay) ném đúng lỗi removeChild khi unmount — lý do phải sửa', () => {
    const { container, unmount } = render(<TwemojiImage emoji="🙏" />);
    const img = container.querySelector('img')!;

    // Đây chính là code cũ trong onError:
    const span = document.createElement('span');
    span.textContent = '🙏';
    img.replaceWith(span);

    expect(() => unmount()).toThrow();
  });
});
