import { describe, it, expect } from 'vitest';
import { makeOwnedPostVideoKey, isOwnedPostVideoKey, hasOwnedPostVideoPrefix } from '../../supabase/functions/_shared/postVideoSourceKey';
const me='20000000-0000-0000-0000-000000000001', other='20000000-0000-0000-0000-000000000002';
describe('owner scoped video sources', () => {
 it('builds new post keys in the authenticated owner namespace',()=>{
   const key=makeOwnedPostVideoKey(me,'123-random.mov');
   expect(key).toBe(`videos/${me}/123-random.mov`);
   expect(isOwnedPostVideoKey(key,me)).toBe(true);
   expect(isOwnedPostVideoKey(key,other)).toBe(false);
 });
 it.each(['../x.mp4','nested/../../x.mp4','%2e%2e/x.mp4','x\\y.mp4','/x.mp4'])('rejects unsafe filenames %s',name=>{
   expect(()=>makeOwnedPostVideoKey(me,name)).toThrow();
 });
 it('distinguishes legacy paths without treating them as owner-attested sources',()=>{
   expect(hasOwnedPostVideoPrefix('videos/legacy.mov')).toBe(false);
   expect(isOwnedPostVideoKey('videos/legacy.mov',me)).toBe(false);
   expect(hasOwnedPostVideoPrefix(`videos/${other}/x.mp4`)).toBe(true);
 });
});
