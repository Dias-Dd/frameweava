/** Selected public signatures checked against the byte-preserved upstream v1.1.1. */
export class Vector2 {constructor(x:number,y:number);x:number;y:number}
export class Vector3 {constructor(x:number,y:number,z:number);x:number;y:number;z:number}
export default class FastNoiseLite {
  static NoiseType:Readonly<Record<string,string>>;
  static FractalType:Readonly<Record<string,string>>;
  static RotationType3D:Readonly<Record<string,string>>;
  static DomainWarpType:Readonly<Record<string,string>>;
  static CellularDistanceFunction:Readonly<Record<string,string>>;
  static CellularReturnType:Readonly<Record<string,string>>;
  constructor(seed?:number);
  SetSeed(value:number):void;SetFrequency(value:number):void;SetNoiseType(value:string):void;
  SetRotationType3D(value:string):void;SetFractalType(value:string):void;SetFractalOctaves(value:number):void;
  SetFractalLacunarity(value:number):void;SetFractalGain(value:number):void;SetFractalWeightedStrength(value:number):void;
  SetFractalPingPongStrength(value:number):void;SetDomainWarpType(value:string):void;SetDomainWarpAmp(value:number):void;
  SetCellularDistanceFunction(value:string):void;SetCellularReturnType(value:string):void;SetCellularJitter(value:number):void;
  GetNoise(x:number,y:number):number;GetNoise(x:number,y:number,z:number):number;
  DomainWrap(value:Vector2|Vector3):void;
}
