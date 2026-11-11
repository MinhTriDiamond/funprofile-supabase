/**
 * @vitest-environment jsdom
 *
 * Khoá lỗi hồi quy cho sự cố 2026-11-09: người dùng Android đăng bài bị sập
 * trang với `NotFoundError: Failed to execute 'removeChild' on 'Node'`.
 *
 * Guard chỉ can thiệp khi cây DOM đã lệch (dịch trang/extension di chuyển node).
 * Test cũng chứng minh hành vi NGUYÊN BẢN của trình duyệt là ném lỗi — tức guard
 * là thứ thật sự chặn sự cố, không phải test tự ru ngủ.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { installTranslateSafeDomGuard, isTranslateSafeDomGuardInstalled } from './translateSafeDom';

// Chụp lại hàm native TRƯỚC khi guard được cài để so sánh hành vi.
const nativeRemoveChild = Node.prototype.removeChild;
const nativeInsertBefore = Node.prototype.insertBefore;

describe('installTranslateSafeDomGuard', () => {
  beforeAll(() => {
    installTranslateSafeDomGuard();
  });

  it('cài guard đúng một lần duy nhất', () => {
    expect(isTranslateSafeDomGuardInstalled()).toBe(true);
    expect(installTranslateSafeDomGuard()).toBe(false);
  });

  it('removeChild bình thường vẫn chạy đúng như gốc', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);

    expect(parent.removeChild(child)).toBe(child);
    expect(child.parentNode).toBeNull();
    expect(parent.childNodes.length).toBe(0);
  });

  it('hành vi NGUYÊN BẢN của trình duyệt ném lỗi khi node đã bị bọc ra ngoài', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    // Mô phỏng Google Translate: bọc node con trong <font> do bên ngoài React tạo.
    const wrapper = document.createElement('font');
    wrapper.appendChild(child);
    parent.appendChild(wrapper);

    expect(() => nativeRemoveChild.call(parent, child)).toThrow();
  });

  it('guard gỡ được node đã bị dịch trang bọc ra ngoài, không ném lỗi', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    child.textContent = 'Xin chào';
    const wrapper = document.createElement('font');
    wrapper.appendChild(child);
    parent.appendChild(wrapper);

    expect(() => parent.removeChild(child)).not.toThrow();
    expect(child.parentNode).toBeNull();
    expect(wrapper.contains(child)).toBe(false);
  });

  it('guard không ném khi node đã bị gỡ trước đó', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');

    expect(parent.removeChild(child)).toBe(child);
  });

  it('insertBefore với node tham chiếu không còn là con thì chèn vào cuối thay vì ném', () => {
    const parent = document.createElement('div');
    const existing = document.createElement('span');
    parent.appendChild(existing);
    const detachedReference = document.createElement('i');
    const newNode = document.createElement('b');

    expect(() => nativeInsertBefore.call(parent, newNode, detachedReference)).toThrow();
    expect(() => parent.insertBefore(newNode, detachedReference)).not.toThrow();
    expect(parent.lastElementChild).toBe(newNode);
  });

  it('insertBefore vẫn giữ đúng thứ tự khi node tham chiếu là con hợp lệ', () => {
    const parent = document.createElement('div');
    const first = document.createElement('span');
    const second = document.createElement('span');
    parent.appendChild(first);
    parent.appendChild(second);
    const inserted = document.createElement('b');

    parent.insertBefore(inserted, second);

    expect(Array.from(parent.children)).toEqual([first, inserted, second]);
  });
});
