/** Installed before authored modules. This is a repeatability aid, not a security sandbox. */
export const CLOCK_SCRIPT = `((seed) => {
  let milliseconds = 0, rng = seed >>> 0 || 1, rendering = false;
  const nativeDate = Date, nativeRAF = window.requestAnimationFrame.bind(window), nativeCancelRAF=window.cancelAnimationFrame.bind(window), pendingRAFs=new Set();
  const nativeTimeout = window.setTimeout.bind(window), nativeInterval = window.setInterval.bind(window);
  const forbidden = () => { const e = new Error('Stage animation must use renderAt(context), not an independent animation loop or timer.'); e.code = 'E_CLOCK'; throw e; };
  const hash = (s) => { let n = 2166136261; for (let i=0;i<s.length;i++) n = Math.imul(n ^ s.charCodeAt(i),16777619); return n >>> 0 || 1; };
  Math.random = () => { rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5; return (rng >>> 0) / 4294967296; };
  window.Date = new Proxy(nativeDate, { construct(target,args) { return new target(...(args.length ? args : [milliseconds])); }, apply() { return new nativeDate(milliseconds).toString(); } });
  Date.now = () => milliseconds;
  try { Object.defineProperty(performance,'now',{value:()=>milliseconds}); Object.defineProperty(performance,'timeOrigin',{value:0}); } catch {}
  window.requestAnimationFrame = (callback) => { if(rendering)return forbidden();let id;id=nativeRAF((time)=>{pendingRAFs.delete(id);callback(time)});pendingRAFs.add(id);return id; };
  window.cancelAnimationFrame = (id) => {pendingRAFs.delete(id);nativeCancelRAF(id)};
  window.setTimeout = (...args) => rendering ? forbidden() : nativeTimeout(...args);
  window.setInterval = (...args) => rendering ? forbidden() : nativeInterval(...args);
  window.__frameweaveClock = { set(ctx) { for(const id of pendingRAFs)nativeCancelRAF(id);pendingRAFs.clear();milliseconds = ctx.time * 1000; rng = hash(seed + ':' + ctx.frame); rendering = true; }, stop() { rendering = false; }, paint() { return new Promise(resolve=>nativeRAF(()=>nativeRAF(()=>resolve()))); } };
})`;
