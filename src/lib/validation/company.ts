import { z } from "zod";
import { UsernameSchema } from "@/lib/validation/user";

export const CompanyNameSchema = z.string().trim().min(2, "יש להזין שם פלוגה").max(60, "השם ארוך מדי");

/** A new company together with its first admin (מ"פ / סמ"פ). */
export const CreateCompanySchema = z.object({
  name: CompanyNameSchema,
  adminName: z.string().trim().min(2, "יש להזין שם מלא").max(60, "השם ארוך מדי"),
  adminUsername: UsernameSchema,
  /** Optional: start from this company's catalog, sets and kit checklist instead of the defaults. */
  templateId: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
});
