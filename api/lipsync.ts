import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { authorize } from '../server/authorize.js';

/** An optional Rhubarb worker endpoint.
 * Deployments must bundle RHUBARB_BINARY (and its runtime dependencies) or
 * configure an external worker. This endpoint never pretends to run analysis
 * when the executable is absent. */
async function post(request: Request) {
  if (!process.env.RHUBARB_BINARY) return Response.json({ error: 'Rhubarb analyzer is not configured.' }, { status: 503 });
  if (process.env.RHUBARB_GUEST_ENABLED !== 'true' && !await authorize(request))
    return Response.json({ error: 'Sign in to analyze hosted lip-sync.' }, { status: 401 });
  let directory: string | undefined;
  try {
    const form = await request.formData();
    const input = form.get('audio');
    const text = form.get('text');
    if (!(input instanceof File) || input.size < 100 || input.size > 5_000_000 || input.type !== 'audio/wav')
      return Response.json({ error: 'Upload a WAV recording smaller than 5 MB.' }, { status: 400 });
    if (typeof text !== 'string' || text.length > 4000)
      return Response.json({ error: 'Transcript must contain at most 4,000 characters.' }, { status: 400 });
    directory = await mkdtemp(join(tmpdir(), 'toonroom-lipsync-'));
    const audioFile = join(directory, 'voice.wav'), scriptFile = join(directory, 'dialog.txt'), outputFile = join(directory, 'mouth.json');
    await Promise.all([writeFile(audioFile, Buffer.from(await input.arrayBuffer())), writeFile(scriptFile, text)]);
    const recognizer = /[^\x00-\x7F]/.test(text) ? 'phonetic' : 'pocketSphinx';
    const args = ['-r', recognizer, '-f', 'json', '-o', outputFile, '-d', scriptFile, audioFile];
    await new Promise<void>((resolve, reject) => {
      const processHandle = spawn(process.env.RHUBARB_BINARY!, args, { shell: false, stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      const timeout = setTimeout(() => { processHandle.kill('SIGKILL'); reject(new Error('Rhubarb analysis timed out.')); }, 40_000);
      processHandle.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-1000); });
      processHandle.on('error', error => { clearTimeout(timeout); reject(error); });
      processHandle.on('exit', code => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`Rhubarb exited with code ${code}: ${stderr}`)); });
    });
    const output = JSON.parse(await readFile(outputFile, 'utf8'));
    return Response.json(output, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Rhubarb analysis error:', error instanceof Error ? error.message : 'Unknown');
    return Response.json({ error: 'Lip-sync analysis failed; use estimated mouth cues or retry.' }, { status: 502 });
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}
export default { fetch(request: Request) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  return post(request);
} };
