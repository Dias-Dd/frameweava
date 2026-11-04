import {sharedVariable} from '../../src/shared-state/authoring.ts';
export const count=sharedVariable({id:'count',writer:'A',kind:'number',initial:0});
export const enabled=sharedVariable({id:'enabled',writer:'A',kind:'boolean',initial:false});
export const label=sharedVariable({id:'label',writer:'A',kind:'string',initial:'initial'});
export const object=sharedVariable({id:'object',writer:'A',kind:'json',initial:{items:[0],$expr:'literal-data'}});
export const left=sharedVariable({id:'left',writer:'A',kind:'number',initial:0});
export const right=sharedVariable({id:'right',writer:'C',kind:'number',initial:0});
export const total=sharedVariable({id:'total',writer:'B',kind:'number',initial:0});
