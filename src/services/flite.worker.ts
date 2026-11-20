import { WASI } from '@tybys/wasm-util';
import { createFsFromVolume, Volume } from 'memfs-browser';
import wasmUrl from '@echogarden/flite-wasi/flite.wasm?url';

let binary: Promise<WebAssembly.Module> | undefined;
self.onmessage = async (event: MessageEvent<{ id: number; text: string; voice: string }>) => {
  const { id, text, voice } = event.data;
  try {
    binary ??= fetch(wasmUrl).then(async response => {
      if (!response.ok) throw new Error('Could not download the local voice engine.');
      return WebAssembly.compile(await response.arrayBuffer());
    }).catch(error => { binary = undefined; throw error; });
    const fs = createFsFromVolume(Volume.fromJSON({ '/home/voice': null }));
    let error = '';
    const wasi = new WASI({ args: ['flite', '-t', text, '-voice', voice, '-o', 'voice.wav'], preopens: { '.': '/home/voice' }, fs: fs as unknown as NonNullable<ConstructorParameters<typeof WASI>[0]>['fs'], print() {}, printErr: message => { error += message; }, returnOnExit: true });
    const instance = await WebAssembly.instantiate(await binary, { wasi_snapshot_preview1: wasi.wasiImport });
    const code = wasi.start(instance);
    if (code) throw new Error(error || 'The local voice engine could not synthesize this line.');
    const file = fs.readFileSync('/home/voice/voice.wav') as Uint8Array;
    const wave = new Uint8Array(file).buffer;
    if (wave.byteLength <= 44) throw new Error('No voice audio was produced.');
    self.postMessage({ id, wave }, { transfer: [wave] });
  } catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : 'Speech generation failed.' }); }
};
