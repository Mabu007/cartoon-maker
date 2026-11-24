import test from 'node:test';
import assert from 'node:assert/strict';
import { filmAuthoringPrompt } from '../src/engine/filmAuthoringPrompt.ts';
import { ProjectDocument, environments } from '../src/engine/schema.ts';

test('MCP Copy describes an importable editable project with current schema and all sets', () => {
  const prompt = filmAuthoringPrompt();
  assert.ok(prompt.includes('toonroom-backup-1'));
  assert.ok(prompt.includes('sirvibe-backup-2'));
  assert.ok(prompt.includes('BASE64_OF_REAL_AUDIO_BYTES'));
  const sections=prompt.split('\n\n');
  const after=(heading:string)=>sections[sections.indexOf(heading)+1];
  const schema=JSON.parse(after('PROJECT JSON SCHEMA (authoritative shape; additional relationship constraints above also apply):'));
  assert.ok(schema.properties.version);
  assert.ok(schema.properties.scenes);
  const project=ProjectDocument.parse(JSON.parse(after('WORKING EXAMPLE PROJECT (illustrative built-in voice lines only; do not copy dialogue assets for new dialogue):')));
  assert.ok(project.characters.some(c=>c.id==='sbu'));
  assert.ok(project.characters.some(c=>c.id==='zee'));
  assert.ok(project.scenes[0].clips.some(c=>c.track==='dialogue'));
  const sets=JSON.parse(after('FURNISHED SET PRESETS (copy as scene.objects; rename IDs if necessary):'));
  for(const environment of environments) assert.ok(sets[environment].length);
  assert.ok(!prompt.includes('FISH_API_KEY='));
});
