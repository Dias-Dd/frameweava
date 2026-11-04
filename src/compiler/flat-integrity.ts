import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validatePackage,packageRef,type PackageManifest} from '../packages/manifest.ts';
import {satisfies} from '../plugins/schema.ts';
import {engineVersion} from './runtime-lock.ts';
import {EngineError} from '../core/errors.ts';
export interface FlatCertificate {schemaVersion:1;trustedSources:string[];packages:Record<string,{manifest:PackageManifest;integrity:string;modules:Record<string,string>;dependencies:Record<string,string>}>;declarations:Record<string,string>}
const printer=ts.createPrinter({newLine:ts.NewLineKind.LineFeed});
export const statementHash=(statement:ts.Statement,source:ts.SourceFile)=>createHash('sha256').update(printer.printNode(ts.EmitHint.Unspecified,statement,source)).digest('hex');
const problem=(message:string):never=>{throw new EngineError('E_FLAT_INTEGRITY',message,{hint:'Re-export the reviewed authoring project to update embedded package identities; do not silently refresh seals.'});};
function literal(n:ts.Expression):unknown{
 if(ts.isAsExpression(n)||ts.isSatisfiesExpression(n)||ts.isParenthesizedExpression(n))return literal(n.expression);
 if(ts.isStringLiteral(n)||ts.isNoSubstitutionTemplateLiteral(n))return n.text;if(ts.isNumericLiteral(n))return Number(n.text);
 if(n.kind===ts.SyntaxKind.TrueKeyword)return true;if(n.kind===ts.SyntaxKind.FalseKeyword)return false;if(n.kind===ts.SyntaxKind.NullKeyword)return null;
 if(ts.isArrayLiteralExpression(n))return n.elements.map(e=>literal(e as ts.Expression));
 if(ts.isObjectLiteralExpression(n)){const out:Record<string,unknown>=Object.create(null);for(const p of n.properties){if(!ts.isPropertyAssignment(p)||!ts.isStringLiteral(p.name)&&!ts.isIdentifier(p.name))return problem('Embedded metadata must be literal');if(Object.hasOwn(out,p.name.text))problem('Duplicate embedded metadata key');out[p.name.text]=literal(p.initializer);}return out;}
 return problem('Embedded metadata must contain only data');
}
export function namedStatements(source:ts.SourceFile){const out=new Map<string,ts.Statement>();for(const statement of source.statements){const names=ts.isImportDeclaration(statement)?[...statement.importClause?.name?[statement.importClause.name.text]:[],...statement.importClause?.namedBindings?ts.isNamespaceImport(statement.importClause.namedBindings)?[statement.importClause.namedBindings.name.text]:statement.importClause.namedBindings.elements.map(e=>e.name.text):[]]:ts.isVariableStatement(statement)?statement.declarationList.declarations.flatMap(d=>ts.isIdentifier(d.name)?[d.name.text]:[]):(ts.isFunctionDeclaration(statement)||ts.isClassDeclaration(statement)||ts.isInterfaceDeclaration(statement)||ts.isTypeAliasDeclaration(statement)||ts.isEnumDeclaration(statement))&&statement.name?[statement.name.text]:[];for(const name of names){out.set(name,statement);}}return out;}
/** Parse and seal-check BEFORE the project evaluator can execute module code.
 * A seal detects drift, not hostile authors who deliberately replace code AND hashes.
 * Flat projects retain the existing trusted executable-project model. */
export function checkFlatPackages(file:string):FlatCertificate|undefined{
 if(!/\.[cm]?[jt]sx?$/.test(file))return;const text=readFileSync(file,'utf8');if(!text.includes('frameweaveEmbeddedPackages'))return;
 const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,/x$/.test(file)?ts.ScriptKind.TSX:ts.ScriptKind.TS),statements=namedStatements(source),declaration=statements.get('frameweaveEmbeddedPackages');if(!declaration)return;
 if(!ts.isVariableStatement(declaration)||!declaration.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))return problem('Embedded certificate must be exported');
 const value=declaration.declarationList.declarations.find(d=>ts.isIdentifier(d.name)&&d.name.text==='frameweaveEmbeddedPackages')?.initializer;if(!value)return problem('Missing embedded certificate');const c=literal(value) as FlatCertificate;
 if(c?.schemaVersion!==1||!Array.isArray(c.trustedSources)||!c.packages||!c.declarations)problem('Invalid embedded certificate');
 for(const [ref,p]of Object.entries(c.packages)){
  validatePackage(p.manifest);if(ref!==packageRef(p.manifest)||!p.manifest.platforms.includes('web')||!satisfies(engineVersion,p.manifest.compatible))problem(`Invalid or incompatible embedded package ${ref}`);
  if(!c.trustedSources.includes(`${p.manifest.source.kind}:${p.manifest.source.authority}`))throw new EngineError('E_PACKAGE_TRUST',`Unapproved embedded source for ${ref}`);
  if(!/^sha256-[a-f0-9]{64}$/.test(p.integrity))problem('Invalid original package identity');
  for(const name of Object.keys(p.manifest.modules))if(!/^sha256-[a-f0-9]{64}$/.test(p.modules[name]))problem('Missing original module identity');
  if(Object.keys(p.dependencies).sort().join('|')!==Object.keys(p.manifest.dependencies??{}).sort().join('|'))problem('Incomplete embedded dependencies');for(const [id,target]of Object.entries(p.dependencies))if(!c.packages[target]||c.packages[target].manifest.id!==id||!satisfies(c.packages[target].manifest.version,p.manifest.dependencies![id]))problem('Invalid embedded dependency graph');
 }
 if(!Object.keys(c.declarations).length)problem('Missing executable package seals');
 for(const [name,hash]of Object.entries(c.declarations)){const statement=statements.get(name);if(!statement||statementHash(statement,source)!==hash)problem(`Embedded declaration changed: ${name}`);}
 return c;
}
