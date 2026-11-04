// SPDX-License-Identifier: Apache-2.0
// Original unicode-bidi/segmentation/script kernels remain unchanged registry dependencies.
// This module maps their outputs to UTF16 transport and maximal compatible Script_Extensions spans.
use unicode_bidi::{utf16::BidiInfo, BidiClass, Level, ParagraphInfo};
use unicode_script::{Script, ScriptExtension, UnicodeScript};
use unicode_segmentation::UnicodeSegmentation;

#[derive(Debug)]
pub struct Paragraph {pub start:usize,pub end:usize,pub level:u8}
#[derive(Debug)]
pub struct BidiRun {pub paragraph:usize,pub start:usize,pub end:usize,pub level:u8}
#[derive(Debug)]
pub struct Run {pub paragraph:usize,pub start:usize,pub end:usize,pub level:u8,pub script:u32,pub flags:u32,pub candidates:std::ops::Range<usize>}
#[derive(Debug)]
pub struct Analysis {
 pub length:usize,pub paragraphs:Vec<Paragraph>,pub levels:Vec<[u8;3]>,
 pub bidi_runs:Vec<BidiRun>,pub runs:Vec<Run>,pub visual_indices:Vec<usize>,pub candidates:Vec<u32>,
}
pub fn bidi_control(c:char)->bool {matches!(c as u32,0x061c|0x200e..=0x200f|0x202a..=0x202e|0x2066..=0x2069)}
pub fn removed_x9(c:BidiClass)->bool {matches!(c,BidiClass::RLE|BidiClass::LRE|BidiClass::RLO|BidiClass::LRO|BidiClass::PDF|BidiClass::BN)}
fn tag(script:Script)->u32 {u32::from_be_bytes(script.short_name().as_bytes().try_into().expect("Original ISO15924 short names are four ASCII bytes"))}

struct Span {start:usize,end:usize,extension:ScriptExtension,flags:u32}
fn script_spans(text:&str,start:usize,end:usize,utf16_at_byte:&[usize],grapheme_bytes:&[usize])->Vec<Span>{
 let mut result:Vec<Span>=Vec::new();
 for (relative,grapheme) in text[start..end].grapheme_indices(true){
  let a=start+relative;let b=a+grapheme.len();let mut extension:ScriptExtension=Script::Common.into();let mut conflict=false;
  for ch in grapheme.chars(){
   if bidi_control(ch){continue;}
   let next=extension.intersection(ch.script_extension());
   if next.is_empty()&&!extension.is_empty()&&!ch.script_extension().is_empty(){conflict=true;extension=extension.union(ch.script_extension());}
   else{extension=next;}
  }
  let flags=u32::from(grapheme_bytes.binary_search(&a).is_err()||grapheme_bytes.binary_search(&b).is_err())|if conflict{2}else{0};
  if let Some(previous)=result.last_mut(){
   let common=previous.extension.intersection(extension);
   if !common.is_empty()&&previous.flags==flags&&flags==0 {previous.end=utf16_at_byte[b];previous.extension=common;continue;}
  }
  result.push(Span{start:utf16_at_byte[a],end:utf16_at_byte[b],extension,flags});
 }
 result
}

/// UAX9 data version and script/grapheme versions are pinned to the same Unicode release.
/// Full resolved levels and original visual Bidi runs are kept independent of script policy.
pub fn analyze(text:&str,base:u32)->Result<Analysis,String>{
 let base=match base{0=>None,1=>Some(Level::ltr()),2=>Some(Level::rtl()),_=>return Err("E_PA_TEXT_DIRECTION: expected auto/ltr/rtl".into())};
 let units:Vec<u16>=text.encode_utf16().collect();let length=units.len();
 u32::try_from(length).map_err(|_|"E_PA_TEXT_RANGE: UTF16 index exceeds transport")?;
 let mut byte_at_utf16=vec![usize::MAX;length+1];let mut utf16_at_byte=vec![usize::MAX;text.len()+1];let mut offset=0;
 let mut char_starts=Vec::new();let mut controls=vec![0u8;length];
 for (byte,ch) in text.char_indices(){byte_at_utf16[offset]=byte;utf16_at_byte[byte]=offset;char_starts.push(offset);if bidi_control(ch){for at in offset..offset+ch.len_utf16(){controls[at]|=2;}}offset+=ch.len_utf16();}
 byte_at_utf16[length]=text.len();utf16_at_byte[text.len()]=length;
 let mut grapheme_bytes:Vec<usize>=text.grapheme_indices(true).map(|(i,_)|i).collect();grapheme_bytes.push(text.len());
 let bidi=BidiInfo::new(&units,base);let mut output=Analysis{length,paragraphs:Vec::new(),levels:bidi.levels.iter().enumerate().map(|(i,l)|[l.number(),l.number(),controls[i]|u8::from(removed_x9(bidi.original_classes[i]))|if bidi.original_classes[i]==BidiClass::B {4}else{0}]).collect(),bidi_runs:Vec::new(),runs:Vec::new(),visual_indices:Vec::new(),candidates:Vec::new()};
 for (paragraph,p) in bidi.paragraphs.iter().enumerate(){
  output.paragraphs.push(Paragraph{start:p.range.start,end:p.range.end,level:p.level.number()});
  // Upstream visual_runs clones its whole levels vector. Borrow a paragraph slice and copy
  // only its already-resolved public fields, so many paragraphs do not cause quadratic copying.
  let local_info=ParagraphInfo{range:0..p.range.len(),level:p.level};
  let local=BidiInfo{text:&units[p.range.clone()],original_classes:bidi.original_classes[p.range.clone()].to_vec(),levels:bidi.levels[p.range.clone()].to_vec(),paragraphs:vec![local_info.clone()]};
  let (levels,runs)=local.visual_runs(&local_info,local_info.range.clone());
  for (i,level) in levels.iter().enumerate(){output.levels[p.range.start+i][1]=level.number();}
  // L2 codepoint map for conformance/data inspection, NOT glyph order or a display string.
  // Shaping remains responsible for combining marks (L3) and mirroring (L4).
  let a=char_starts.partition_point(|&i|i<p.range.start);let b=char_starts.partition_point(|&i|i<p.range.end);
  let starts:Vec<usize>=char_starts[a..b].iter().copied().filter(|&i|!removed_x9(bidi.original_classes[i])).collect();
  let visible_levels:Vec<Level>=starts.iter().map(|&i|levels[i-p.range.start]).collect();
  for index in BidiInfo::reorder_visual(&visible_levels){output.visual_indices.push(starts[index]);}
  for local_range in runs {
   let level=levels[local_range.start].number();let range=local_range.start+p.range.start..local_range.end+p.range.start;output.bidi_runs.push(BidiRun{paragraph,start:range.start,end:range.end,level});
   let a=byte_at_utf16[range.start];let b=byte_at_utf16[range.end];
   if a==usize::MAX||b==usize::MAX{return Err("E_PA_TEXT_OUTPUT: bidi run splits a UTF16 scalar".into());}
   let mut spans=script_spans(text,a,b,&utf16_at_byte,&grapheme_bytes);if level%2==1{spans.reverse();}
   for span in spans {
    let first=output.candidates.len();output.candidates.extend(span.extension.iter().map(tag));let candidates=first..output.candidates.len();
    let script=if span.flags&2!=0{0}else{Script::try_from(span.extension).map(tag).unwrap_or(0)};
    output.runs.push(Run{paragraph,start:span.start,end:span.end,level,script,flags:span.flags,candidates});
   }
  }
 }
 Ok(output)
}

#[cfg(test)]
mod tests {
 use super::*;
 #[test] fn versions_align(){assert_eq!(unicode_bidi::UNICODE_VERSION,(16,0,0));assert_eq!(unicode_script::UNICODE_VERSION,(16,0,0));assert_eq!(unicode_segmentation::UNICODE_VERSION,(16,0,0));}
 #[test] fn mixed_visual_order(){let a=analyze("abc אבג 123",0).unwrap();assert_eq!(a.paragraphs[0].level,0);assert_eq!(a.visual_indices,vec![0,1,2,3,8,9,10,7,6,5,4]);assert!(a.runs.iter().any(|r|r.level%2==1&&r.script==tag(Script::Hebrew)));}
 #[test] fn utf16_surrogate_mapping(){let a=analyze("A😀אב",0).unwrap();assert_eq!(a.length,5);assert_eq!(a.visual_indices.len(),4);assert!(!a.visual_indices.contains(&2));for r in a.runs{assert_ne!(r.start,2);assert_ne!(r.end,2);}}
 #[test] fn marks_and_script_extensions(){let a=analyze("a\u{301} カー",0).unwrap();assert!(a.runs.iter().any(|r|r.script==tag(Script::Latin)&&r.start==0&&r.end>=2));assert!(a.runs.iter().any(|r|r.script==tag(Script::Katakana)&&r.end==5));}
 #[test] fn controls_are_data_not_fake_glyphs(){let a=analyze("A\u{2067}אב\u{2069}Z",0).unwrap();assert_eq!(a.levels[1][2]&2,2);assert_eq!(a.levels[4][2]&2,2);assert_eq!(a.length,6);assert!(analyze("x",99).is_err());}
}
