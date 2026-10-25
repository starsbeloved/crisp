import { describe, expect, it } from 'vitest';
import { stripCaptionTags } from './captions.ts';

describe('stripCaptionTags', () => {
  it('removes bracketed voice direction tags while preserving the spoken text', () => {
    expect(stripCaptionTags('[happy] Hello, Ama. [laughs] How are you?')).toBe('Hello, Ama. How are you?');
  });
});
