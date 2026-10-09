import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "../auth-policy";

const email = z.string().trim().toLowerCase().pipe(z.email());

/** `.invalid` is reserved (RFC 2606): demo users live there, so nobody can register as one. */
const registrableEmail = email.refine((value) => !/\.invalid$/.test(value.split("@").pop() ?? ""), { message: "Use a real email address" });

export const signInEmailSchema = z.object({
  email,
  // Only presence is checked here: a wrong password must look the same whatever its length.
  password: z.string().min(1).max(128),
});

export const signUpSchema = z.object({
  email: registrableEmail,
  password: z.string().min(MIN_PASSWORD_LENGTH).max(128),
  name: z.string().trim().min(1).max(80),
});
