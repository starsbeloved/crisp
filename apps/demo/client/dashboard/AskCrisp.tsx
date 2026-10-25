import { useState, type FormEvent } from 'react';
import { api } from '../lib/api.ts';
import { Crisp } from '../ui/Crisp.tsx';
import { AskCrispVoice } from './AskCrispVoice.tsx';
import { sourceLabel } from './presentation.ts';
export function AskCrisp({ synthetic }: { synthetic: boolean }) {
  const [question, setQuestion] = useState(''), [answer, setAnswer] = useState<{ answer: string; source: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!question.trim() || busy) return;
    setBusy(true); setError('');
    try { setAnswer(await api.ask(question.trim())); } catch { setError('Crisp could not answer. Please try again.'); } finally { setBusy(false); }
  }
  return <section className="panel ask-crisp"><div className="section-heading"><h2>Ask Crisp</h2><Crisp size={44} state={busy ? 'thinking' : 'idle'} /></div>
    <p>Ask about the recorded room timeline.</p>
    <form onSubmit={submit}><label htmlFor="crisp-question">Question for Crisp</label><div className="ask-input"><input id="crisp-question" value={question} onChange={e => setQuestion(e.target.value)} placeholder="What happened with Ama?" maxLength={2000} /><button disabled={busy || !question.trim() || synthetic}>{busy ? 'Asking…' : 'Ask'}</button></div></form>
    {synthetic ? <small>SYNTHETIC preview · Ask Crisp uses the live server and is disabled here.</small> : <AskCrispVoice />}
    {answer && <div aria-live="polite"><p>{answer.answer}</p><span className="tag">{sourceLabel(answer.source)}</span></div>}{error && <p role="alert">{error}</p>}
  </section>;
}
