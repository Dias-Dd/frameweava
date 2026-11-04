// TypeScript only reads source here: no project modules are imported or executed.
// The parent limits heap, wall time and stdout, and checks only explicit roots + dependencies.
import ts from 'typescript';
import {join,resolve,dirname} from 'node:path';
import {createRequire} from 'node:module';

try {
  const {engineRoot,roots,managedPaths={}}=JSON.parse(process.argv[2]);
  const configPath=join(engineRoot,'tsconfig.json');
  const configuration=ts.readConfigFile(configPath,ts.sys.readFile);
  const converted=ts.convertCompilerOptionsFromJson(configuration.config?.compilerOptions??{},engineRoot,configPath);
  const options={
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,
    jsx:ts.JsxEmit.ReactJSX,jsxImportSource:'@frameweave/engine',esModuleInterop:true,resolveJsonModule:true,
    ...converted.options,
    strict:true,noEmit:true,skipLibCheck:true,allowImportingTsExtensions:true,
    allowJs:true,checkJs:false,paths:{...converted.options.paths,...managedPaths},
    // Type packages come from the installed engine even when the requested file is elsewhere.
    typeRoots:[dirname(dirname(createRequire(import.meta.url).resolve('@types/node/package.json')))],types:['node'],
  };
  const host=ts.createCompilerHost(options,true);
  const canonical=file=>host.getCanonicalFileName(resolve(file));
  const edges=new Map();
  const cache=ts.createModuleResolutionCache(engineRoot,host.getCanonicalFileName,options);
  const aliases={
    '@frameweave/engine/packages':join(engineRoot,'src/packages/flat-runtime.ts'),
    '@frameweave/engine/graphics-contracts':join(engineRoot,'modules/graphics-contracts/index.ts'),
    '@frameweave/engine/stage-orchestration':join(engineRoot,'modules/stage-orchestration/types.ts'),
    '@frameweave/engine/native':join(engineRoot,'modules/native-gpu/authoring.ts'),
    '@frameweave/engine/native/react':join(engineRoot,'modules/native-gpu/react.tsx'),
    '@frameweave/engine/audio':join(engineRoot,'src/audio/index.ts'),
    '@frameweave/engine/audio/node':join(engineRoot,'src/audio/node.ts'),
  '@frameweave/engine/editing':join(engineRoot,'modules/editing/index.ts'),
  '@frameweave/engine/editing/node':join(engineRoot,'modules/editing/node.ts'),
  '@frameweave/engine/image-effects':join(engineRoot,'modules/native-effects/authoring/index.ts'),
  '@frameweave/engine/image-effects/node':join(engineRoot,'modules/native-effects/authoring/node.ts'),
  '@frameweave/engine/spatial-vfx':join(engineRoot,'modules/spatial-vfx/stage.ts'),
  '@frameweave/engine/typography':join(engineRoot,'modules/pro-animation/typography.ts'),
  '@frameweave/engine/typography/node':join(engineRoot,'modules/pro-animation/typography-node.ts'),
  '@frameweave/engine/servo':join(engineRoot,'modules/servo/index.ts'),
  '@frameweave/engine/servo/node':join(engineRoot,'modules/servo/node.ts'),
    '@frameweave/engine/shared-state':join(engineRoot,'src/shared-state/authoring.ts'),
    '@frameweave/engine':join(engineRoot,'src/index.ts'),
    '@frameweave/engine/node':join(engineRoot,'src/node.ts'),
    '@frameweave/engine/plugins':join(engineRoot,'src/plugins/sdk.ts'),
    '@frameweave/engine/effects':join(engineRoot,'src/plugins/builtin.ts'),
    '@frameweave/engine/jsx-runtime':join(engineRoot,'src/jsx-runtime.ts'),
    '@frameweave/engine/jsx-dev-runtime':join(engineRoot,'src/jsx-runtime.ts'),
  };
// Legacy project sources remain buildable after the product rename.
Object.assign(aliases,Object.fromEntries(Object.entries(aliases).map(([key,value])=>[key.replace('@frameweave/engine','@canvix/engine'),value])));
  function resolveImport(name,containingFile) {
    let resolvedModule;
    if(aliases[name])resolvedModule={resolvedFileName:aliases[name],extension:ts.Extension.Ts,isExternalLibraryImport:false};
    else {
      resolvedModule=ts.resolveModuleName(name,containingFile,options,host,cache).resolvedModule;
      // Preserve normal local resolution first; fallback only for bare installed packages.
      if(!resolvedModule&&!name.startsWith('.')&&!name.startsWith('/')&&!/^[a-zA-Z]:[\\/]/.test(name))
        resolvedModule=ts.resolveModuleName(name,join(engineRoot,'__frameweave_typecheck_resolver__.ts'),options,host,cache).resolvedModule;
    }
    if(resolvedModule) {
      const from=canonical(containingFile),to=canonical(resolvedModule.resolvedFileName);
      if(!edges.has(from))edges.set(from,new Set());edges.get(from).add(to);
    }
    return {resolvedModule};
  }
  host.resolveModuleNameLiterals=(literals,containingFile)=>literals.map(literal=>resolveImport(literal.text,containingFile));
  const program=ts.createProgram({rootNames:[...new Set(roots.map(root=>root.file)),join(engineRoot,'src/compiler/typecheck-assets.d.ts')],options,host});
  const syntax=program.getSyntacticDiagnostics();
  const raw=[configuration.error,...converted.errors,...(syntax.length?syntax:ts.getPreEmitDiagnostics(program))].filter(item=>item&&item.category===ts.DiagnosticCategory.Error);
  const reachability=roots.map(root=>{
    const files=new Set();const visit=file=>{if(files.has(file))return;files.add(file);for(const target of edges.get(file)??[])visit(target);};
    visit(canonical(root.file));return {...root,files};
  });
  const seen=new Set();
  const diagnostics=[];
  for(const item of raw) {
    const file=item.file?.fileName;
    const position=file&&item.start!==undefined?item.file.getLineAndCharacterOfPosition(item.start):undefined;
    const message=ts.flattenDiagnosticMessageText(item.messageText,'\n');
    const key=JSON.stringify([file,item.start,item.code,message]);if(seen.has(key))continue;seen.add(key);
    const stageIds=file?[...new Set(reachability.filter(root=>root.stageId&&root.files.has(canonical(file))).map(root=>root.stageId))]:
      [...new Set(roots.filter(root=>root.stageId&&(roots.length===1||message.replaceAll('\\','/').includes(root.file.replaceAll('\\','/')))).map(root=>root.stageId))];
    diagnostics.push({code:'E_TYPECHECK',severity:'error',message,tsCode:item.code,
      ...(file?{file:resolve(file)}:{}),...(position?{line:position.line+1,column:position.character+1}:{}),
      ...(stageIds.length?{stageId:stageIds[0]}:{}),...(stageIds.length>1?{stageIds}:{})});
    if(diagnostics.length===100)break;
  }
  const checker=program.getTypeChecker();
  const contracts=Object.create(null),unresolvedContracts=Object.create(null);
  const forbidden=ts.TypeFlags.Any|ts.TypeFlags.Unknown|ts.TypeFlags.TypeParameter|ts.TypeFlags.Never|ts.TypeFlags.Undefined|ts.TypeFlags.Void;
  const propertyType=(symbol,location)=>checker.getTypeOfSymbolAtLocation(symbol,symbol.valueDeclaration??location);
  function literalProperty(type,name,value,location) {
    const symbol=checker.getPropertyOfType(type,name);if(!symbol)return false;
    const property=propertyType(symbol,location);return Boolean(property.flags&ts.TypeFlags.StringLiteral)&&property.value===value;
  }
  function isAudioType(type,location){return literalProperty(type,'kind','audio',location)&&literalProperty(type,'schemaVersion','frameweave.audio/1',location)&&['sampleRate','channelLayout','storage','sampleCount','startSample','ownership','validRange'].every(name=>checker.getPropertyOfType(type,name));}
  function isSurfaceType(type,location) {
    if(literalProperty(type,'kind','surface',location)&&literalProperty(type,'schemaVersion','frameweave.surface/2',location))return ['format','width','height','rowStride','storage','color','alpha'].every(name=>checker.getPropertyOfType(type,name));
    if(!literalProperty(type,'kind','surface',location)||!literalProperty(type,'format','png',location))return false;
    return ['width','height','dataUrl'].every(name=>{
      const symbol=checker.getPropertyOfType(type,name);if(!symbol)return false;
      return Boolean(propertyType(symbol,location).flags&(name==='dataUrl'?ts.TypeFlags.StringLike:ts.TypeFlags.NumberLike));
    });
  }
  function isJsonType(type,location,seen=new Set(),depth=0,optional=false) {
    if(depth>40)return false;
    if(type.flags&ts.TypeFlags.Undefined)return optional;
    if(type.flags&forbidden)return false;
    if(type.flags&(ts.TypeFlags.StringLike|ts.TypeFlags.NumberLike|ts.TypeFlags.BooleanLike|ts.TypeFlags.Null))return true;
    if(isSurfaceType(type,location)||isAudioType(type,location))return false;
    if(type.isUnion())return type.types.every(member=>isJsonType(member,location,new Set(seen),depth+1,optional));
    if(seen.has(type))return true;seen.add(type);
    if(!(type.flags&ts.TypeFlags.Object)&&!type.isIntersection())return false;
    if(type.getCallSignatures().length||type.getConstructSignatures().length)return false;
    if(checker.isArrayType(type)||checker.isTupleType(type)) {
      const value=checker.getIndexTypeOfType(type,ts.IndexKind.Number);return Boolean(value)&&isJsonType(value,location,seen,depth+1);
    }
    const indexes=[checker.getIndexTypeOfType(type,ts.IndexKind.String),checker.getIndexTypeOfType(type,ts.IndexKind.Number)].filter(Boolean);
    if(indexes.some(value=>!isJsonType(value,location,new Set(seen),depth+1)))return false;
    return checker.getPropertiesOfType(type).every(symbol=>isJsonType(propertyType(symbol,location),location,new Set(seen),depth+1,Boolean(symbol.flags&ts.SymbolFlags.Optional)));
  }
  function coarseType(type,location,optional=false) {
    if(type.isUnion()) {
      const members=type.types.filter(member=>!(optional&&member.flags&ts.TypeFlags.Undefined));
      if(!members.length)return undefined;
      const types=members.map(member=>coarseType(member,location));
      if(types.every(value=>value&&value===types[0]))return types[0];
      if(members.every(member=>isJsonType(member,location)))return 'json';
      return undefined;
    }
    if(type.flags&forbidden)return undefined;
    if(type.flags&ts.TypeFlags.StringLike)return 'string';
    if(type.flags&ts.TypeFlags.NumberLike)return 'number';
    if(type.flags&ts.TypeFlags.BooleanLike)return 'boolean';
    if(isSurfaceType(type,location))return 'surface';
    if(isAudioType(type,location))return 'audio';
    return isJsonType(type,location)?'json':undefined;
  }
  function inferInputs(root) {
    const source=program.getSourceFile(root.file);if(!source)return {unresolved:['*']};
    const module=checker.getSymbolAtLocation(source);if(!module)return {unresolved:['*']};
    let exported=checker.getExportsOfModule(module).find(symbol=>symbol.name===(root.exportName??'default'));
    if(!exported)return {unresolved:['*']}; // Missing named exports retain the bundler's E_COMPILE diagnostic.
    if(exported.flags&ts.SymbolFlags.Alias)exported=checker.getAliasedSymbol(exported);
    const factoryType=propertyType(exported,source);
    const factorySignature=checker.getSignaturesOfType(factoryType,ts.SignatureKind.Call)[0];if(!factorySignature)return {unresolved:['*']};
    const returned=checker.getReturnTypeOfSignature(factorySignature);
    const instance=checker.getAwaitedType(returned)??returned;
    const render=checker.getPropertyOfType(instance,'evaluateInterval')??checker.getPropertyOfType(instance,'renderAt');if(!render)return {unresolved:['*']};
    const renderSignature=checker.getSignaturesOfType(propertyType(render,source),ts.SignatureKind.Call)[0];
    if(!renderSignature)return {unresolved:['*']};
    const inputParameter=renderSignature.getParameters()[1];if(!inputParameter)return {types:{},unresolved:[]};
    const inputType=propertyType(inputParameter,source);
    if(inputType.flags&forbidden||inputType.isUnion()||checker.getIndexTypeOfType(inputType,ts.IndexKind.String)||checker.getIndexTypeOfType(inputType,ts.IndexKind.Number))return {unresolved:['*']};
    if(!(inputType.flags&ts.TypeFlags.Object)&&!inputType.isIntersection())return {unresolved:['*']};
    const types=Object.create(null),unresolved=[];
    for(const symbol of checker.getPropertiesOfType(inputType)) {
      const optional=Boolean(symbol.flags&ts.SymbolFlags.Optional),type=coarseType(propertyType(symbol,source),source,optional);
      if(!type){unresolved.push(symbol.name);continue;}
      types[symbol.name]=optional?{type,optional:true}:type;
    }
    return {types,unresolved};
  }
  if(!diagnostics.length)for(const root of roots)if(root.stageId) {
    const inferred=inferInputs(root);
    if(inferred.types)contracts[root.stageId]=inferred.types;
    if(inferred.unresolved.length)unresolvedContracts[root.stageId]=inferred.unresolved;
  }
  process.stdout.write(JSON.stringify({ok:diagnostics.length===0,code:syntax.length?'E_COMPILE':'E_TYPECHECK',diagnostics,contracts,unresolvedContracts}));
} catch(error) {
  process.stderr.write(error?.stack??String(error));process.exitCode=1;
}
