import { writeFileSync } from "node:fs";
import { join } from "node:path";

export function createFakeAdapter({
  name = "fake",
  evidence = { checks: [] },
  status = 0,
  implementation = null,
  verification = null
} = {}) {
  const calls = [];

  return {
    name,
    calls,
    capabilities: {
      structuredOutput: true,
      readOnlyVerification: true
    },

    probe() {
      calls.push({ type: "probe" });
      return { ok: true };
    },

    runImplementation(input) {
      calls.push({ type: "implementation", ...input });
      if (implementation) implementation(input);
      return { status };
    },

    runVerification(input) {
      calls.push({ type: "verification", ...input });
      if (verification) {
        verification(input);
      } else {
        writeFileSync(join(input.cwd, input.outputPath), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
      }
      return { status };
    }
  };
}
