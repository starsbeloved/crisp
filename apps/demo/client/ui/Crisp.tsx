import { useId, type CSSProperties, type JSX } from 'react';

export type CrispState = 'idle' | 'listening' | 'thinking' | 'talking' | 'happy' | 'pointing';
export const CRISP_NAME = 'Crisp';

type Arm = { arm: string; end: readonly [number, number]; rotation: number };
type Pose = {
  left: Arm;
  right: Arm;
  brow: [string, string];
  pupil: string;
  mouth: string;
  open?: boolean;
  talk?: boolean;
  lean?: string;
  dots?: boolean;
  ear?: boolean;
  wave?: boolean;
  bounce?: boolean;
};

const hangLeft: Arm = { arm: 'M62 142 C44 152 40 168 44 182', end: [44, 182], rotation: 172 };
const hangRight: Arm = { arm: 'M218 142 C236 152 240 168 236 182', end: [236, 182], rotation: -172 };
const hipLeft: Arm = { arm: 'M62 150 C42 160 44 186 70 188', end: [70, 188], rotation: 80 };
const idleBrows: [string, string] = ['M104 94 Q118 86 130 92', 'M150 92 Q162 86 176 94'];
const raisedBrows: [string, string] = ['M104 89 Q118 81 130 87', 'M150 87 Q162 81 176 89'];

const poses: Record<CrispState, Pose> = {
  idle: { left: hangLeft, right: hangRight, brow: idleBrows, pupil: 'translate(0 0)', mouth: 'M126 160 Q140 172 154 160' },
  listening: { left: hangLeft, right: { arm: 'M218 134 C242 126 248 104 238 90', end: [238, 90], rotation: -10 }, brow: [idleBrows[0], 'M150 88 Q162 81 176 89'], pupil: 'translate(4 -1)', mouth: 'M128 162 Q140 170 152 162', lean: 'rotate(5 140 270)', ear: true },
  thinking: { left: hipLeft, right: { arm: 'M218 150 C238 176 214 204 180 200', end: [180, 200], rotation: -70 }, brow: ['M104 92 Q118 89 130 92', 'M150 86 Q164 80 176 88'], pupil: 'translate(3 -7)', mouth: 'M130 166 Q140 163 152 167', lean: 'rotate(-3 140 270)', dots: true },
  talking: { left: { arm: 'M62 138 C40 128 30 110 34 94', end: [34, 94], rotation: -24 }, right: hangRight, brow: idleBrows, pupil: 'translate(0 1)', mouth: 'M126 160 Q140 172 154 160', open: true, talk: true },
  happy: { left: { arm: 'M62 136 C38 124 28 102 32 82', end: [32, 82], rotation: -22 }, right: { arm: 'M218 136 C242 124 252 102 248 82', end: [248, 82], rotation: 22 }, brow: raisedBrows, pupil: 'translate(0 -2)', mouth: 'M126 160 Q140 172 154 160', open: true, wave: true, bounce: true },
  pointing: { left: hipLeft, right: { arm: 'M218 140 C228 137 238 134 246 132', end: [246, 132], rotation: 84 }, brow: raisedBrows, pupil: 'translate(5 0)', mouth: 'M126 160 Q140 172 154 160', open: true },
};

export function Crisp({ state = 'idle', size = 96, level = 0 }: { state?: CrispState; size?: number; level?: number }): JSX.Element {
  const id = useId();
  const pose = poses[state] ?? poses.idle;
  const openness = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  const style = { '--crisp-mouth-scale': String(.45 + openness * .55) } as CSSProperties;
  const label = `${CRISP_NAME} the apple, ${state}`;
  return <svg className="crisp-character" data-state={state} width={size} height={Math.round(size * 300 / 340)} viewBox="-30 0 340 300" role="img" aria-labelledby={id} style={style}>
    <title id={id}>{label}</title>
    <style>{`
      .crisp-character { display:block; overflow:visible; flex:0 0 auto; }
      .crisp-character * { transform-box:fill-box; transform-origin:center; }
      .crisp-bob { animation:crisp-bob ${pose.bounce ? '.7s' : '2.6s'} ease-in-out infinite; }
      .crisp-eyes { animation:crisp-blink 4.2s infinite; }
      .crisp-talk { animation:crisp-talk .8s ease-in-out infinite; transform-origin:center; }
      .crisp-talk-level { animation:none; transform:scaleY(var(--crisp-mouth-scale)); }
      .crisp-wave { animation:crisp-wave .9s ease-in-out infinite; transform-origin:center; }
      .crisp-thought circle, .crisp-ear path { animation:crisp-fade 1.2s ease-in-out infinite; }
      .crisp-thought circle:nth-child(2), .crisp-ear path:nth-child(2) { animation-delay:.2s; }
      .crisp-thought circle:nth-child(3) { animation-delay:.4s; }
      @keyframes crisp-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(${pose.bounce ? '-10px' : '-5px'})} }
      @keyframes crisp-blink { 0%,92%,96%,100%{transform:scaleY(1)} 94%{transform:scaleY(.08)} }
      @keyframes crisp-talk { 0%,100%{transform:scaleY(1)} 25%{transform:scaleY(.45)} 50%{transform:scaleY(.9)} 75%{transform:scaleY(.35)} }
      @keyframes crisp-wave { 0%,100%{transform:rotate(0)} 25%{transform:rotate(-16deg)} 60%{transform:rotate(14deg)} }
      @keyframes crisp-fade { 0%,100%{opacity:.2} 50%{opacity:1} }
      @media(prefers-reduced-motion:reduce) { .crisp-character * { animation:none!important; } }
    `}</style>
    <ellipse cx="140" cy="281" rx="62" ry="7" fill="var(--c-text)" opacity=".10" />
    <g className="crisp-bob">
      <g transform={pose.lean ?? 'rotate(0 140 270)'}>
        <path d="M124 204 C122 226 118 244 114 258" fill="none" stroke="var(--c-text)" strokeWidth="5" strokeLinecap="round" />
        <path d="M156 204 C158 226 162 244 166 258" fill="none" stroke="var(--c-text)" strokeWidth="5" strokeLinecap="round" />
        <ellipse cx="106" cy="265" rx="17" ry="9.5" fill="var(--c-text)" /><ellipse cx="174" cy="265" rx="17" ry="9.5" fill="var(--c-text)" />
        <ellipse cx="99" cy="261" rx="5.5" ry="2.4" fill="var(--c-surface)" opacity=".45" /><ellipse cx="167" cy="261" rx="5.5" ry="2.4" fill="var(--c-surface)" opacity=".45" />
        <path d="M140 72 C120 56 72 58 60 100 C48 145 72 205 112 212 C124 214 132 208 140 208 C148 208 156 214 168 212 C208 205 232 145 220 100 C208 58 160 56 140 72 Z" fill="var(--c-red)" stroke="var(--c-text)" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M207 112 C216 152 198 194 162 205 C190 186 206 156 207 112 Z" fill="var(--c-red-text)" opacity=".8" />
        <ellipse cx="86" cy="102" rx="10" ry="21" transform="rotate(35 86 102)" fill="var(--c-surface)" opacity=".42" />
        <path d="M140 76 C139 64 142 52 149 42" fill="none" stroke="var(--c-text)" strokeWidth="7" strokeLinecap="round" />
        <path d="M146 56 C156 36 186 32 200 40 C190 58 164 66 146 56 Z" fill="var(--c-leaf)" stroke="var(--c-text)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M151 54 C166 47 180 43 194 41" fill="none" stroke="var(--c-leaf-hover)" strokeWidth="2" strokeLinecap="round" />
        <g transform="rotate(-16 106 70)">
          <path d="M84 82 L89 58 Q106 50 123 58 L128 82 Q106 88 84 82 Z" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="3" strokeLinejoin="round" />
          <rect x="103" y="60" width="6" height="16" rx="1.5" fill="var(--c-leaf)" /><rect x="98" y="65" width="16" height="6" rx="1.5" fill="var(--c-leaf)" />
        </g>
        <path d={pose.brow[0]} fill="none" stroke="var(--c-text)" strokeWidth="4" strokeLinecap="round" /><path d={pose.brow[1]} fill="none" stroke="var(--c-text)" strokeWidth="4" strokeLinecap="round" />
        <g className="crisp-eyes">
          <g transform="translate(118 124)"><ellipse rx="16" ry="22" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="3" /><g transform={pose.pupil}><ellipse rx="8.5" ry="13" fill="var(--c-text)" /><path d="M0 -1 L3 -12 L8 -5 Z" fill="var(--c-surface)" /></g></g>
          <g transform="translate(162 124)"><ellipse rx="16" ry="22" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="3" /><g transform={pose.pupil}><ellipse rx="8.5" ry="13" fill="var(--c-text)" /><path d="M0 -1 L3 -12 L8 -5 Z" fill="var(--c-surface)" /></g></g>
        </g>
        <ellipse cx="94" cy="157" rx="11" ry="7" fill="var(--c-red)" opacity=".6" /><ellipse cx="186" cy="157" rx="11" ry="7" fill="var(--c-red)" opacity=".6" />
        {!pose.open && <path d={pose.mouth} fill="none" stroke="var(--c-text)" strokeWidth="3.5" strokeLinecap="round" />}
        {pose.open && <g transform="translate(140 158)"><g className={pose.talk ? `crisp-mouth-open crisp-talk${openness > 0 ? ' crisp-talk-level' : ''}` : 'crisp-mouth-open'}><path d="M-18 0 Q0 30 18 0 Q0 6 -18 0 Z" fill="var(--c-red-text)" stroke="var(--c-text)" strokeWidth="3" strokeLinejoin="round" /><ellipse cx="0" cy="10.5" rx="7" ry="3.5" fill="var(--c-red)" /></g></g>}
        <path d={pose.left.arm} fill="none" stroke="var(--c-text)" strokeWidth="6" strokeLinecap="round" /><path d={pose.right.arm} fill="none" stroke="var(--c-text)" strokeWidth="6" strokeLinecap="round" />
        <Glove transform={gloveTransform(pose.left)} pointed={false} />
        <g transform={gloveTransform(pose.right)} className={pose.wave ? 'crisp-wave' : undefined}>
          {state === 'pointing' ? <PointingGlove /> : <GloveShape />}
        </g>
        {pose.dots && <g className="crisp-thought"><circle cx="216" cy="74" r="4" fill="var(--c-border)" /><circle cx="232" cy="57" r="6.5" fill="var(--c-border)" /><circle cx="253" cy="35" r="9" fill="var(--c-border)" /></g>}
        {pose.ear && <g className="crisp-ear" fill="none" stroke="var(--c-leaf)" strokeWidth="3" strokeLinecap="round"><path d="M262 52 Q271 66 262 80" /><path d="M274 42 Q288 66 274 90" /></g>}
      </g>
    </g>
  </svg>;
}

function gloveTransform(arm: Arm) {
  return `translate(${arm.end[0]} ${arm.end[1]}) rotate(${arm.rotation})`;
}

function Glove({ transform, pointed }: { transform: string; pointed: boolean }) {
  return <g transform={transform}>{pointed ? <PointingGlove /> : <GloveShape />}</g>;
}

function GloveShape() {
  return <>
    <ellipse cx="-8" cy="-36" rx="4.6" ry="8" transform="rotate(-12 -8 -36)" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="2.5" />
    <ellipse cx="0" cy="-39" rx="4.6" ry="8.5" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="2.5" />
    <ellipse cx="8" cy="-36" rx="4.6" ry="8" transform="rotate(12 8 -36)" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="2.5" />
    <ellipse cx="14" cy="-21" rx="6.5" ry="4.5" transform="rotate(30 14 -21)" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="2.5" />
    <ellipse cx="0" cy="-24" rx="13" ry="12" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="2.5" />
    <path d="M-4 -30 L-4 -20 M4 -30 L4 -20" fill="none" stroke="var(--c-text)" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M-11 -12 L11 -12 L13 -1 Q0 4 -13 -1 Z" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="2.5" strokeLinejoin="round" />
  </>;
}

function PointingGlove() {
  return <>
    <rect x="-4.5" y="-60" width="9" height="30" rx="4.5" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="2.5" />
    <ellipse cx="-13" cy="-22" rx="5" ry="7" transform="rotate(-20 -13 -22)" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="2.5" />
    <ellipse cx="0" cy="-24" rx="12" ry="11" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="2.5" />
    <path d="M-6 -20 Q0 -17 6 -20 M-6 -27 Q0 -24 6 -27" fill="none" stroke="var(--c-text)" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M-11 -12 L11 -12 L13 -1 Q0 4 -13 -1 Z" fill="var(--c-surface)" stroke="var(--c-text)" strokeWidth="2.5" strokeLinejoin="round" />
  </>;
}
