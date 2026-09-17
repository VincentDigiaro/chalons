// Used only when acquiring a new image on the server, never by a visitor.
export const IGN_LAYER='ORTHOIMAGERY.ORTHOPHOTOS';
export const IGN_SOURCE='https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM_0_19&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}';
export const sourceURL=(z,x,y)=>IGN_SOURCE.replace('{z}',z).replace('{x}',x).replace('{y}',y);
export const IMAGERY_BOUNDS=[4.16,48.81,4.56,49.115];
export const tilePoint=(lng,lat,z)=>[(lng+180)/360*2**z,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z];
export function validTile(z,x,y,bounds=IMAGERY_BOUNDS){
  if(![z,x,y].every(Number.isInteger)||z<0||z>19||x<0||y<0||x>=2**z||y>=2**z)return false;
  const [w,s,e,n]=bounds,[left,top]=tilePoint(w,n,z),[right,bottom]=tilePoint(e,s,z);
  return x+1>left&&x<right&&y+1>top&&y<bottom;
}
