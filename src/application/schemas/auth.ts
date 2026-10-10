import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email());

export const signInEmailSchema = z.object({
  email,
  // Only presence is checked here: a wrong password must look the same whatever its length.
  password: z.string().min(1).max(128),
});

export const signUpSchema = z.object({
  email,
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(80),
});
