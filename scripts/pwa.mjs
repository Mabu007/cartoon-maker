import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

// Include every emitted lazy chunk and worker, not just the entrypoint. Optional
// cloud APIs are never cached; the shell and filmmaking libraries are local.
export function offlineBundle(template = new URL('./sw-template.js',import.meta.url)) {
  return {
    name: 'sirvibe-offline-bundle',
    async writeBundle(options) {
      const root = options.dir || 'dist';
      async function walk(dir) {
        const entries = await readdir(dir, { withFileTypes: true });
        return (await Promise.all(entries.map(e => e.isDirectory() ? walk(join(dir,e.name)) : join(dir,e.name)))).flat();
      }
      const files = (await walk(root)).filter(p => !/\.(?:map)$/.test(p) && !['sw.js','offline-manifest.json'].includes(relative(root,p))).sort();
      const source = await readFile(template,'utf8');
      // Worker-only fixes also need a distinct cache. A failed update must
      // never delete a cache still used by the active worker.
      const hash = createHash('sha256').update(source);
      for (const path of files) hash.update(await readFile(path));
      const version = hash.digest('hex').slice(0,20);
      const urls = files.map(path => '/' + relative(root,path).split('\\').join('/'));
      await writeFile(join(root,'sw.js'), source.replace('__VERSION__',JSON.stringify(version)).replace('__PRECACHE__',JSON.stringify(urls)));
      await writeFile(join(root,'offline-manifest.json'),JSON.stringify({version,urls},null,2));
    }
  };
}
