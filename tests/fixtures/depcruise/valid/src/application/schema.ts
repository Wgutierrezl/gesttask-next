import { z } from "zod";
import { priorities } from "../domain/priority";
export const schema = z.enum(priorities);
