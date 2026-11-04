/** Lower empty grouped GLSL case labels before IR creation, so each exclusive
 * branch gets distinct call-result identities. Active fallthrough is untouched.
 * Input here is the fixed shader library, not arbitrary authored scene code. */
export function groupedCases(source){
 const clean=source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,s=>s.replace(/[^\n]/g,' '));
 const lower=text=>{const match=/\bswitch\s*\([^)]*\)\s*\{/.exec(text);if(!match)return text;const open=match.index+match[0].length-1;let depth=1,end=open+1;for(;end<text.length&&depth;end++){if(text[end]==='{')depth++;else if(text[end]==='}')depth--;}if(depth)throw Error('Unclosed fixed GLSL switch');
  const body=text.slice(open+1,end-1),labels=[];depth=0;
  for(let i=0;i<body.length;i++){if(body[i]==='{')depth++;else if(body[i]==='}')depth--;else if(depth===0&&(!i||!/\w/.test(body[i-1]))){const label=/^(?:case\s+[^:]+|default)\s*:/.exec(body.slice(i));if(label){labels.push({start:i,end:i+label[0].length,label:label[0]});i+=label[0].length-1;}}}
  const cases=labels.map((entry,i)=>({...entry,body:lower(body.slice(entry.end,labels[i+1]?.start??body.length))}));
  const rebuilt=cases.map((entry,i)=>{if(entry.body.trim())return entry.label+entry.body;const next=cases.slice(i+1).find(c=>c.body.trim());return entry.label+' {\n'+(next?.body??'break;')+'\n}\n';}).join('');
  return text.slice(0,open+1)+body.slice(0,labels[0]?.start??body.length)+rebuilt+'}'+lower(text.slice(end));
 };return lower(clean);
}
