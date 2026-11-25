/** Creates/drops only a unique disposable database on an explicitly configured loopback server. */
const raw = process.env.POST_VIDEO_TEST_DATABASE_URL;
if (!raw) throw new Error('Set POST_VIDEO_TEST_DATABASE_URL to a loopback database named post_video_test');
const base = new URL(raw);
if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || base.pathname !== '/post_video_test') throw new Error('Refusing non-local or non-test database');
async function sql(url: string, query: string): Promise<string> {
  const p = Bun.spawn(['psql', url, '-X', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', query], { stdout: 'pipe', stderr: 'pipe' });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code) throw new Error(err); return out.trim();
}
const name = 'post_video_test_' + crypto.randomUUID().replaceAll('-', '').slice(0, 16);
const test = new URL(raw); test.pathname = '/' + name;
await sql(raw, `CREATE DATABASE "${name}"`);
try {
  const p = Bun.spawn(['psql', test.href, '-X', '-v', 'ON_ERROR_STOP=1', '-f', 'scripts/tests/post-video-processing.sql'], { stdout: 'inherit', stderr: 'inherit' });
  if (await p.exited) throw new Error('SQL fixtures failed');
  const refs=Bun.spawn(['psql',test.href,'-X','-v','ON_ERROR_STOP=1','-f','scripts/tests/post-video-reference-probe.sql'],{stdout:'inherit',stderr:'inherit'});
  if(await refs.exited)throw new Error('Reference SQL fixtures failed');
  const retention=Bun.spawn(['psql',test.href,'-X','-v','ON_ERROR_STOP=1','-f','scripts/tests/post-video-original-retention.sql'],{stdout:'inherit',stderr:'inherit'});
  if(await retention.exited)throw new Error('Retention SQL fixtures failed');
  // Actual two-connection race: an in-flight reference write must win over retirement.
  const raceKey='videos/20000000-0000-0000-0000-000000000001/race-retention.mov',raceUrl='https://media.fun.rich/'+raceKey,raceLease=crypto.randomUUID();
  const raceJob=(await sql(test.href,`INSERT INTO post_video_processing_jobs(user_id,post_id,attachment_id,source_key,source_url,source_size,source_hash,phase,outcome,output_bucket,output_key,output_size,output_verified_at,published_at,stream_deleted_at,gateway_url,runtime)
   SELECT user_id,post_id,attachment_id,'${raceKey}','${raceUrl}',1000,'race','complete','optimized',output_bucket,output_key,output_size,now(),now()-interval '25 hours',now(),gateway_url,'{"sourceEtag":"race-version"}'::jsonb FROM post_video_processing_jobs WHERE source_deleted_at IS NOT NULL LIMIT 1 RETURNING id`)).split('\n')[0];
  if(await sql(test.href,`SELECT claim_post_video_source_cleanup('${raceJob}','${raceLease}') IS NOT NULL`)!=='t')throw new Error('Race claim failed');
  const writerUrl=new URL(test.href);writerUrl.searchParams.set('application_name','retention_reference_writer');
  const writer=Bun.spawn(['psql',writerUrl.href,'-X','-t','-A','-v','ON_ERROR_STOP=1','-c',`BEGIN;INSERT INTO comments(video_url) VALUES('${raceUrl}');SELECT pg_sleep(1);COMMIT;`],{stdout:'pipe',stderr:'pipe'});
  let held=false;
  for(let attempt=0;attempt<50;attempt++){held=await sql(test.href,"SELECT EXISTS(SELECT 1 FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='retention_reference_writer' AND l.locktype='advisory' AND l.granted)")==='t';if(held)break;await Bun.sleep(10);}
  if(!held)throw new Error('Writer failed to acquire shared reference lock');
  const arm=await sql(test.href,`SELECT arm_post_video_source_cleanup('${raceJob}','${raceLease}','race-version','originals')`);
  const [writerOut,writerErr,writerCode]=await Promise.all([new Response(writer.stdout).text(),new Response(writer.stderr).text(),writer.exited]);
  if(writerCode||arm!=='f')throw new Error('Concurrent reference was not protected: '+writerErr);
  console.log('Concurrent reference commit blocks source retirement');
  await sql(test.href, `INSERT INTO posts(id,user_id) VALUES('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001'); INSERT INTO post_attachments(post_id,file_url,storage_key,file_type,size_bytes) VALUES('10000000-0000-0000-0000-000000000002','https://media.fun.rich/videos/source.mov','videos/20000000-0000-0000-0000-000000000001/source.mov','video',3399337725);`);
  const id = await sql(test.href, "SELECT id FROM post_video_processing_jobs WHERE phase='queued' LIMIT 1");
  const claims = await Promise.all([sql(test.href, `SELECT claim_post_video_job('${id}',gen_random_uuid(),180) IS NOT NULL`), sql(test.href, `SELECT claim_post_video_job('${id}',gen_random_uuid(),180) IS NOT NULL`)]);
  if (claims.filter(x => x === 't').length !== 1) throw new Error('Concurrent claims did not have exactly one winner: ' + claims);
  console.log('Post-video integration + concurrent claim passed');
} finally { await sql(raw, `DROP DATABASE "${name}" WITH (FORCE)`); }
