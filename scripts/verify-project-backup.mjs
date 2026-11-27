import {openAsBlob} from 'node:fs';
import {basename} from 'node:path';
import {inspectMovieBackup} from '../src/services/projectExchange.ts';

const path=process.argv[2];
if(!path)throw Error('Usage: node --experimental-strip-types scripts/verify-project-backup.mjs <backup.sirvibe>');
const blob=await openAsBlob(path);
const report=await inspectMovieBackup(new File([blob],basename(path)));
console.log(JSON.stringify(report,null,2));
if(report.missingGraphAudio.length)process.exitCode=2;
