// IGN Géoplateforme, the photography layer used by cartes.gouv.fr.
export const IGN_LAYER = 'ORTHOIMAGERY.ORTHOPHOTOS';
export const IGN_WMTS = 'https://data.geopf.fr/wmts?SERVICE=WMTS&VERSION=1.0.0&REQUEST=GetTile&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&FORMAT=image/jpeg&TILEMATRIXSET=PM_0_19&TILEMATRIX={z}&TILECOL={x}&TILEROW={y}';
export const imageryURL = (z,x,y) => IGN_WMTS.replace('{z}',z).replace('{x}',x).replace('{y}',y);
