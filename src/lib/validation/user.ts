import { z } from "zod";
import { PLATOONS } from "@/lib/constants";

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

export const MIN_PASSWORD = 8;

export const UsernameSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(3, "שם משתמש — לפחות 3 תווים")
      .max(30, "שם משתמש ארוך מדי")
      .regex(/^[a-z0-9._-]+$/, "שם משתמש באותיות לועזיות, ספרות, נקודה, מקף או קו תחתון בלבד"),
  );

export const UserFieldsSchema = z.object({
  name: z.string().trim().min(2, "יש להזין שם מלא").max(60, "השם ארוך מדי"),
  role: z.enum(["ADMIN", "REGULAR"], { error: "יש לבחור תפקיד" }),
  platoon: z.preprocess(emptyToUndef, z.enum(PLATOONS as [string, ...string[]]).optional()),
});

export const CreateUserSchema = UserFieldsSchema.extend({ username: UsernameSchema });

export const PasswordSchema = z
  .string()
  .min(MIN_PASSWORD, `סיסמה — לפחות ${MIN_PASSWORD} תווים`)
  .max(100, "הסיסמה ארוכה מדי")
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "הסיסמה חייבת לכלול אותיות וספרות");

export const ChangePasswordSchema = z
  .object({
    current: z.string().min(1, "יש להזין את הסיסמה הנוכחית"),
    next: PasswordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { path: ["confirm"], message: "הסיסמאות אינן תואמות" })
  .refine((d) => d.next !== d.current, { path: ["next"], message: "הסיסמה החדשה זהה לנוכחית" });
