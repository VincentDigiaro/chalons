// The WMS service advertises a maximum image size of 5010 x 5010 pixels.
export const TILE_PIXELS=256,MAX_PACK_SIDE=Math.floor(5010/TILE_PIXELS);
const MAGIC=0x314b5049;
export function validateImageryConfig(value){
  const rules={tuilesParCotePaquet:[1,MAX_PACK_SIDE],cachePaquetsNavigateurOctets:[0,Number.MAX_SAFE_INTEGER],delaiRequeteNavigateurMs:[1,2147483647],chargementsPaquetsIGNSimultanes:[1,Number.MAX_SAFE_INTEGER],intervalleRequetesIGNMs:[0,2147483647],delaiRequeteIGNMs:[1,2147483647],nouvellesTentativesIGN:[0,Number.MAX_SAFE_INTEGER],delaiNouvelleTentativeIGNMs:[0,2147483647],delaiApresEchecIGNMs:[0,2147483647],paquetsIGNEnAttenteMax:[1,Number.MAX_SAFE_INTEGER],octetsMaxImageIGN:[1,Number.MAX_SAFE_INTEGER]};
  for(const [key,[min,max]] of Object.entries(rules))if(!Number.isSafeInteger(value?.[key])||value[key]<min||value[key]>max)throw Error(`Configuration imagery invalide : ${key}`);
  return value;
}
export function tilePack(z,x,y,side){
  side=Math.min(side,2**z);
  return {z,x:Math.floor(x/side)*side,y:Math.floor(y/side)*side,side};
}
export const packURL=({z,x,y,side})=>`./data/imagery/ign/packs/v1/${side}/${z}/${x}/${y}.bin`;
export function jpegSize(bytes){
  if(bytes.length<5||bytes[0]!==255||bytes[1]!==216||bytes.at(-2)!==255||bytes.at(-1)!==217)throw Error('Invalid JPEG');
  for(let i=2;i+8<bytes.length;){
    if(bytes[i++]!==255)throw Error('Invalid JPEG marker');
    while(bytes[i]===255)i++;
    const marker=bytes[i++];if(marker===0xda||marker===0xd9)break;
    if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    const length=(bytes[i]<<8)|bytes[i+1];if(length<2||i+length>bytes.length)throw Error('Truncated JPEG');
    if([0xc0,0xc1,0xc2].includes(marker))return [(bytes[i+5]<<8)|bytes[i+6],(bytes[i+3]<<8)|bytes[i+4]];
    i+=length;
  }
  throw Error('JPEG dimensions missing');
}
export function encodeImageryPack({z,x,y,side,tiles},images){
  let offset=0;
  const entries=images.map(bytes=>{const size=jpegSize(bytes),entry=[offset,bytes.length,...size];offset+=bytes.length;return entry;});
  const header=new TextEncoder().encode(JSON.stringify({version:1,z,x,y,side,tiles,images:entries}));
  const bytes=new Uint8Array(8+header.length+offset),view=new DataView(bytes.buffer);
  view.setUint32(0,MAGIC,true);view.setUint32(4,header.length,true);bytes.set(header,8);
  offset+=8+header.length;let position=8+header.length;
  for(const image of images){bytes.set(image,position);position+=image.length;}
  return bytes;
}
export function decodeImageryPack(buffer,expected){
  const view=new DataView(buffer);if(buffer.byteLength<8||view.getUint32(0,true)!==MAGIC)throw Error('Invalid imagery packet');
  const length=view.getUint32(4,true),start=8+length;if(start>buffer.byteLength)throw Error('Truncated imagery packet');
  const header=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,8,length)));
  for(const key of ['z','x','y','side'])if(header[key]!==expected[key])throw Error('Wrong imagery packet');
  if(header.version!==1||!Array.isArray(header.tiles)||!header.tiles.length||header.tiles.length>header.side**2||!Array.isArray(header.images)||header.images.length>header.tiles.length)throw Error('Invalid imagery index');
  let end=0;
  const images=header.images.map(([offset,bytes,width,height])=>{
    if(![offset,bytes,width,height].every(Number.isSafeInteger)||offset!==end||bytes<5||start+offset+bytes>buffer.byteLength||width<1||height<1||width>header.side*TILE_PIXELS||height>header.side*TILE_PIXELS)throw Error('Invalid imagery bounds');
    const data=new Uint8Array(buffer,start+offset,bytes),size=jpegSize(data);if(size[0]!==width||size[1]!==height)throw Error('Wrong image dimensions');end+=bytes;
    return {data,width,height};
  });
  if(start+end!==buffer.byteLength)throw Error('Trailing imagery data');
  const tiles=new Map();
  for(const [x,y,index,left,top] of header.tiles){
    const image=images[index],key=`${x}/${y}`;
    if(![x,y,index,left,top].every(Number.isSafeInteger)||!image||x<header.x||y<header.y||x>=Math.min(2**header.z,header.x+header.side)||y>=Math.min(2**header.z,header.y+header.side)||left<0||top<0||left+TILE_PIXELS>image.width||top+TILE_PIXELS>image.height||tiles.has(key))throw Error('Invalid tile region');
    tiles.set(key,{image,region:[left,top,TILE_PIXELS,TILE_PIXELS]});
  }
  return {images,tiles,byteLength:buffer.byteLength};
}
