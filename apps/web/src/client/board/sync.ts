export interface SyncClip {
  readonly id: string;
  readonly ms: number;
  readonly beatMs: number;
}

export interface SyncPlan {
  readonly lead: number;
  readonly period: number;
  readonly starts: ReadonlyMap<string, number>;
}

export const syncPlan = (clips: readonly SyncClip[]): SyncPlan => {
  const lead = Math.max(0, ...clips.map((clip) => clip.beatMs));
  const starts = new Map(clips.map((clip) => [clip.id, lead - clip.beatMs]));

  const period = Math.max(
    lead + 1,
    ...clips.map((clip) => (starts.get(clip.id) ?? 0) + clip.ms)
  );

  return { lead, period, starts };
};

export const cycleOf = (plan: SyncPlan, now: number) =>
  Math.floor(Math.max(0, now) / plan.period);

export const phaseOf = (plan: SyncPlan, now: number) =>
  Math.max(0, now) - cycleOf(plan, now) * plan.period;

export const clipTime = (plan: SyncPlan, clip: SyncClip, now: number) => {
  const start = plan.starts.get(clip.id) ?? 0;

  return Math.min(clip.ms, Math.max(0, phaseOf(plan, now) - start));
};

export const hasStarted = (
  plan: SyncPlan,
  clip: Pick<SyncClip, "id">,
  now: number
) => phaseOf(plan, now) >= (plan.starts.get(clip.id) ?? 0);
