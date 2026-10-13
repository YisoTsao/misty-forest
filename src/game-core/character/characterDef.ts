import { z } from 'zod';

export const locomotionAnims = ['idle', 'walk', 'run', 'jump', 'fall', 'land'] as const;
export type LocomotionAnim = (typeof locomotionAnims)[number];

/** 規格 4.6 要求的全部動畫：移動類 + 動作類；加上戰鬥用的技能與倒下（規格 6.6）。 */
export const requiredClipKeys = [...locomotionAnims, 'attack', 'hit', 'interact', 'skill', 'death'] as const;
export type ClipKey = (typeof requiredClipKeys)[number];

export const locomotionParamsSchema = z.object({
  walkSpeed: z.number().positive(),
  runSpeed: z.number().positive(),
  acceleration: z.number().positive(),
  deceleration: z.number().positive(),
  turnSpeed: z.number().positive(),
  jumpVelocity: z.number().positive(),
  gravity: z.number().positive(),
  coyoteTime: z.number().nonnegative(),
  fallDelay: z.number().nonnegative(),
  landDuration: z.number().nonnegative(),
});
export type LocomotionParams = z.infer<typeof locomotionParamsSchema>;

export const characterDefSchema = z
  .object({
    id: z.string().min(1),
    model: z.string().min(1),
    scale: z.number().positive(),
    capsule: z.object({ radius: z.number().positive(), halfHeight: z.number().positive() }),
    hiddenNodes: z.array(z.string()),
    clips: z.object(Object.fromEntries(requiredClipKeys.map((k) => [k, z.string().min(1)])) as Record<ClipKey, z.ZodString>),
    locomotion: locomotionParamsSchema,
  })
  .refine((c) => c.locomotion.runSpeed > c.locomotion.walkSpeed, { message: 'runSpeed 必須大於 walkSpeed' });
export type CharacterDef = z.infer<typeof characterDefSchema>;

export function parseCharacterDefs(raw: unknown): Map<string, CharacterDef> {
  const list = z.array(characterDefSchema).parse(raw);
  return new Map(list.map((c) => [c.id, c]));
}
