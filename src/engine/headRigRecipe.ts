import {z} from 'zod';

export const headRigHandles=['left-eye','right-eye','nose','mouth'] as const;
export type HeadRigHandle=typeof headRigHandles[number];
export const headHandleLimit=4;
const offset=z.number().finite().min(-headHandleLimit).max(headHandleLimit);
const point=z.strictObject({x:offset,y:offset});

/** Editable local offsets bound to the built-in catalog topology. */
export const HeadRigRecipe=z.strictObject({
  version:z.literal(1),
  family:z.literal('catalog-head-v1'),
  handles:z.partialRecord(z.enum(headRigHandles),point)
});
export type HeadRigRecipeData=z.infer<typeof HeadRigRecipe>;
