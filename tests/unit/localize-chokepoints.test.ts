import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, UnauthenticatedError, ValidationError } from "@/domain/errors";

const active = { locale: "es" as "en" | "es" };
vi.mock("next-intl/server", async () => (await import("@tests/support/intl-server")).intlServerFor(active));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const useCases = { createTask: vi.fn(), deleteTask: vi.fn() };
const auth = { signInEmail: vi.fn() };
vi.mock("@/infrastructure/container", () => ({ getContainer: () => ({ useCases, auth, logger: { error: vi.fn() } }) }));

const tasks = await import("@/app/_actions/tasks");
const authActions = await import("@/app/_actions/auth");
const form = (entries: Record<string, string>) => Object.entries(entries).reduce((data, [k, v]) => (data.set(k, v), data), new FormData());

beforeEach(() => {
  vi.clearAllMocks();
  active.locale = "es";
});

describe("Server Action failures are shown in the visitor's language", () => {
  it("translates a reason raised by a use case, with its params", async () => {
    useCases.createTask.mockRejectedValue(new ConflictError("Guest limit reached: at most 50 tasks. Sign up to create more.", { reason: "guest.taskLimit", params: { max: 50 } }));
    expect(await tasks.createTaskAction(undefined, form({ stageId: "s", title: "t" }))).toMatchObject({ ok: false, code: "CONFLICT", message: "Límite de invitado alcanzado: máximo 50 tareas. Regístrate para crear más." });
    active.locale = "en";
    expect(await tasks.createTaskAction(undefined, form({ stageId: "s", title: "t" }))).toMatchObject({ message: "Guest limit reached: at most 50 tasks. Sign up to create more." });
  });

  it("translates field messages and the refusal to delete without confirmation", async () => {
    useCases.createTask.mockRejectedValue(new ValidationError("Invalid input", { title: ["Too small: expected string to have >=1 characters"] }, { title: [{ reason: "tooSmall", params: { min: 1 } }] }));
    expect(await tasks.createTaskAction(undefined, form({}))).toEqual({
      ok: false, code: "VALIDATION", message: "Datos no válidos", fieldErrors: { title: ["Demasiado corto: se esperaban al menos 1 caracteres"] },
    });
    expect(await tasks.deleteTaskAction(undefined, form({ taskId: "t" }))).toEqual({
      ok: false, code: "VALIDATION", message: "Se requiere confirmación", fieldErrors: { confirm: ["Confirma que quieres eliminar esta tarea"] },
    });
    expect(useCases.deleteTask).not.toHaveBeenCalled();
  });

  it("translates sign-in failures and leaves the unexpected ones generic", async () => {
    auth.signInEmail.mockRejectedValueOnce(new UnauthenticatedError("Invalid email or password", { reason: "auth.invalidCredentials" }));
    expect(await authActions.signInEmailAction(undefined, form({ email: "a@b.co", password: "x" }))).toMatchObject({ code: "UNAUTHENTICATED", message: "Correo o contraseña incorrectos" });
    auth.signInEmail.mockRejectedValueOnce(new Error("db down"));
    expect(await authActions.signInEmailAction(undefined, form({ email: "a@b.co", password: "x" }))).toMatchObject({ code: "INTERNAL", message: "Algo salió mal" });
  });
});
