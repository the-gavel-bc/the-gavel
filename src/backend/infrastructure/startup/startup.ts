import "server-only";

import { getServerEnv } from "@/backend/infrastructure/env/server/server";
export function register() {
  getServerEnv();
}
