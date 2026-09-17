import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
// Keep the supplied PCM sound intact, except for an eight-second cutoff and
// a short fade at the end to avoid a click when the explosion animation ends.
const input=await fs.readFile('assets/audio/bombh.wav');
assert.equal(input.toString('ascii',0,4),'RIFF');assert.equal(input.toString('ascii',8,12),'WAVE');
let format,data;
for(let at=12;at+8<=input.length;){const id=input.toString('ascii',at,at+4),size=input.readUInt32LE(at+4);if(id==='fmt ')format=input.subarray(at+8,at+8+size);if(id==='data')data=input.subarray(at+8,at+8+size);at+=8+size+(size%2);}
assert.equal(format.readUInt16LE(0),1);assert.equal(format.readUInt16LE(14),16);
const channels=format.readUInt16LE(2),rate=format.readUInt32LE(4),align=channels*2,frames=Math.min(data.length/align,8*rate),pcm=Buffer.from(data.subarray(0,frames*align)),fade=Math.round(rate*.12);
for(let frame=Math.max(0,frames-fade);frame<frames;frame++)for(let channel=0;channel<channels;channel++){const offset=frame*align+channel*2;pcm.writeInt16LE(Math.round(pcm.readInt16LE(offset)*(frames-1-frame)/fade),offset);}
const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);format.copy(header,20,0,16);header.write('data',36);header.writeUInt32LE(pcm.length,40);
await fs.mkdir('dist/data/audio',{recursive:true});await fs.writeFile('dist/data/audio/bombh.wav',Buffer.concat([header,pcm]));
console.log(JSON.stringify({file:'dist/data/audio/bombh.wav',durationSeconds:frames/rate,channels,sampleRate:rate,bytes:44+pcm.length,endFadeSeconds:.12}));
