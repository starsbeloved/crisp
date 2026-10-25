import { useId, type CSSProperties, type JSX } from 'react';

export type CrispState = 'idle' | 'listening' | 'thinking' | 'talking' | 'happy' | 'pointing';
export const CRISP_NAME = 'Crisp';

type Arm = { path: string; wrist: string };
type Pose = { left: Arm; right: Arm; pupil: string; lean?: string; open?: boolean };
const downLeft: Arm = { path: 'M62 144 C42 154 37 169 43 184', wrist: 'translate(43 184) rotate(170)' };
const downRight: Arm = { path: 'M218 144 C238 154 243 169 237 184', wrist: 'translate(237 184) rotate(-170)' };
const hip: Arm = { path: 'M218 149 C248 158 247 187 217 188', wrist: 'translate(217 188) rotate(80)' };
const poses: Record<CrispState, Pose> = {
  idle: { left: downLeft, right: downRight, pupil: 'translate(0 0)' },
  happy: { left: { path: 'M62 143 C32 141 23 119 29 99', wrist: 'translate(29 99) rotate(-8)' }, right: hip, pupil: 'translate(0 -2)', open: true },
  listening: { left: downLeft, right: { path: 'M218 134 C241 124 246 104 238 92', wrist: 'translate(238 92) rotate(8)' }, pupil: 'translate(3 -1)', lean: 'rotate(4 140 267)' },
  thinking: { left: { path: 'M62 150 C38 166 45 188 70 190', wrist: 'translate(70 190) rotate(-80)' }, right: { path: 'M218 150 C238 178 210 204 181 196', wrist: 'translate(181 196) rotate(-66)' }, pupil: 'translate(3 -6)', lean: 'rotate(-3 140 267)' },
  talking: { left: { path: 'M62 140 C38 132 26 113 32 97', wrist: 'translate(32 97) rotate(-20)' }, right: downRight, pupil: 'translate(0 1)', open: true },
  pointing: { left: { path: 'M62 150 C39 164 45 188 70 190', wrist: 'translate(70 190) rotate(-80)' }, right: { path: 'M218 140 C230 137 241 133 249 132', wrist: 'translate(249 132) rotate(84)' }, pupil: 'translate(4 0)', open: true },
};

/** Crisp's existing six states, drawn as a warm, vintage cartoon apple. */
export function Crisp({ state = 'idle', size = 96, level = 0 }: { state?: CrispState; size?: number; level?: number }): JSX.Element {
  const id = useId(), pose = poses[state] ?? poses.idle;
  const openness = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  const style = { '--crisp-mouth-scale': String(.5 + openness * .5) } as CSSProperties;
  return <svg className="crisp-character" data-state={state} width={size} height={Math.round(size * 300 / 340)} viewBox="-30 0 340 300" role="img" aria-labelledby={id} style={style}>
    <title id={id}>{CRISP_NAME} the apple, {state}</title>
    <style>{`
      .crisp-character { display:block; overflow:visible; flex:0 0 auto; }
      .crisp-arrive { transform-box:fill-box; transform-origin:center bottom; animation:crisp-settle .28s ease-out both; }
      .crisp-wave { transform-box:fill-box; transform-origin:center bottom; animation:crisp-wave .5s ease-in-out 2; }
      .crisp-talk { transform-box:fill-box; transform-origin:center; animation:crisp-talk .55s ease-in-out infinite alternate; }
      .crisp-talk-level { animation:none; transform:scaleY(var(--crisp-mouth-scale)); }
      .crisp-thought circle { animation:crisp-thought 1.2s ease-in-out infinite; }
      .crisp-thought circle:nth-child(2) { animation-delay:.2s; }
      .crisp-thought circle:nth-child(3) { animation-delay:.4s; }
      @keyframes crisp-settle { from { opacity:.7; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
      @keyframes crisp-wave { 0%,100% { transform:rotate(0); } 50% { transform:rotate(-10deg); } }
      @keyframes crisp-talk { from { transform:scaleY(.55); } to { transform:scaleY(1); } }
      @keyframes crisp-thought { 0%,100% { opacity:.3; } 50% { opacity:1; } }
      @media(prefers-reduced-motion:reduce) { .crisp-character * { animation:none!important; transition:none!important; } }
    `}</style>
    <ellipse cx="140" cy="279" rx="54" ry="5" fill="var(--c-crisp-ink)" opacity=".08" />
    <g key={state} className="crisp-arrive"><g transform={pose.lean}>
      <g fill="none" stroke="var(--c-crisp-ink)" strokeWidth="4" strokeLinecap="round"><path d="M124 207 L117 253" /><path d="M156 207 L163 253" /></g>
      <Shoe /><g transform="translate(280 0) scale(-1 1)"><Shoe /></g>
      {[pose.left, pose.right].map((arm, i) => <g key={i} fill="none" strokeLinecap="round"><path d={arm.path} stroke="var(--c-crisp-ink)" strokeWidth="7" /><path d={arm.path} stroke="var(--c-crisp-body)" strokeWidth="3.5" /></g>)}
      <path d="M140 62 C116 46 89 54 72 76 C49 103 49 153 69 183 C85 208 113 222 140 214 C167 222 195 208 211 183 C231 153 231 103 208 76 C191 54 164 46 140 62 Z" fill="var(--c-crisp-body)" stroke="var(--c-crisp-ink)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M211 96 C224 142 206 193 164 209 C196 182 209 142 211 96Z" fill="var(--c-crisp-shade)" />
      <path d="M78 91 Q86 72 104 68" fill="none" stroke="var(--c-crisp-cream)" strokeWidth="4" strokeLinecap="round" opacity=".55" />
      <path d="M140 66 Q138 49 147 36" fill="none" stroke="var(--c-crisp-ink)" strokeWidth="5" strokeLinecap="round" />
      <path d="M145 50 C157 29 180 30 194 35 C183 52 163 58 145 50Z" fill="var(--c-leaf)" stroke="var(--c-crisp-ink)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M150 48 Q167 39 186 37" fill="none" stroke="var(--c-leaf-hover)" strokeWidth="1.6" strokeLinecap="round" />
      <g fill="none" stroke="var(--c-crisp-ink)" strokeWidth="2.3" strokeLinecap="round">
        <path d={state === 'thinking' ? 'M92 88 Q108 85 122 91 M158 84 Q175 77 188 87' : 'M92 88 Q107 79 122 87 M158 87 Q173 79 188 88'} />
        <path d="m98 101-4-7m14 4-1-8m12 9 2-7m41 8-2-7m13 5 1-8m10 11 5-7" />
      </g>
      {[110, 170].map(x => <g key={x} transform={`translate(${x} 129) rotate(${x < 140 ? 8 : 12})`}>
        <ellipse rx="18" ry="27" fill="var(--c-crisp-cream)" stroke="var(--c-crisp-ink)" strokeWidth="2.5" />
        <g transform={pose.pupil}><ellipse cx="2" cy="6" rx="10" ry="18" fill="var(--c-crisp-ink)" /><path d="M0 6 6-10 10-2Z" fill="var(--c-crisp-cream)" /></g>
      </g>)}
      <ellipse cx="140" cy="151" rx="3.5" ry="4" fill="var(--c-crisp-ink)" />
      <g stroke="var(--c-crisp-ink)" strokeWidth="2" strokeLinecap="round"><path d="m78 145 8 2m-5 9 7 1m104-10 9-2m-8 12 7-1" /></g>
      {state === 'thinking' ? <path d="M129 174 Q141 170 152 175" fill="none" stroke="var(--c-crisp-ink)" strokeWidth="2.6" strokeLinecap="round" /> : <g transform="translate(140 169)"><g className={state === 'talking' ? `crisp-talk${openness > 0 ? ' crisp-talk-level' : ''}` : undefined}>
        <path d={pose.open ? 'M-23-3 Q0 6 23-3 Q14 25 0 23 Q-14 22-23-3Z' : 'M-23-3 Q0 4 23-3 Q13 12 0 11 Q-13 12-23-3Z'} fill="var(--c-crisp-ink)" stroke="var(--c-crisp-ink)" strokeWidth="2" strokeLinejoin="round" />
        <path d="M-20-1 Q0 6 20-1 Q0 12-20-1Z" fill="var(--c-crisp-cream)" />
        {pose.open && <path d="M-10 18 Q0 10 10 18 Q0 25-10 18Z" fill="var(--c-crisp-shade)" />}
      </g></g>}
      <g transform={pose.left.wrist}><g className={state === 'happy' ? 'crisp-wave' : undefined}><Glove pointing={state === 'happy'} /></g></g>
      <g transform={pose.right.wrist}><Glove pointing={state === 'pointing'} /></g>
      {state === 'thinking' && <g className="crisp-thought" fill="var(--c-text-2)"><circle cx="225" cy="71" r="3" /><circle cx="240" cy="54" r="4.5" /><circle cx="259" cy="36" r="6" /></g>}
      {state === 'listening' && <g fill="none" stroke="var(--c-leaf)" strokeWidth="2.5" strokeLinecap="round"><path d="M259 73 Q268 86 259 99M271 64 Q285 86 271 108" /></g>}
    </g></g>
  </svg>;
}

function Shoe() {
  return <g fill="var(--c-crisp-shade)" stroke="var(--c-crisp-ink)" strokeWidth="2.5" strokeLinejoin="round"><path d="M108 251 Q117 246 122 253 L123 267 Q111 271 86 269 Q82 259 103 257Z" /><path d="M85 266 Q103 267 123 265 L123 272 L85 272Z" fill="var(--c-crisp-body)" /><path d="M105 255 Q110 252 115 254" fill="none" stroke="var(--c-crisp-cream)" strokeWidth="2" strokeLinecap="round" /></g>;
}

function Glove({ pointing = false }: { pointing?: boolean }) {
  return <g fill="var(--c-crisp-cream)" stroke="var(--c-crisp-ink)" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <path d={pointing ? 'M-10-11 C-19-18-17-26-10-28 L-5-28 L-5-46 Q-5-53 1-52 Q6-52 6-46 L6-29 Q17-30 17-20 Q16-13 10-10Z' : 'M-10-10 C-20-15-20-23-15-26 Q-12-29-8-24 L-11-34 Q-13-40-8-41 Q-4-42-2-33 L-2-37 Q-2-44 3-43 Q7-43 7-34 Q12-40 16-36 Q20-32 12-20 Q16-15 10-10Z'} />
    <path d="M-6-24 Q0-18 7-22 M-5-17 2-16" fill="none" strokeWidth="1.6" />
    <path d="M-11-11 Q0-8 11-11 L12-2 Q0 2-12-2Z" />
  </g>;
}
