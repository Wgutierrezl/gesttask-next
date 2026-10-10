import { getContainer } from "@/infrastructure/container";

// Better Auth endpoints (sign-in, sign-up, sign-out, session...) behind the container.
const handle = (request: Request) => getContainer().authHandler(request);

export { handle as GET, handle as POST };
