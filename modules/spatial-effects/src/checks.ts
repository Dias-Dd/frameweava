export function spatialError(code:string,message:string):never {throw Object.assign(new Error(message),{code});}
export function finite(value:number,name:string,min=-Infinity,max=Infinity):number {
  if(!Number.isFinite(value)||value<min||value>max)spatialError('E_SPATIAL_PARAMETER',`${name} must be finite in [${min},${max}]`);return value;
}
export function integer(value:number,name:string,min=1):number {
  finite(value,name,min);if(!Number.isSafeInteger(value))spatialError('E_SPATIAL_PARAMETER',`${name} must be a safe integer`);return value;
}
export function vector(value:[number,number,number],name:string,min=-Infinity):[number,number,number] {
  if(!Array.isArray(value)||value.length!==3)spatialError('E_SPATIAL_PARAMETER',`${name} requires three coordinates`);
  return value.map(v=>finite(v,name,min)) as [number,number,number];
}
