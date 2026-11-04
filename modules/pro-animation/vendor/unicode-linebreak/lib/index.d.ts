// Frameweave local type-only declaration for the reviewed unmodified default rules.
export class Break {position:number;required:boolean;string?:string}
export class Rules {constructor(options?:{string?:boolean});breaks(text:string):Generator<Break>}
