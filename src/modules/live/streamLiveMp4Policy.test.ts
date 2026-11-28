import { describe,it,expect } from 'vitest';
import { assertStreamLiveMp4Supported,StreamLiveMp4Unavailable } from '../../../supabase/functions/_shared/streamLiveMp4Policy';
import { validateRecoveryCapability } from '../../../supabase/functions/_shared/rtmpRecoveryCapability';

describe('long live MP4 policy',()=>{
  it('distinguishes a retained live recording from a missing video',()=>{
    expect(()=>assertStreamLiveMp4Supported({liveInput:'input',duration:14554.1})).toThrow(StreamLiveMp4Unavailable);
  });
  it('does not reject uploaded videos or unknown durations',()=>{
    for(const meta of [{duration:20000},{liveInput:'input',duration:null},{liveInput:'input',duration:14400}]) expect(()=>assertStreamLiveMp4Supported(meta)).not.toThrow();
  });
});
describe('scoped recovery capability',()=>{
  const token='operator-temporary-token';
  async function scope(patch={}) {
    const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)));
    return JSON.stringify({tokenHash:Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),replayId:'2dcca8db-db44-49b8-97cc-edf261682786',streamUid:'4641dfe88bdfaf390fdca77d5707cb26',expiresAt:'2026-11-29T00:00:00Z',maxBytes:10*1024**3,...patch});
  }
  const now=Date.parse('2026-11-28T00:00:00Z');
  it('accepts only the matching unexpired capability',async()=>{
    expect((await validateRecoveryCapability(await scope(),token,now))?.replayId).toBe('2dcca8db-db44-49b8-97cc-edf261682786');
    expect(await validateRecoveryCapability(await scope(),'wrong',now)).toBeNull();
    expect(await validateRecoveryCapability(await scope(),token,now+2*86400000)).toBeNull();
  });
  it('fails closed on malformed scope and oversized permission',async()=>{
    for(const raw of [undefined,'{}','bad',await scope({streamUid:'../other'}),await scope({maxBytes:100*1024**3})]) expect(await validateRecoveryCapability(raw,token,now)).toBeNull();
  });
});
