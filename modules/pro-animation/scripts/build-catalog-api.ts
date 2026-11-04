import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import type {CatalogCallable,CatalogMethodGroup,CatalogPackageApi,CatalogSignature} from '../../../src/capabilities/catalog-api.ts';
import {packageRef,type PackageRecord} from '../../../src/packages/manifest.ts';
import {runtimePin} from '../../../src/compiler/runtime-lock.ts';

function signatureContract(checker:ts.TypeChecker,signature:ts.Signature):CatalogSignature{
  return {
    parameters:signature.getParameters().map(parameter=>{
      const declaration=parameter.valueDeclaration;
      return {name:parameter.name,type:checker.typeToString(checker.getTypeOfSymbol(parameter)),
        optional:!!(parameter.flags&ts.SymbolFlags.Optional)||!!(declaration&&ts.isParameter(declaration)&&(declaration.questionToken||declaration.initializer))};
    }),
    returns:checker.typeToString(signature.getReturnType()),
  };
}

function methodGroups(checker:ts.TypeChecker,program:ts.Program,signatures:readonly ts.Signature[],name:string){
  const groups=new Map<string,Map<string,CatalogSignature[]>>();
  const methods=(type:ts.Type)=>{
    if(checker.isArrayType(type)||checker.isTupleType(type))return [];
    return type.getProperties().filter(property=>
      property.declarations?.some(declaration=>!program.isSourceFileDefaultLibrary(declaration.getSourceFile()))&&
      checker.getTypeOfSymbol(property).getCallSignatures().length>0);
  };
  function add(path:string,properties:ts.Symbol[]){
    if(!properties.length)return;
    const names=groups.get(path)??new Map<string,CatalogSignature[]>();
    for(const property of properties){
      const contracts=checker.getTypeOfSymbol(property).getCallSignatures().map(signature=>signatureContract(checker,signature));
      const merged=[...names.get(property.name)??[],...contracts];
      names.set(property.name,[...new Map(merged.map(contract=>[JSON.stringify(contract),contract])).values()]);
    }
    groups.set(path,names);
  }
  function callbacks(path:string,signature:ts.Signature){
    for(const parameter of signature.getParameters()){
      for(const callback of checker.getTypeOfSymbol(parameter).getCallSignatures()){
        for(const argument of callback.getParameters()){
          add(`${path} → ${parameter.name} → ${argument.name}`,methods(checker.getTypeOfSymbol(argument)));
        }
      }
    }
  }
  for(const signature of signatures){
    callbacks(name,signature);
    const value=checker.getAwaitedType(signature.getReturnType())??signature.getReturnType();
    const properties=methods(value);
    add(`${name}()`,properties);
    for(const property of properties){
      for(const method of checker.getTypeOfSymbol(property).getCallSignatures()){
        callbacks(`${name}().${property.name}`,method);
      }
    }
  }
  return [...groups].map(([path,names]):CatalogMethodGroup=>({path,methods:[...names.keys()].sort(),signatures:Object.fromEntries(names)}));
}

/** Read declarations with TypeScript. Catalog generation never imports or runs a library. */
export function buildCatalogApi(workspace:string,records:PackageRecord[]):CatalogPackageApi[]{
  const providers=records.flatMap(record=>record.manifest.bindings&&!record.manifest.bindings.forward?
    [{reference:packageRef(record.manifest),integrity:record.integrity,sdkImport:undefined,
      known:new Set(record.manifest.bindings.gpuExports),types:resolve(record.directory,record.manifest.bindings.types)}]:[]);
  const pkg=JSON.parse(readFileSync(join(workspace,'package.json'),'utf8')) as {name:string;exports:Record<string,{types?:string}>};
  const sdk=Object.entries(pkg.exports).flatMap(([subpath,target])=>{
    if(!target.types)return [];
    const sdkImport=subpath==='.'?pkg.name:pkg.name+subpath.slice(1);
    return [{reference:`${sdkImport}@${runtimePin.engineVersion}`,integrity:runtimePin.integrity,sdkImport,
      known:new Set<string>(),types:resolve(workspace,target.types)}];
  });
  const sources=[...providers,...sdk];
  const config=ts.readConfigFile(join(workspace,'tsconfig.json'),ts.sys.readFile);
  const options=ts.convertCompilerOptionsFromJson(config.config.compilerOptions,workspace).options;
  const program=ts.createProgram(sources.map(provider=>provider.types),options);
  const checker=program.getTypeChecker();
  return sources.map(({reference,integrity,sdkImport,known,types})=>{
    const file=program.getSourceFile(types),module=file&&checker.getSymbolAtLocation(file);
    if(!module)throw Error(`Missing callable declaration module for ${reference}`);
    const callables=checker.getExportsOfModule(module).flatMap((exported):CatalogCallable[]=>{
      if(!/^[$A-Za-z_][$\w]*$/.test(exported.name)||exported.name==='default')return [];
      const symbol=exported.flags&ts.SymbolFlags.Alias?checker.getAliasedSymbol(exported):exported;
      const signatures=checker.getTypeOfSymbol(symbol).getCallSignatures();
      if(!known.has(exported.name)&&(!(symbol.flags&ts.SymbolFlags.Value)||!signatures.length))return [];
      const description=ts.displayPartsToString(symbol.getDocumentationComment(checker)).slice(0,512);
      const groups=methodGroups(checker,program,signatures,exported.name);
      return [{name:exported.name,...description?{description}:{},...groups.length?{groups}:{},
        ...signatures.length?{signatures:signatures.map(signature=>signatureContract(checker,signature))}:{}}];
    }).sort((a,b)=>a.name.localeCompare(b.name));
    return {reference,integrity,sdkImport,callables};
  });
}
