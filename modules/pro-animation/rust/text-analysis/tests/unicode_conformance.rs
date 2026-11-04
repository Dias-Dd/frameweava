// SPDX-License-Identifier: Apache-2.0
// Native, independent official Unicode16 expected-data comparison through the actual adapter.
// This fixture test is explicitly invoked with --ignored after fixed source hashes are verified.
use std::{fs::{self,File},io::{BufRead,BufReader,BufWriter,Write},path::PathBuf,time::Instant};
use fw_bindgen_module::analysis::{analyze,Analysis};
fn data_dir()->PathBuf{PathBuf::from(std::env::var("FRAMEWEAVE_UCD16").expect("Explicit fixed Unicode16 test-data directory required"))}
fn out_dir()->PathBuf{PathBuf::from(std::env::var("FRAMEWEAVE_BIDI_TEST_OUTPUT").expect("Explicit worktree-local test output required"))}
fn lines(file:&str)->impl Iterator<Item=(usize,String)>{BufReader::new(File::open(data_dir().join(file)).unwrap()).lines().enumerate().map(|(i,s)|(i+1,s.unwrap()))}
fn compare(actual:&Analysis,starts:&[usize],levels:&[Option<u8>],order:&[usize])->bool{
 actual.levels.len()==actual.length&&starts.iter().all(|&i|i<actual.length)&&levels.len()==starts.len()
 &&levels.iter().zip(starts).all(|(expected,&i)|expected.is_none_or(|n|actual.levels[i][1]==n))
 &&actual.visual_indices==order.iter().map(|&i|starts[i]).collect::<Vec<_>>()
}
fn parse_levels(s:&str)->Vec<Option<u8>>{s.split_whitespace().map(|n|if n=="x"{None}else{Some(n.parse().unwrap())}).collect()}
fn parse_order(s:&str)->Vec<usize>{s.split_whitespace().map(|n|n.parse().unwrap()).collect()}
fn starts(text:&str)->Vec<usize>{let mut n=0;let mut out=Vec::new();for c in text.chars(){out.push(n);n+=c.len_utf16();}out}

#[test]#[ignore="Explicit pinned official PropList; run after hash verification"]
fn official_bidi_control_property(){
 let mut expected=std::collections::HashSet::new();
 for (_,line) in lines("PropList.txt"){let s=line.split('#').next().unwrap().trim();if s.is_empty(){continue;}let fields:Vec<_>=s.split(';').map(str::trim).collect();if fields[1]!="Bidi_Control"{continue;}let range:Vec<_>=fields[0].split("..").map(|s|u32::from_str_radix(s,16).unwrap()).collect();for n in range[0]..=*range.last().unwrap(){expected.insert(n);}}
 assert_eq!(expected.len(),12);let mut checked=0;
 for n in 0..=0x10ffff{if let Some(ch)=char::from_u32(n){assert_eq!(fw_bindgen_module::analysis::bidi_control(ch),expected.contains(&n),"U+{n:04X}");checked+=1;}}
 fs::create_dir_all(out_dir()).unwrap();fs::write(out_dir().join("control-property.json"),format!("{{\"unicode\":\"16.0.0\",\"scalarValuesChecked\":{checked},\"bidiControls\":12,\"mismatches\":0}}")).unwrap();
}

#[test]#[ignore="Explicit pinned official corpus; run via validation after hash verification"]
fn official_character_cases(){
 let begin=Instant::now();fs::create_dir_all(out_dir()).unwrap();let mut failures=BufWriter::new(File::create(out_dir().join("character-failures.txt")).unwrap());let mut total=0;let mut failed=0;
 for (line_number,line) in lines("BidiCharacterTest.txt"){
  let s=line.split('#').next().unwrap().trim();if s.is_empty(){continue;}let fields:Vec<&str>=s.split(';').collect();assert_eq!(fields.len(),5);
  let text:String=fields[0].split_whitespace().map(|p|char::from_u32(u32::from_str_radix(p,16).unwrap()).expect("Official case scalar must be valid")).collect();
  let mode=match fields[1].trim(){"0"=>1,"1"=>2,"2"=>0,_=>panic!("Unknown corpus direction")};let expected_base:u8=fields[2].trim().parse().unwrap();let expected_levels=parse_levels(fields[3]);let expected_order=parse_order(fields[4]);let offsets=starts(&text);
  let result=analyze(&text,mode);total+=1;let ok=result.as_ref().is_ok_and(|a|a.paragraphs.len()==1&&a.paragraphs[0].level==expected_base&&compare(a,&offsets,&expected_levels,&expected_order));
  if !ok{failed+=1;writeln!(failures,"line {line_number}: input={s}; actual={result:?}").unwrap();}
 }
 failures.flush().unwrap();let ms=begin.elapsed().as_secs_f64()*1000.;let report=format!("{{\"corpus\":\"BidiCharacterTest16\",\"total\":{total},\"passed\":{},\"failed\":{failed},\"skipped\":0,\"ms\":{ms},\"scope\":\"Through L2, not glyph shaping L3/L4 or soft wraps\"}}",total-failed);fs::write(out_dir().join("character-conformance.json"),&report).unwrap();println!("{report}");assert_eq!(failed,0,"Original failure details retained in worktree");
}

fn representative(class:&str)->char{match class{
 "L"=>'a',"R"=>'\u{05d0}',"AL"=>'\u{0627}',"EN"=>'0',"ES"=>'+',"ET"=>'$',"AN"=>'\u{0660}',"CS"=>',',"NSM"=>'\u{0300}',"BN"=>'\u{00ad}',"B"=>'\u{2029}',"S"=>'\t',"WS"=>' ',"ON"=>'!',"LRE"=>'\u{202a}',"LRO"=>'\u{202d}',"RLE"=>'\u{202b}',"RLO"=>'\u{202e}',"PDF"=>'\u{202c}',"LRI"=>'\u{2066}',"RLI"=>'\u{2067}',"FSI"=>'\u{2068}',"PDI"=>'\u{2069}',_=>panic!("Unknown corpus class")}}
#[test]#[ignore="Explicit pinned official corpus; run via validation after hash verification"]
fn official_property_cases(){
 let begin=Instant::now();fs::create_dir_all(out_dir()).unwrap();let mut failures=BufWriter::new(File::create(out_dir().join("property-failures.txt")).unwrap());let mut total=0;let mut failed=0;let mut levels=Vec::new();let mut order=Vec::new();let mut data_rows=0;
 for (line_number,line) in lines("BidiTest.txt"){
  let s=line.split('#').next().unwrap().trim();if s.is_empty(){continue;}
  if let Some(values)=s.strip_prefix("@Levels:"){levels=parse_levels(values);continue;}if let Some(values)=s.strip_prefix("@Reorder:"){order=parse_order(values);continue;}if s.starts_with('@'){continue;}
  let fields:Vec<&str>=s.split(';').collect();assert_eq!(fields.len(),2);let classes:Vec<&str>=fields[0].split_whitespace().collect();let text:String=classes.iter().map(|c|{let ch=representative(c);assert_eq!(format!("{:?}",unicode_bidi::bidi_class(ch)),*c);ch}).collect();let directions=u8::from_str_radix(fields[1].trim(),16).unwrap();let offsets=starts(&text);data_rows+=1;
  for (bit,mode) in [(1,0),(2,1),(4,2)]{if directions&bit==0{continue;}let result=analyze(&text,mode);total+=1;let ok=result.as_ref().is_ok_and(|a|compare(a,&offsets,&levels,&order));if !ok{failed+=1;writeln!(failures,"line {line_number} base {mode}: input={s}; actual={result:?}").unwrap();}}
 }
 failures.flush().unwrap();let ms=begin.elapsed().as_secs_f64()*1000.;let report=format!("{{\"corpus\":\"BidiTest16\",\"dataRows\":{data_rows},\"total\":{total},\"passed\":{},\"failed\":{failed},\"skipped\":0,\"ms\":{ms},\"scope\":\"All specified base directions; one asserted real representative/class, not code-specific bracket tests\"}}",total-failed);fs::write(out_dir().join("property-conformance.json"),&report).unwrap();println!("{report}");assert_eq!(failed,0,"Original failure details retained in worktree");
}
