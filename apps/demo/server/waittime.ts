import type { Visit } from '../shared/types.ts';

export interface WaitTimeBoardData {
  minutesBetweenCalls: number;
  usingFallback: boolean;
  waiting: { queueNo: number; initial: string; peopleAhead: number; minutes: number }[];
}

/** Public queue estimates, based only on recorded call-in times and arrival order. */
export function estimateWaitTimes(visits: Visit[]): WaitTimeBoardData {
  const calls = visits
    .filter(visit => visit.status === 'called' && visit.calledAt !== null && Number.isFinite(visit.calledAt))
    .map(visit => visit.calledAt!)
    .sort((a, b) => a - b)
    .slice(-5);
  const usingFallback = calls.length < 2;
  let minutesBetweenCalls = 12;
  if (!usingFallback) {
    const gaps = calls.slice(1).map((at, i) => (at - calls[i]) / 60_000).sort((a, b) => a - b);
    const middle = Math.floor(gaps.length / 2);
    minutesBetweenCalls = gaps.length % 2 ? gaps[middle] : (gaps[middle - 1] + gaps[middle]) / 2;
  }
  return {
    minutesBetweenCalls, usingFallback,
    waiting: visits.filter(visit => visit.status === 'waiting').sort((a, b) => a.queueNo - b.queueNo)
      .map((visit, peopleAhead) => ({
        queueNo: visit.queueNo,
        initial: `${Array.from(visit.name.trim())[0]?.toLocaleUpperCase() ?? '?'}.`,
        peopleAhead,
        minutes: Math.round(minutesBetweenCalls * peopleAhead),
      })),
  };
}
