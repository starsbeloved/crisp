import type { CommandResult } from '../../server/commands.ts';
export const STAFF_TOOLS = ['list_waiting', 'patient_summary', 'call_patient', 'acknowledge_request', 'mark_checked', 'get_record', 'accept_suggestion', 'shift_summary'] as const;
export async function staffRequest(tool: string, parameters: unknown): Promise<CommandResult> {
  const response = await fetch(`/api/commands/${encodeURIComponent(tool)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parameters), signal: AbortSignal.timeout(8000) });
  const result: CommandResult = await response.json();
  if (typeof result.ok !== 'boolean' || typeof result.message !== 'string') throw new Error('Invalid command response');
  return result;
}
export function createStaffTools(options: {
  connected: () => boolean; digest: () => string; notify: (result: CommandResult) => void;
  request?: typeof staffRequest; onRecord?: (result: unknown) => void;
}) {
  const tools: Record<string, (parameters: unknown) => Promise<string>> = { get_room_digest: async () => options.digest() };
  for (const name of STAFF_TOOLS) tools[name] = async parameters => {
    let result: CommandResult;
    if (!options.connected()) result = { ok: false, message: 'Room disconnected. Reconnect before using staff tools.' };
    else {
      try { result = await (options.request ?? staffRequest)(name, parameters ?? {}); }
      catch { result = { ok: false, message: 'Command confirmation unavailable. Review the room on screen before retrying.' }; }
    }
    options.notify(result);
    if (name === 'get_record' && result.ok) options.onRecord?.(result.data);
    return JSON.stringify(result);
  };
  return tools;
}
