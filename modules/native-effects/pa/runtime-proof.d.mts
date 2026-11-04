export const runtimeInputs:readonly string[];
export function verifyRuntime(file:string,diagnostics:boolean):Promise<{file:string;sha256:string;sourceCommit:string;inputCount:number}>;
