// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoFixture } from './fixture.ts';
import { IncidentDebrief } from './IncidentDebrief.tsx';

describe('incident debrief', () => {
  it('shows recorded camera, check-in and staff facts with a source tag', () => {
    const state = demoFixture(10_000);
    const alert = state.alerts[0];
    const visit = state.visits.find(item => item.id === alert.visitId)!;
    const html = renderToStaticMarkup(<IncidentDebrief alert={alert} visit={visit} />);
    expect(html).toContain('Incident debrief');
    expect(html).toContain('slumped posture');
    expect(html).toContain('chest tightness');
    expect(html).toContain('Suggested next step: a human check');
    expect(html).toContain('Template');
  });
});
