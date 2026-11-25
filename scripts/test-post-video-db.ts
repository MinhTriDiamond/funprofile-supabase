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
  await sql(test.href, `INSERT INTO posts(id,user_id) VALUES('10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001'); INSERT INTO post_attachments(post_id,file_url,storage_key,file_type,size_bytes) VALUES('10000000-0000-0000-0000-000000000002','https://media.fun.rich/videos/source.mov','videos/20000000-0000-0000-0000-000000000001/source.mov','video',3399337725);`);
  const id = await sql(test.href, "SELECT id FROM post_video_processing_jobs WHERE phase='queued' LIMIT 1");
  const claims = await Promise.all([sql(test.href, `SELECT claim_post_video_job('${id}',gen_random_uuid(),180) IS NOT NULL`), sql(test.href, `SELECT claim_post_video_job('${id}',gen_random_uuid(),180) IS NOT NULL`)]);
  if (claims.filter(x => x === 't').length !== 1) throw new Error('Concurrent claims did not have exactly one winner: ' + claims);
  console.log('Post-video integration + concurrent claim passed');
} finally { await sql(raw, `DROP DATABASE "${name}" WITH (FORCE)`); }
