import { useId, type CSSProperties, type JSX } from 'react';

export type CrispState = 'idle' | 'listening' | 'thinking' | 'talking' | 'happy' | 'pointing';
export const CRISP_NAME = 'Crisp';

type Point = readonly [number, number];
type Arm = { shoulder: Point; bend: Point; wrist: Point; hand?: 'open' | 'rest' | 'chin'; front?: boolean };
type Pose = { left: Arm; right: Arm; pupil: string; lean?: string; open?: boolean };
const downLeft: Arm = { shoulder: [61, 143], bend: [27, 165], wrist: [40, 192] };
const downRight: Arm = { shoulder: [219, 143], bend: [253, 165], wrist: [240, 192] };
const hip: Arm = { shoulder: [218, 143], bend: [269, 151], wrist: [232, 179] };
const poses: Record<CrispState, Pose> = {
  idle: { left: downLeft, right: downRight, pupil: 'translate(0 0)' },
  happy: { left: { shoulder: [62, 142], bend: [15, 150], wrist: [28, 104], hand: 'open' }, right: hip, pupil: 'translate(0 -2)', open: true },
  listening: { left: downLeft, right: { shoulder: [218, 145], bend: [270, 153], wrist: [258, 111], hand: 'open' }, pupil: 'translate(3 -1)', lean: 'rotate(4 140 267)' },
  thinking: { left: downLeft, right: { shoulder: [218, 150], bend: [245, 235], wrist: [164, 209], hand: 'chin', front: true }, pupil: 'translate(3 -6)', lean: 'rotate(-3 140 267)' },
  talking: { left: { shoulder: [62, 145], bend: [14, 170], wrist: [20, 151], hand: 'open' }, right: downRight, pupil: 'translate(0 1)', open: true },
  pointing: { left: downLeft, right: { shoulder: [218, 143], bend: [236, 141], wrist: [258, 141], hand: 'open' }, pupil: 'translate(4 0)', open: true },
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
      .crisp-talk { transform-box:fill-box; transform-origin:center; animation:crisp-talk .55s ease-in-out infinite alternate; }
      .crisp-talk-level { animation:none; transform:scaleY(var(--crisp-mouth-scale)); }
      .crisp-thought circle { animation:crisp-thought 1.2s ease-in-out infinite; }
      .crisp-thought circle:nth-child(2) { animation-delay:.2s; }
      .crisp-thought circle:nth-child(3) { animation-delay:.4s; }
      @keyframes crisp-settle { from { opacity:.7; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
      @keyframes crisp-talk { from { transform:scaleY(.55); } to { transform:scaleY(1); } }
      @keyframes crisp-thought { 0%,100% { opacity:.3; } 50% { opacity:1; } }
      @media(prefers-reduced-motion:reduce) { .crisp-character * { animation:none!important; transition:none!important; } }
    `}</style>
    <ellipse cx="140" cy="279" rx="54" ry="5" fill="var(--c-crisp-ink)" opacity=".08" />
    <g key={state} className="crisp-arrive"><g transform={pose.lean}>
      <g fill="none" stroke="var(--c-crisp-ink)" strokeWidth="4" strokeLinecap="round"><path d="M124 207 L117 253" /><path d="M156 207 L163 253" /></g>
      <Shoe /><g transform="translate(280 0) scale(-1 1)"><Shoe /></g>
      {[pose.left, pose.right].map((arm, i) => !arm.front && <ArmStroke key={i} arm={arm} />)}
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
      {[pose.left, pose.right].map((arm, i) => <g key={i}>
        {arm.front && <ArmStroke arm={arm} />}
        <Hand arm={arm} />
      </g>)}
      {state === 'thinking' && <g className="crisp-thought" fill="var(--c-text-2)"><circle cx="225" cy="71" r="3" /><circle cx="240" cy="54" r="4.5" /><circle cx="259" cy="36" r="6" /></g>}
      {state === 'listening' && <g fill="none" stroke="var(--c-leaf)" strokeWidth="2.5" strokeLinecap="round"><path d="M259 73 Q268 86 259 99M271 64 Q285 86 271 108" /></g>}
    </g></g>
  </svg>;
}

function Shoe() {
  return <g fill="var(--c-crisp-shade)" stroke="var(--c-crisp-ink)" strokeWidth="2.5" strokeLinejoin="round"><path d="M108 251 Q117 246 122 253 L123 267 Q111 271 86 269 Q82 259 103 257Z" /><path d="M85 266 Q103 267 123 265 L123 272 L85 272Z" fill="var(--c-crisp-body)" /><path d="M105 255 Q110 252 115 254" fill="none" stroke="var(--c-crisp-cream)" strokeWidth="2" strokeLinecap="round" /></g>;
}

function ArmStroke({ arm: { shoulder, bend, wrist } }: { arm: Arm }) {
  const path = `M${shoulder.join(' ')} Q${bend.join(' ')} ${wrist.join(' ')}`;
  return <g fill="none" strokeLinecap="round"><path d={path} stroke="var(--c-crisp-ink)" strokeWidth="7" /><path d={path} stroke="var(--c-crisp-body)" strokeWidth="3.5" /></g>;
}

/** One wrist coordinate and the forearm's tangent place both the cuff and palm. */
function Hand({ arm: { wrist, bend, hand = 'rest' } }: { arm: Arm }) {
  const angle = Math.atan2(wrist[1] - bend[1], wrist[0] - bend[0]) + Math.PI / 2;
  // The thumb is on local -X. Face that side toward the apple's center in each pose,
  // including when a hanging or hip hand turns past horizontal.
  const mirror = (140 - wrist[0]) * Math.cos(angle) + (150 - wrist[1]) * Math.sin(angle) > 0;
  return <g transform={`translate(${wrist.join(' ')}) rotate(${angle * 180 / Math.PI}) scale(${mirror ? -.8 : .8} .8)`}>
    <g fill="var(--c-crisp-cream)" stroke="var(--c-crisp-ink)" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      {hand === 'open' ? <>
        <path d="M-10-10 C-16-14-20-20-23-25 C-26-31-21-35-17-30 L-12-25 L-17-38 C-19-45-12-48-9-41 L-5-30 L-6-45 C-6-52 2-52 3-45 L4-30 L8-42 C10-49 18-46 16-39 L13-27 L19-33 C24-38 30-32 25-27 L16-14 Q14-10 10-9Z" />
        <path d="M-10-23 Q-2-26 2-18 M-3-13 Q3-16 9-14" fill="none" strokeWidth="1.6" />
      </> : hand === 'chin' ? <>
        <path d="M-8-7 C-13-10-16-15-15-22 Q-15-29-9-30 L-10-33 Q-10-38-5-38 Q-2-38 0-35 Q4-39 8-35 Q14-37 16-31 Q21-29 19-22 L15-13 Q13-8 8-7Z" />
        <path d="M-9-28 Q-2-24 1-17 M2-31 Q7-28 12-30" fill="none" strokeWidth="1.6" />
      </> : <>
        <path d="M-9-8 C-14-12-16-18-12-22 Q-9-24-6-20 L-7-27 Q-6-32-1-29 Q3-33 6-29 Q11-30 13-25 Q18-24 15-16 L9-8Z" />
        <path d="M-6-20 Q-1-17 0-13 M-1-27 0-22 M5-27 6-22 M11-24 11-20" fill="none" strokeWidth="1.6" />
      </>}
      <path d={hand === 'chin' ? 'M-8-7 Q0-5 8-7 L8 1 Q0 4-8 1Z' : 'M-11-10 Q0-7 11-10 L12 2 Q0 6-12 2Z'} />
    </g>
  </g>;
}
