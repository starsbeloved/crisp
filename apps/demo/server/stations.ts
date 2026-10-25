import { z } from 'zod';

const identity = {
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
  name: z.string().trim().min(1).max(60).optional(),
};
const registration = z.discriminatedUnion('role', [
  z.object({ ...identity, role: z.literal('exam'), room: z.enum(['1', '2', '3']) }).strict(),
  z.object({ ...identity, role: z.enum(['kiosk', 'room', 'command', 'lobby']) }).strict(),
]);

// Station metadata deliberately lives outside RoomState and contains no patient data.
type Station = z.infer<typeof registration> & { name: string; lastSeenAt: number };
export class StationRegistry {
  private readonly stations = new Map<string, Station>();

  register(body: unknown, now = Date.now()) {
    const input = registration.parse(body);
    const station = { ...input, name: input.name ?? `Laptop ${input.id.slice(0, 6)}`, lastSeenAt: now };
    this.stations.set(input.id, station);
    return { ...station, online: true };
  }

  list(now = Date.now()) {
    return [...this.stations.values()].map(station => ({ ...station, online: now - station.lastSeenAt < 30_000 }));
  }
}
