import { describe, it, expect } from 'vitest';
import {
  validateUsername,
  isReservedUsername,
  USERNAME_REGEX,
  RESERVED_USERNAMES,
} from '@/lib/username-validation';

/**
 * Guard: regex + reserved list ở frontend PHẢI khớp DB
 * - `validate_username_format`: ^[a-z][a-z0-9_.]{2,29}$
 * - `check_reserved_username`: 18 tên bị cấm
 */
describe('username validation ↔ DB parity', () => {
  it('regex khớp nguyên văn regex DB', () => {
    expect(USERNAME_REGEX.source).toBe('^[a-z][a-z0-9_.]{2,29}$');
  });

  it('chặn case biên đã gây lỗi 500 ở DB', () => {
    expect(validateUsername('1309tri')).toBe('authErrorUsernameFormat'); // số đầu
    expect(validateUsername('_qarepro')).toBe('authErrorUsernameFormat'); // gạch dưới đầu
    expect(validateUsername('test')).toBe('authErrorUsernameReserved'); // reserved
    expect(validateUsername('admin')).toBe('authErrorUsernameReserved');
    expect(validateUsername('a'.repeat(31))).toBe('authErrorUsernameLong'); // > 30
    expect(validateUsername('ab')).toBe('authErrorUsernameShort');
    expect(validateUsername('AbcDef')).toBe('authErrorUsernameLowercase');
  });

  it('cho qua username hợp lệ', () => {
    expect(validateUsername('leminhtricamlycoin')).toBeNull();
    expect(validateUsername('u1309tri')).toBeNull();
    expect(validateUsername('a'.repeat(30))).toBeNull();
    expect(validateUsername('fun.rich_user1')).toBeNull();
  });

  it('danh sách reserved đủ 18 tên như DB', () => {
    expect(RESERVED_USERNAMES).toHaveLength(18);
    expect(isReservedUsername('SUPPORT')).toBe(true);
    expect(isReservedUsername('angelkim')).toBe(false);
  });
});
