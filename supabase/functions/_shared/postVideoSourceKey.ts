const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ownerPattern = new RegExp(`^${UUID}$`, 'i');
const prefixPattern = new RegExp(`^videos/${UUID}/`, 'i');

/** Legacy keys remain readable, but are never treated as owner-attested inputs. */
export function hasOwnedPostVideoPrefix(key: string): boolean {
  return prefixPattern.test(key);
}

export function makeOwnedPostVideoKey(userId: string, filename: string): string {
  if (!ownerPattern.test(userId) || !filename || /[/\\%\x00-\x1f\x7f]/.test(filename) || filename === '.' || filename === '..') {
    throw new Error('Invalid video owner or filename');
  }
  return `videos/${userId.toLowerCase()}/${filename}`;
}

export function isOwnedPostVideoKey(key: string, userId: string): boolean {
  if (!ownerPattern.test(userId)) return false;
  const prefix = `videos/${userId.toLowerCase()}/`;
  if (!key.startsWith(prefix)) return false;
  try { return makeOwnedPostVideoKey(userId, key.slice(prefix.length)) === key; }
  catch { return false; }
}

/** Once referenced by a job, an original is immutable through upload APIs. */
export async function isPostVideoSourceLocked(admin:any,key:string):Promise<boolean> {
 if(!hasOwnedPostVideoPrefix(key)&&!/^videos\/[^/]+$/.test(key))return false;
 const {data,error}=await admin.from('post_video_processing_jobs').select('id').eq('source_key',key).limit(1);
 if(error||!Array.isArray(data))throw new Error('Cannot verify video source version lock');
 return data.length>0;
}
