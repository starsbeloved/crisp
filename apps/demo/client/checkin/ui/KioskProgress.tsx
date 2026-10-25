import type { Step } from '../controller-types.ts';

const progress: Record<Step, number> = { welcome: 1, name: 1, face: 2, questions: 3, followup: 4, done: 5 };

export function KioskProgress({ step }: { step: Step }) {
  return <div className="checkin-progress" aria-label={`Step ${progress[step]} of 5`}>
    <small>Step {progress[step]} of 5 · {({ welcome: 'Your details', name: 'Your details', face: 'Face scan', questions: 'Three questions', followup: 'Follow-up', done: 'Take a seat' })[step]}</small>
    {[1, 2, 3, 4, 5].map(value => <span key={value} className={value <= progress[step] ? 'is-complete' : undefined} aria-hidden="true" />)}
  </div>;
}
