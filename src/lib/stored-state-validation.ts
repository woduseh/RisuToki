import { z } from 'zod';

export const storedAvatarStateSchema = z.object({
  src: z.string(),
});

const rawStoredLayoutStateSchema = z.object({
  itemsPos: z.string().optional(),
  refsPos: z.string().optional(),
  terminalPos: z.string().optional(),
  itemsVisible: z.boolean().optional(),
  terminalVisible: z.boolean().optional(),
  avatarVisible: z.boolean().optional(),
  slotSizes: z.record(z.string(), z.number().finite().nonnegative()).optional(),
  sidebarPos: z.string().optional(),
  sidebarVisible: z.boolean().optional(),
});

export const storedLayoutStateSchema = rawStoredLayoutStateSchema.transform(
  ({ sidebarPos, sidebarVisible, itemsPos, itemsVisible, ...layoutState }) => ({
    ...layoutState,
    ...(itemsPos !== undefined ? { itemsPos } : sidebarPos !== undefined ? { itemsPos: sidebarPos } : {}),
    ...(itemsVisible !== undefined
      ? { itemsVisible }
      : sidebarVisible !== undefined
        ? { itemsVisible: sidebarVisible }
        : {}),
  }),
);

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
