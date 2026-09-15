import {RoofCatalogueLayer} from './roof-catalogue-layer.js';
import {RoofTextures as AerialRoofs} from './roof-aerial-layer.js';
import {getRoofMode} from './roof-mode.js';
export const RoofTextures=getRoofMode()==='aerial'?AerialRoofs:RoofCatalogueLayer;
