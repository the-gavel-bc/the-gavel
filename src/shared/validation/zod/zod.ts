import { z } from "zod";

// Configure before consumers construct objects: Zod's eval capability probe
// itself emits a CSP violation even when it catches the browser's EvalError.
z.config({ jitless: true });

export { z };
