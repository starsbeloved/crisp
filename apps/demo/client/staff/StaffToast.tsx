import type { CommandResult } from '../../server/commands.ts';
export function StaffToast({ result }: { result: CommandResult | null }) {
  if (!result) return null;
  return <div role={result.ok ? 'status' : 'alert'} className={`staff-toast ${result.ok ? '' : 'staff-error'}`}>{result.message}</div>;
}
