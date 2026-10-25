export function FaceGuide({ message, saved }: { message: string; saved: boolean }) {
  const samples = saved ? 5 : Number(message.match(/(\d)\/5/)?.[1] ?? 0);
  return <svg className="checkin-face-guide" viewBox="0 0 800 600" aria-hidden="true">
    <path d="M0 0H800V600H0Z M250 290a150 185 0 1 0 300 0a150 185 0 1 0-300 0Z" fillRule="evenodd" className="checkin-face-dim" />
    <ellipse cx="400" cy="290" rx="150" ry="185" className="checkin-oval" />
    <ellipse cx="400" cy="290" rx="150" ry="185" pathLength="100" strokeDasharray={`${samples * 20} 100`} className="checkin-face-progress" />
  </svg>;
}
