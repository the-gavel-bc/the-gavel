import { createRequire } from "node:module";
import { expect, it } from "vitest";
import config from "../../../../next.config";
import {
  checkDraftInput,
  draftJsonbByteLength,
} from "../draft-contract/draft-contract";
import { baseDraft, body } from "../draft-contract/draft-test-cases";
import { articleId } from "../draft-queries/draft-query-test-client";
// Use the encoder shipped by our pinned Next runtime, rather than approximating Flight with JSON.
const require = createRequire(import.meta.url);
const { encodeReply } =
  require("next/dist/compiled/react-server-dom-webpack/client.node") as {
    encodeReply: (args: unknown[]) => Promise<string | FormData>;
  };
it.each(["a", "😀", "\n", '"', "\\"])(
  "fits a valid near-1-MiB body in the configured action transport: %s",
  async (unit) => {
    const overhead = draftJsonbByteLength(body(""))!;
    const unitBytes = draftJsonbByteLength(unit)! - 2;
    const text = unit.repeat(Math.floor((1048576 - overhead) / unitBytes));
    const draft = { ...baseDraft, content: body(text) };
    expect(draftJsonbByteLength(draft.content)).toBeGreaterThan(1048570);
    expect(checkDraftInput(draft).ok).toBe(true);
    const wire = await encodeReply([
      { articleId, expectedVersion: 1, requestId: articleId, draft },
    ]);
    const bytes =
      typeof wire === "string"
        ? Buffer.byteLength(wire)
        : (await new Response(wire).arrayBuffer()).byteLength;
    expect(bytes).toBeGreaterThan(1048576);
    expect(bytes).toBeLessThanOrEqual(
      Number(config.experimental?.serverActions?.bodySizeLimit),
    );
  },
);
