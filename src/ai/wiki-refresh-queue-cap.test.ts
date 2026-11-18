import { describe, expect, it } from "vitest";

import { BudgetExceeded, MemoryLedger } from "@/src/content/model-gateway";
import { consumeQueueUnderSharedCap } from "@/src/ai/wiki-refresh-queue";

type Item = { id: string; tenant: string; cost: number };

describe("shared AI cap across tenants", () => {
  it("lets tenant 1 spend most of the cap and stops tenant 2 on the leftover, under one cap", async () => {
    const capUsd = 0.25;
    const ledger = new MemoryLedger();
    const items: Item[] = [
      { id: "marathon-1", tenant: "marathon", cost: 0.2 },
      { id: "gta6-1", tenant: "gta6", cost: 0.1 },
    ];
    const processed: string[] = [];
    const released: string[] = [];

    const result = await consumeQueueUnderSharedCap(items, {
      process: async (item) => {
        if (ledger.totalUsd() + item.cost > capUsd) {
          throw new BudgetExceeded(
            `Spend cap: $${ledger.totalUsd().toFixed(2)} spent; the next call could pass $${capUsd}.`,
          );
        }
        ledger.record({ at: "2026-11-18T00:00:00.000Z", page: item.id, step: "edit", model: "test", inputTokens: 0, outputTokens: 0, usd: item.cost });
        processed.push(item.id);
      },
      releaseRemaining: async (remaining) => {
        released.push(...remaining.map((item) => item.id));
      },
    });

    expect(processed).toEqual(["marathon-1"]);
    expect(released).toEqual(["gta6-1"]);
    expect(ledger.totalUsd()).toBeCloseTo(0.2);
    expect(ledger.totalUsd()).toBeLessThanOrEqual(capUsd);
    expect(result.skipped).toMatch(/Spend cap: \$0\.20 spent; the next call could pass \$0\.25/);
  });
});
