import { z } from "zod";

export const RecipeSchema = z.object({
  id: z.string().or(z.number()),
  title: z.string(),
  description: z.string().optional().nullable(),
  ingredients: z.array(z.string()).optional().nullable(),
  steps: z.array(z.string()).optional().nullable(),
  instructions: z.string().optional().nullable(),
  handwriting_profile_id: z.number().optional().nullable(),
  image_path: z.string().optional().nullable(),
  created_at: z.string().optional().nullable(),
});

export type Recipe = z.infer<typeof RecipeSchema>;

export const ScanResponseSchema = z.object({
  scan_id: z.number(),
  title: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  notes: z.array(z.string()).default([]),
  raw_text: z.string().default(""),
  confidence: z.enum(["low", "medium", "high"]),
  uncertain_lines: z.array(z.string()).default([]),
});

export type ScanResponse = z.infer<typeof ScanResponseSchema>;
