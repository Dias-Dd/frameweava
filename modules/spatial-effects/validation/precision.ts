/** Test evidence only; never changes or quantizes algorithm output. Same abs/relative RGB
 * fixture budget as existing professional float references. Alpha and CPU state stay exact. */
export function compareFloatImages(actual:Float32Array,expected:Float32Array){
  if(actual.length!==expected.length||actual.length%4)throw Error('RGBA shape mismatch');
  let changed=0,alphaChanged=0,violations=0,maximumRgbError=0,blackError=0,whiteError=0;
  for(let i=0;i<actual.length;i++){
    if(!Number.isFinite(actual[i])||!Number.isFinite(expected[i]))throw Error('Non-finite float comparison');
    if(!Object.is(actual[i],expected[i]))changed++;
    if(i%4===3){if(!Object.is(actual[i],expected[i]))alphaChanged++;continue;}
    const d=Math.abs(actual[i]-expected[i]);maximumRgbError=Math.max(maximumRgbError,d);if(d>3e-6*Math.max(1,Math.abs(expected[i])))violations++;
    blackError=Math.max(blackError,d);const alpha=i-i%4+3;whiteError=Math.max(whiteError,Math.abs((actual[i]+1-actual[alpha])-(expected[i]+1-expected[alpha])));
  }
  return {changed,alphaChanged,violations,maximumRgbError,blackError,whiteError,accepted:alphaChanged===0&&violations===0,budget:'RGB 3e-6*max(1,abs(reference)); alpha exact; raw values never rounded'};
}
