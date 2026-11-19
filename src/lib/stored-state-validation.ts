import { z } from 'zod';

export function parseStoredJson<T>(value: string | null, schema: z.ZodType<T>): T | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    const result = schema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
