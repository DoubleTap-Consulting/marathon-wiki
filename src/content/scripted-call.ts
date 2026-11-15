/**
 * A deterministic stand-in for the model, for tests and the no-spend refresh drill. The "draft"
 * turns each line of the first extracts into a sentence citing that extract. The "patch" adds
 * extract lines the page does not state yet and keeps everything else. The "claim check"
 * quotes the first words of each claim, which really occur in the cited extract, so the
 * deterministic grounding in resolveClaims is exercised for real.
 */
import type { StructuredCall } from "./editor";

const EXTRACT = /<extract id="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/extract>/g;
const CLAIM = /^- (claim_[^:]+): (.*) \[cites: ([^\]]+)\]$/gm;
const CURRENT = /^\[(s\d+)\] \(([^)]+)\) (.*)$/gm;

function usableLines(prompt: string) {
  return [...prompt.matchAll(EXTRACT)].flatMap(([, id, text]) =>
    text.split("\n").map((value) => value.trim()).filter((line) => line.length >= 20 && !/[[\]{}<>|*_`#]/.test(line)).map((line) => ({ id, line })),
  );
}

export function createScriptedCall(options: { maxSentences?: number; modelId?: string } = {}): StructuredCall & { calls: Array<{ page: string; step: string; prompt: string }> } {
  const calls: Array<{ page: string; step: string; prompt: string }> = [];
  const call = (async ({ page, step, prompt, schema }) => {
    calls.push({ page, step, prompt });
    if (step === "patch") {
      const current = [...prompt.matchAll(CURRENT)].map(([, id, heading, text]) => ({ id, heading, text }));
      const known = new Set(current.map((sentence) => sentence.text));
      const additions = usableLines(prompt).filter(({ line }) => !known.has(line)).slice(0, options.maxSentences ?? 6);
      const edits = additions.map(({ id, line }) => ({ op: "add", sentenceId: null, heading: current.at(-1)?.heading ?? "Overview", text: line, extractIds: [id], patchRef: null, reason: "scripted" }));
      return { output: schema.parse({ edits }), modelId: options.modelId ?? "scripted/editor-drill", responseId: null };
    }
    if (step === "draft") {
      const sentences = usableLines(prompt)
        .slice(0, options.maxSentences ?? 6)
        .map(({ id, line }) => ({ text: line, extractIds: [id], patchRef: null }));
      const output = { title: page, summary: `What the sources say about ${page}.`, sections: [{ heading: "Overview", paragraphs: [{ sentences }] }], conflicts: [] };
      return { output: schema.parse(output), modelId: options.modelId ?? "scripted/editor-drill", responseId: null };
    }
    const checks = [...prompt.matchAll(CLAIM)].map(([, claimId, text, cites]) => ({
      claimId,
      verdict: "supported" as const,
      extractId: cites.split(",")[0].trim(),
      quote: text.split(/\s+/).slice(0, 6).join(" "),
      reason: "Scripted check quotes the claim's opening words from the cited extract.",
    }));
    return { output: schema.parse({ checks, conflicts: [] }), modelId: options.modelId ?? "scripted/editor-drill", responseId: null };
  }) as StructuredCall & { calls: Array<{ page: string; step: string; prompt: string }> };
  call.calls = calls;
  return call;
}
