/** Offline inspection of existing TypeScript contracts. Uses the compiler's
 * type checker rather than introducing a parallel parameter/schema engine. */
import ts from 'typescript';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,relative,resolve} from 'node:path';
import {createHash} from 'node:crypto';
interface Field {name:string;type:string;optional:boolean;source?:{file:string;line:number}}
interface Parameter {name:string;type:string;optional:boolean;fields:Field[]}
interface Method {name:string;contract:string;file:string;line:number;sourceSha256:string;parameters:Parameter[]}
const roots=['modules/native-effects','modules/gpu-image-effects/resident','modules/pro-animation/src/native-time','modules/pro-animation/src/native-transitions','modules/pro-animation/src/native-motion-time'],files:string[]=[];
async function walk(dir:string){for(const entry of await readdir(dir,{withFileTypes:true})){if(['vendor','validation','coverage','examples','fixtures','fixtures-v2'].includes(entry.name))continue;const file=join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.name.endsWith('.ts')&&!/^(verify|reference|syntax|stage|.*-reference)/.test(entry.name))files.push(file);}}
for(const root of roots)await walk(root);
const program=ts.createProgram(files,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,allowImportingTsExtensions:true,skipLibCheck:true,noEmit:true,jsx:ts.JsxEmit.ReactJSX}),checker=program.getTypeChecker(),methods:Method[]=[];
const location=(node:ts.Node)=>({file:relative(resolve('.'),node.getSourceFile().fileName).replaceAll('\\','/'),line:node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line+1});
function describeType(name:string,type:ts.Type,optional:boolean,node:ts.Node):Parameter{
 const control=/^(?:o|options|config|controls)$/.test(name),properties=control?checker.getPropertiesOfType(checker.getNonNullableType(type)):[];
 return {name,type:checker.typeToString(type,node,ts.TypeFormatFlags.NoTruncation),optional,fields:properties.map(symbol=>{const declaration=symbol.valueDeclaration??symbol.declarations?.[0];return {name:symbol.name,type:checker.typeToString(checker.getTypeOfSymbolAtLocation(symbol,declaration??node),node,ts.TypeFormatFlags.NoTruncation),optional:!!(symbol.flags&ts.SymbolFlags.Optional),...declaration?{source:location(declaration)}:{}};})};
}
for(const file of files){const source=program.getSourceFile(file);if(!source)throw Error('Missing source '+file);const sourceSha256=createHash('sha256').update(await readFile(file)).digest('hex');
 function add(name:string,contract:string,node:ts.SignatureDeclaration){
  const parameters=node.parameters.map(p=>describeType(p.name.getText(),checker.getTypeAtLocation(p),Boolean(p.questionToken||p.initializer),p));
  methods.push({name,contract,...location(node),sourceSha256,parameters});
 }
 function visit(node:ts.Node){if(ts.isInterfaceDeclaration(node)&&/(?:Filters|Effects)$/.test(node.name.text))for(const member of node.members)if(ts.isMethodSignature(member)&&ts.isIdentifier(member.name))add(member.name.text,node.name.text,member);if(ts.isFunctionDeclaration(node)&&node.name&&node.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))add(node.name.text,'named source export',node);
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&ts.isVariableStatement(node.parent.parent)&&node.parent.parent.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))for(const signature of checker.getTypeAtLocation(node).getCallSignatures())methods.push({name:node.name.text,contract:'typed callable source export',...location(node),sourceSha256,parameters:signature.getParameters().map(symbol=>{const declaration=symbol.valueDeclaration;return describeType(symbol.name,checker.getTypeOfSymbolAtLocation(symbol,node),Boolean(symbol.flags&ts.SymbolFlags.Optional)||!!(declaration&&ts.isParameter(declaration)&&(declaration.questionToken||declaration.initializer)),node);})});
  ts.forEachChild(node,visit);}visit(source);
}
await writeFile(new URL('./PARAMETER_INDEX.json',import.meta.url),JSON.stringify({version:1,scope:'Existing declared TypeScript parameter surfaces, including inherited fields. This is a source navigation artifact, not a runtime registry or proof of official control equivalence.',sourceRoots:roots,methods},null,2)+'\n');
console.log(JSON.stringify({methods:methods.length,controls:methods.reduce((sum,m)=>sum+m.parameters.reduce((n,p)=>n+p.fields.length,0),0)}));
