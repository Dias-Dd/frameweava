import {noiseWgsl} from './noise-wgsl.ts';
/** Specialize only enum dispatch in the fixed generated library. All selected
 * floating point expressions, tables and loops retain their upstream bytes.
 * No authored shader/parser API is introduced. Compile only reachable FNL
 * functions so a simple value texture does not compile every 2D/3D warp path. */
export function specializeNoise(dimensions:2|3,algorithm:number,fractal:number,rotation:number,warp:number,warpFractal:number,enabled:boolean){
 const end=(source:string,open:number)=>{let level=1,i=open+1;for(;i<source.length&&level;i++){if(source[i]==='{')level++;else if(source[i]==='}')level--;}if(level)throw Error('Fixed FNL source has unbalanced braces');return i;};
 const functions=new Map<string,string>();let globals='',previous=0;
 for(const match of noiseWgsl.matchAll(/^fn (\w+)\s*\(/gm)){const begin=match.index!,open=noiseWgsl.indexOf('{',begin),last=end(noiseWgsl,open);globals+=noiseWgsl.slice(previous,begin);previous=last;let source=noiseWgsl.slice(begin,last);
  const values:Record<string,number>={noise_type:algorithm,fractal_type:match[1].includes('DomainWarp')?warpFractal:fractal,rotation_type_3d:rotation,domain_warp_type:warp};
  // Work from inner to outer so fixed nested rotation/noise dispatch is safe.
  const switches=[...source.matchAll(/switch \w+\.(noise_type|fractal_type|rotation_type_3d|domain_warp_type)\s*\{/g)];
  for(const s of switches.reverse()){const first=s.index!,brace=source.indexOf('{',first),last=end(source,brace),body=source.slice(brace+1,last-1),cases:{label:string;body:string}[]=[];let at=0;
   while(at<body.length){const next=/\b(default|case\s+-?\d+)\s*:\s*\{/g;next.lastIndex=at;const label=next.exec(body);if(!label)break;const open=body.indexOf('{',label.index),after=end(body,open);cases.push({label:label[1],body:body.slice(open+1,after-1)});at=after;}
   const selected=cases.find(c=>c.label==='case '+values[s[1]])??cases.find(c=>c.label==='default');if(!selected)throw Error('Fixed FNL enum lacks default');source=source.slice(0,first)+'switch 0 { default: {'+selected.body+'} }'+source.slice(last);
  }
  functions.set(match[1],source);
 }
 globals+=noiseWgsl.slice(previous);const used=new Set<string>();const visit=(name:string)=>{if(used.has(name))return;const source=functions.get(name);if(!source)throw Error('Missing fixed FNL function '+name);used.add(name);for(const called of source.matchAll(/\b(\w+)\s*\(/g))if(functions.has(called[1])&&called[1]!==name)visit(called[1]);};visit('fnlCreateState');visit('fnlGetNoise'+dimensions+'D');if(enabled)visit('fnlDomainWarp'+dimensions+'D');
 return globals+'\n'+[...functions].filter(([name])=>used.has(name)).map(([,source])=>source).join('\n');
}
