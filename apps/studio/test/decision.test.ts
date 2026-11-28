import { expect, it } from "@effect/vitest";

import type {
  DecisionRecordValue,
  RecordsValue,
} from "../src/domain/decision.ts";
import { answerQueue, choicesOf, decides } from "../src/domain/decision.ts";

const record = (
  id: string,
  extra: Partial<DecisionRecordValue> = {}
): DecisionRecordValue => ({
  date: null,
  doc: "doc",
  fields: {},
  id,
  line: 1,
  options: [],
  path: `docs/${id}.md`,
  state: "open",
  text: "",
  title: id,
  unblocks: [],
  who: null,
  ...extra,
});

it("the queue holds live records, unblocking ones first, skipped ones last", () => {
  const records = [
    record("a"),
    record("b", { unblocks: ["step 2"] }),
    record("c", { state: "confirmed" }),
    record("d"),
  ];

  expect(
    answerQueue(records, "", ["a"]).map((entry) => entry.id)
  ).toStrictEqual(["b", "d", "a"]);
});

it("the queue searches ids, titles and questions", () => {
  const records = [
    record("a", { fields: { Question: ["Which rig?"] } }),
    record("b"),
  ];

  expect(
    answerQueue(records, "rig", []).map((entry) => entry.id)
  ).toStrictEqual(["a"]);
});

it("choices are the options, as recommended when there is a text, and Other", () => {
  const choices = choicesOf(
    record("a", {
      options: [{ label: "Grey", letter: "a", why: "fast" }],
      recommendation: { letter: null, text: "Do it", why: "" },
    })
  );

  expect(choices.map((choice) => choice.key)).toStrictEqual([
    "a",
    "rec",
    "other",
  ]);
});

it("the lead or an owner decides", () => {
  const data: RecordsValue = {
    lead: "lead",
    me: { login: "ann" },
    records: [],
  };

  expect(decides(data, record("a"))).toBe(false);
  expect(decides(data, record("a", { owners: ["@ann"] }))).toBe(true);
  expect(decides({ ...data, me: { login: "lead" } }, record("a"))).toBe(true);
});
