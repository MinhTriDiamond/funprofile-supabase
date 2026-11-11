/**
 * Guard cho các thao tác DOM mà React thực hiện trên cây DOM của chính nó.
 *
 * Vì sao cần: React giữ tham chiếu node và tin rằng quan hệ cha–con không đổi.
 * Nhưng dịch trang của trình duyệt (Google Translate bọc `<font>` quanh text
 * node), extension, hoặc code sửa DOM bằng tay có thể di chuyển node. Khi đó
 * React gọi `parent.removeChild(node)` với một node không còn là con của parent
 * ⇒ `NotFoundError: Failed to execute 'removeChild' on 'Node': The node to be
 * removed is not a child of this node` ⇒ sập toàn app qua ErrorBoundary.
 *
 * Nguyên nhân gốc của sự cố 2026-11-09 (Android, đăng bài) đã được vá tại
 * `TwemojiImage` (không còn `replaceWith` bằng tay). Guard này là lớp bảo hiểm
 * thứ hai cho MỌI nguồn sửa DOM bên ngoài — trong đó có dịch trang, thứ mà đội
 * chủ động giữ lại để thành viên nước ngoài đọc được nội dung tiếng Việt.
 *
 * Nguyên tắc: chỉ can thiệp ĐÚNG lúc cây DOM đã lệch. Mọi trường hợp bình
 * thường đi y nguyên đường gốc của trình duyệt.
 */

export const DOM_GUARD_MARKER = '__funProfileDomGuard';

type GuardedNodePrototype = Node & { [DOM_GUARD_MARKER]?: boolean };

let guardInstalled = false;

export function isTranslateSafeDomGuardInstalled(): boolean {
  return guardInstalled;
}

/**
 * Cài guard một lần duy nhất. Trả về true nếu lượt gọi này thực sự vá prototype.
 */
export function installTranslateSafeDomGuard(nodePrototype?: Node): boolean {
  if (guardInstalled) return false;
  const proto = (nodePrototype
    ?? (typeof window !== 'undefined' ? window.Node?.prototype : undefined)) as GuardedNodePrototype | undefined;
  if (!proto) return false;
  if (proto[DOM_GUARD_MARKER]) {
    guardInstalled = true;
    return false;
  }

  const nativeRemoveChild = proto.removeChild;
  const nativeInsertBefore = proto.insertBefore;
  if (typeof nativeRemoveChild !== 'function' || typeof nativeInsertBefore !== 'function') return false;

  const patchedRemoveChild = function patchedRemoveChild(this: Node, child: Node): Node {
    if (!child) return child;
    if (child.parentNode === this) return nativeRemoveChild.call(this, child);
    const actualParent = child.parentNode;
    if (actualParent) {
      // Node đã bị di chuyển ra khỏi `this` → gỡ ở node cha thật để DOM không
      // còn node mồ côi, thay vì ném NotFoundError làm sập app.
      return nativeRemoveChild.call(actualParent, child);
    }
    // Node đã bị gỡ trước đó → coi như thao tác đã hoàn tất.
    return child;
  };

  const patchedInsertBefore = function patchedInsertBefore(
    this: Node,
    newNode: Node,
    referenceNode: Node | null,
  ): Node {
    if (referenceNode === null || referenceNode.parentNode === this) {
      return nativeInsertBefore.call(this, newNode, referenceNode);
    }
    // Node tham chiếu không còn là con của `this` → chèn vào cuối thay vì ném.
    return this.appendChild(newNode);
  };

  proto.removeChild = patchedRemoveChild as Node['removeChild'];
  proto.insertBefore = patchedInsertBefore as Node['insertBefore'];
  Object.defineProperty(proto, DOM_GUARD_MARKER, {
    value: true,
    enumerable: false,
    configurable: true,
  });
  guardInstalled = true;
  return true;
}
