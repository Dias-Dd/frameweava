// Same source is instantiated independently in each Web Stage / Worker / Node process.
let value=0,calls=0;
export const get=()=>value;
export const set=next=>{value=next;};
export const tick=()=>++calls;
