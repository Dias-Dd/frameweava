export type InitOptions={id:string;authority:string;execution?:'worker'|'direct';version?:string;rustc?:string}&({template?:'bytes-v1';example?:'statistics'|'rgba'}|{template:'wasm-bindgen';example?:'lyon'|'bindings'});
export function initialize(directory:string,options:InitOptions):Promise<{directory:string;id:string;version:string;example:string;execution:string;next:string;template?:string}>;
