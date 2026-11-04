// SPDX-License-Identifier: Apache-2.0
// Exact frozen Frameweave Unicode16 itemizer adapter, not a fork of Unicode algorithms.
include!("original-analysis.rs");

/// Resolve the WHOLE source paragraph first; apply upstream L1/L2 only to the
/// selected line. Result indices are local UTF16 offsets for the existing reader.
pub fn analyze_line(text:&str,base:u32,start:usize,end:usize)->Result<Analysis,String>{
 let base=match base{0=>None,1=>Some(Level::ltr()),2=>Some(Level::rtl()),_=>return Err("E_PA_TEXT_DIRECTION: expected auto/ltr/rtl".into())};
 let units:Vec<u16>=text.encode_utf16().collect();
 if start>end||end>units.len(){return Err("E_PA_TEXT_LINE_RANGE: invalid UTF16 line range".into());}
 let mut byte_at_utf16=vec![usize::MAX;units.len()+1];let mut utf16_at_byte=vec![usize::MAX;text.len()+1];let mut at=0;let mut starts=Vec::new();
 for(byte,ch)in text.char_indices(){byte_at_utf16[at]=byte;utf16_at_byte[byte]=at;starts.push(at);at+=ch.len_utf16();}
 byte_at_utf16[at]=text.len();utf16_at_byte[text.len()]=at;
 if byte_at_utf16[start]==usize::MAX||byte_at_utf16[end]==usize::MAX{return Err("E_PA_TEXT_LINE_RANGE: line boundary splits a Unicode scalar".into());}
 let mut graphemes:Vec<usize>=text.grapheme_indices(true).map(|(i,_)|i).collect();graphemes.push(text.len());
 if graphemes.binary_search(&byte_at_utf16[start]).is_err()||graphemes.binary_search(&byte_at_utf16[end]).is_err(){return Err("E_PA_TEXT_LINE_GRAPHEME: line boundary splits an extended grapheme".into());}
 let bidi=BidiInfo::new(&units,base);let length=end-start;
 let mut output=Analysis{length,paragraphs:Vec::new(),levels:Vec::new(),bidi_runs:Vec::new(),runs:Vec::new(),visual_indices:Vec::new(),candidates:Vec::new()};
 if length==0{return Ok(output);}
 let p=bidi.paragraphs.iter().find(|p|p.range.start<=start&&end<=p.range.end).ok_or("E_PA_TEXT_LINE_RANGE: line crosses a bidi paragraph")?;
 // BidiInfo.visual_runs borrows the original resolved paragraph data. No substring
 // re-analysis: explicit embeddings/isolate context on earlier lines is preserved.
 let local_info=ParagraphInfo{range:0..p.range.len(),level:p.level};
 let local=BidiInfo{text:&units[p.range.clone()],original_classes:bidi.original_classes[p.range.clone()].to_vec(),levels:bidi.levels[p.range.clone()].to_vec(),paragraphs:vec![local_info.clone()]};
 let (levels,runs)=local.visual_runs(&local_info,start-p.range.start..end-p.range.start);
 output.paragraphs.push(Paragraph{start:0,end:length,level:p.level.number()});
 for i in start..end{let control=if byte_at_utf16[i]!=usize::MAX{text[byte_at_utf16[i]..].chars().next().is_some_and(bidi_control)}else{i>start&&output.levels.last().is_some_and(|v|v[2]&2!=0)};
  output.levels.push([bidi.levels[i].number(),levels[i-p.range.start].number(),u8::from(removed_x9(bidi.original_classes[i]))|if control{2}else{0}|if bidi.original_classes[i]==BidiClass::B{4}else{0}]);
 }
 let visible:Vec<usize>=starts.iter().copied().filter(|&i|i>=start&&i<end&&!removed_x9(bidi.original_classes[i])).collect();
 let vl:Vec<Level>=visible.iter().map(|&i|levels[i-p.range.start]).collect();
 for i in BidiInfo::reorder_visual(&vl){output.visual_indices.push(visible[i]-start);}
 for local_range in runs{
  let range=local_range.start+p.range.start..local_range.end+p.range.start;let level=levels[local_range.start].number();
  if byte_at_utf16[range.start]==usize::MAX||byte_at_utf16[range.end]==usize::MAX{return Err("E_PA_TEXT_OUTPUT: bidi run splits a Unicode scalar".into());}
  output.bidi_runs.push(BidiRun{paragraph:0,start:range.start-start,end:range.end-start,level});
  let mut spans=script_spans(text,byte_at_utf16[range.start],byte_at_utf16[range.end],&utf16_at_byte,&graphemes);if level%2==1{spans.reverse();}
  for span in spans{
   let first=output.candidates.len();output.candidates.extend(span.extension.iter().map(tag));let candidates=first..output.candidates.len();
   let script=if span.flags&2!=0{0}else{Script::try_from(span.extension).map(tag).unwrap_or(0)};
   output.runs.push(Run{paragraph:0,start:span.start-start,end:span.end-start,level,script,flags:span.flags,candidates});
  }
 }
 Ok(output)
}

#[cfg(test)]
mod line_tests{
 use super::*;
 #[test]fn parent_auto_direction_is_preserved(){let text="אב 123 abc";let a=analyze_line(text,0,3,10).unwrap();assert_eq!(a.paragraphs[0].level,1);assert_eq!(a.visual_indices,vec![4,5,6,3,0,1,2]);assert_eq!(analyze("123 abc",0).unwrap().paragraphs[0].level,0);}
 #[test]fn earlier_embedding_is_preserved(){let text="a\u{202b}XYZ abc\u{202c} z";let a=analyze_line(text,0,6,9).unwrap();assert_eq!(a.levels[0][0],2);assert_eq!(a.runs[0].level,2);assert_eq!(analyze("abc",0).unwrap().runs[0].level,0);}
 #[test]fn trailing_whitespace_resets_only_for_this_line(){let text="a\u{202b}אב   גד\u{202c}";let a=analyze_line(text,0,2,7).unwrap();assert_eq!(a.levels[2][0],1);assert_eq!(a.levels[2][1],0);assert_eq!(a.levels[3][1],0);}
 #[test]fn utf16_and_grapheme_boundaries_are_not_split(){let text="A😀אב";let a=analyze_line(text,0,1,5).unwrap();assert_eq!(a.length,4);assert_eq!(a.levels[0],a.levels[1]);assert!(!a.visual_indices.contains(&1));assert!(analyze_line(text,0,2,5).is_err());assert!(analyze_line("a\u{301}b",0,1,3).is_err());}
 #[test]fn hard_paragraphs_and_invalid_ranges(){assert!(analyze_line("abc\ndef",0,0,7).is_err());assert!(analyze_line("abc",0,2,1).is_err());assert!(analyze_line("abc",0,0,4).is_err());assert!(analyze_line("abc",99,0,1).is_err());assert_eq!(analyze_line("abc",0,1,1).unwrap().length,0);}
}
