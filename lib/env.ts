import { z } from "zod";

// Errors name the variables that are wrong, never their values.
function parseEnv<T extends z.ZodType>(schema: T, label: string): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((i) => String(i.path[0])))].join(", ");
    throw new Error(`${label}: missing or invalid environment variables: ${names}`);
  }
  return result.data;
}

const SupabaseEnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const MetaEnvSchema = z.object({
  META_API_KEY: z.string().min(1),
  // Base only (https://api.meta.ai/v1); the adapter appends the path.
  META_API_BASE_URL: z.url(),
  META_SPARK_MODEL: z.string().min(1),
});

const PipelineEnvSchema = z.object({
  MAX_MODEL_CALLS_PER_SCAN: z.coerce.number().int().positive().default(30),
});

export const getSupabaseEnv = () => parseEnv(SupabaseEnvSchema, "Supabase");
export const getMetaEnv = () => parseEnv(MetaEnvSchema, "Meta API");
export const getPipelineEnv = () => parseEnv(PipelineEnvSchema, "Pipeline");
