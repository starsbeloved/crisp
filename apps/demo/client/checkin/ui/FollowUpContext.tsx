import type { FollowUpPrompt } from '../followup.ts';

export function FollowUpContext({ prompt }: { prompt: FollowUpPrompt | null }) {
  if (!prompt) return null;
  return <div className="checkin-followup-context" role="status">
    <span className="checkin-followup-source">{prompt.source === 'gemini' ? 'Gemini follow-up' : 'Template fallback'}</span>
    <p>{prompt.why}</p>
  </div>;
}
