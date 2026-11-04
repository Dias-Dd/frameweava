import { EngineError } from './errors.js';

export interface FixedStepSimulation<S> {
  reset():void;
  /** One absolute numbered step; dt is constant, independent of seek requests. */
  step(dt:number,frame:number):void;
  snapshot():S;
  restore(snapshot:S):void;
}
export interface FixedStepOptions { fps:number; checkpointInterval?:number; maxCheckpoints?:number; maxSteps?:number }
/**
 * Frame 0 is the reset state. Seek restores a bounded checkpoint then replays fixed steps.
 * Snapshots must be structured-cloneable values, rather than live physics engine objects.
 */
export class FixedStepRunner<S> {
  private readonly checkpoints=new Map<number,S>();
  private current=0;
  private readonly interval:number;
  private readonly maxCheckpoints:number;
  private readonly maxSteps:number;
  private readonly dt:number;
  constructor(private readonly simulation:FixedStepSimulation<S>,options:FixedStepOptions) {
    if (!Number.isFinite(options.fps)||options.fps<=0) throw new EngineError('E_SIMULATION','Simulation FPS must be positive.');
    this.interval=options.checkpointInterval??30;this.maxCheckpoints=options.maxCheckpoints??32;this.maxSteps=options.maxSteps??100000;
    if (!Number.isSafeInteger(this.interval)||this.interval<1||!Number.isSafeInteger(this.maxCheckpoints)||this.maxCheckpoints<2||!Number.isSafeInteger(this.maxSteps)||this.maxSteps<1)
      throw new EngineError('E_SIMULATION','Invalid checkpoint or replay limits.');
    this.dt=1/options.fps; this.simulation.reset(); this.save(0);
  }
  private save(frame:number):void {
    this.checkpoints.set(frame,structuredClone(this.simulation.snapshot()));
    while (this.checkpoints.size>this.maxCheckpoints) {
      // Preserve reset checkpoint; evict oldest nonzero insertion.
      const oldest=[...this.checkpoints.keys()].find(key=>key!==0)!;this.checkpoints.delete(oldest);
    }
  }
  seek(frame:number):S {
    if (!Number.isSafeInteger(frame)||frame<0) throw new EngineError('E_SIMULATION_FRAME','Fixed-step simulation requires a nonnegative integer local frame.');
    if (frame<this.current) {
      const checkpoint=Math.max(...[...this.checkpoints.keys()].filter(key=>key<=frame));
      this.simulation.restore(structuredClone(this.checkpoints.get(checkpoint)!));this.current=checkpoint;
    } else {
      const checkpoint=Math.max(...[...this.checkpoints.keys()].filter(key=>key<=frame));
      if (checkpoint>this.current) {this.simulation.restore(structuredClone(this.checkpoints.get(checkpoint)!));this.current=checkpoint;}
    }
    if (frame-this.current>this.maxSteps) throw new EngineError('E_SIMULATION_LIMIT',`Seek needs ${frame-this.current} replay steps, exceeding ${this.maxSteps}.`);
    while (this.current<frame) {
      this.current++;this.simulation.step(this.dt,this.current);
      if (this.current%this.interval===0) this.save(this.current);
    }
    return structuredClone(this.simulation.snapshot());
  }
  reset():void { this.simulation.reset();this.current=0;this.checkpoints.clear();this.save(0); }
  get checkpointFrames():number[] { return [...this.checkpoints.keys()].sort((a,b)=>a-b); }
}
