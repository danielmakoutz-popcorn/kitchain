import { z } from "zod";

export const RecipeSchema = z.object({
  id: z.string().or(z.number()),
  title: z.string(),
  description: z.string().optional().nullable(),
  ingredients: z.array(z.string()).optional().nullable(),
  steps: z.array(z.string()).optional().nullable(),
  image_path: z.string().optional().nullable(),
  created_at: z.string().optional().nullable(),
});

export type Recipe = z.infer<typeof RecipeSchema>;

export const ScanResponseSchema = z.object({
  text: z.string(),
});

export type ScanResponse = z.infer<typeof ScanResponseSchema>;
