import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../../client/App.tsx';
it('reserves distinct station, phone and text-only questionnaire paths without starting sensors', () => {
  const station=renderToStaticMarkup(<App pathname="/station"/>);
  expect(station).toContain('href="/check-in"');
  expect(station).toContain('href="/vision"');
  expect(station).toContain('href="/staff"');
  const phone = renderToStaticMarkup(<App pathname="/phone"/>);
  expect(phone).toContain('Phone pulse check'); expect(phone).toContain('Camera has not started');
  const questionnaire = renderToStaticMarkup(<App pathname="/questionnaire"/>);
  expect(questionnaire).toContain('Continue your check-in'); expect(questionnaire).toContain('Check-in code');
  expect(questionnaire).not.toContain('<video');
  expect(renderToStaticMarkup(<App pathname="/other"/>)).toContain('Page not found');
});
