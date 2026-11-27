import { makeRevenentDemo } from '../src/engine/revenentDemo.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { AssetManifest, AssetPackage, CharacterVisual, assetInstructions } from '../src/engine/visualAssets.ts';
import { EnvironmentVisual } from '../src/engine/environmentVisuals.ts';
import { visualRigAnchors } from '../src/engine/visualRig.ts';
import { illustratedCharacters } from '../src/engine/visualPresets.ts';
const root=new URL('../docs/visual-assets/',import.meta.url);await mkdir(root,{recursive:true});
for(const [name,schema] of Object.entries({'asset-manifest':AssetManifest,'asset-package':AssetPackage,'character-visual':CharacterVisual,'environment-visual':EnvironmentVisual}))
  await writeFile(new URL(name+'.schema.json',root),JSON.stringify(z.toJSONSchema(schema,{io:'input'}),null,2)+'\n');
for(const category of ['hair','clothing','prop','environment'])await writeFile(new URL(category+'-ai-instructions.txt',root),assetInstructions(category)+'\n');
for(const character of illustratedCharacters){
  const points=visualRigAnchors(character),labels=Object.entries(points).map(([name,p])=>`<circle cx="${p.x}" cy="${p.y}" r="1.2" fill="#ca8539"/><text x="${p.x+2}" y="${p.y-2}" font-size="3.2">${name}</text>`).join('');
  const source=`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="-85 -240 170 270"><rect x="-85" y="-240" width="170" height="270" fill="#f4f1fa"/><g stroke="#9b91ac" fill="none"><path d="M-85 0H85M0-235V20"/></g><g font-family="sans-serif" fill="#30243c">${labels}<text x="-80" y="20" font-size="4">${character.name}: reference pose · rig units · y down</text></g></svg>`;
  await writeFile(new URL(character.id+'-rig-reference.svg',root),source);
}
console.log('Generated visual schemas, AI instructions and native rig reference sheets.');

await writeFile(new URL('../public/visual-examples/REVENENT-visual-test.sirvibe',import.meta.url),JSON.stringify({format:'toonroom-backup-1',project:makeRevenentDemo(),audio:{}},null,2)+'\n');
