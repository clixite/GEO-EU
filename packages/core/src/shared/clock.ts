/** Injectable clock so that tests and replays are deterministic. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Fixed clock for tests; `tick` advances by milliseconds. */
export function fixedClock(start: string | Date): Clock & { tick(ms: number): void } {
  let current = new Date(start).getTime();
  return {
    now: () => new Date(current),
    tick: (ms: number) => {
      current += ms;
    },
  };
}

export function isoNow(clock: Clock = systemClock): string {
  return clock.now().toISOString();
}
