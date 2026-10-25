import type { JSX } from 'react';
export type CrispState = 'idle' | 'listening' | 'thinking' | 'talking' | 'happy' | 'pointing';
export const CRISP_NAME = 'Crisp';
export function Crisp(props: { state?: CrispState; size?: number; level?: number }): JSX.Element {
  return <svg width={props.size ?? 96} height={props.size ?? 96} viewBox="0 0 100 100" role="img" aria-label={`${CRISP_NAME}, ${props.state ?? 'idle'}`}>
    <path fill="#246B45" d="M50 26Q51 4 78 10Q74 29 50 26"/><path fill="#6C4D35" d="M47 31L45 13L51 12L54 32"/>
    <path fill="#D93A3A" d="M50 29C13 7 3 56 24 81Q38 97 50 88Q64 98 80 78C100 49 85 10 50 29"/>
    <ellipse fill="white" cx="37" cy="51" rx="9" ry="12"/><ellipse fill="white" cx="65" cy="51" rx="9" ry="12"/>
    <circle cx="39" cy="53" r="4"/><circle cx="63" cy="53" r="4"/><path d="M40 72Q51 82 63 70" stroke="#1D1D1F" strokeWidth="3" fill="none"/>
  </svg>;
}
