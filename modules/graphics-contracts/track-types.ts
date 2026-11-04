/** Stable analysis.track/1 wire contract. Independent of task executors and rendering hosts. */
export interface TrackSample {
  timestampUs:number; frameIndex:number; valid:boolean; trackId:string|null;
  confidence:null; landmarkCount:number;
  anchor:{x:number;y:number}|null; box:{x:number;y:number;width:number;height:number}|null;
  frameAsset:string; frameSha256:string;
}
export interface TrackData {
  schemaVersion:'analysis.track/1'; cacheKey:string;
  media:{name:string;sha256:string;bytes:number};
  model:{id:string;version:string;sha256:string};
  algorithm:{id:'mediapipe.FaceLandmarker';packageVersion:string;implementationSha256:string;runtimeSha256:string;decoderSha256:string;browserVersion:string;delegate:'CPU';runningMode:'VIDEO';numFaces:1;identity:'single-visible-face-segments-not-person-identity'};
  config:{startSeconds:number;endSeconds:number;sampleRate:number;analysisWidth:number;minFaceDetectionConfidence:number;minFacePresenceConfidence:number;minTrackingConfidence:number};
  time:{unit:'microseconds';origin:'source-media-start';range:'start-inclusive-end-exclusive';sampling:'ffmpeg-fps-near-grid';startUs:number;endUs:number};
  coordinates:{unit:'normalized';origin:'top-left';x:'right';y:'down';space:'decoded-square-pixel-display-frame';width:number;height:number};
  samples:TrackSample[];
}
export type TrackQuery={valid:false;reason:'outside-range'|'missing-detection'|'gap'|'not-bracketed'}|{valid:true;trackId:string;anchor:{x:number;y:number};box:{x:number;y:number;width:number;height:number};confidence:null;interpolated:boolean};
