import { Schema } from "effect";

export const Option = Schema.Struct({
  label: Schema.String,
  letter: Schema.String,
  why: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

export const Recommendation = Schema.Struct({
  letter: Schema.optionalKey(Schema.NullOr(Schema.String)),
  text: Schema.optionalKey(Schema.String),
  why: Schema.optionalKey(Schema.String),
});

export const DecisionRecord = Schema.Struct({
  area: Schema.optionalKey(Schema.NullOr(Schema.String)),
  date: Schema.NullOr(Schema.String),
  digest: Schema.optionalKey(Schema.String),
  doc: Schema.String,
  fields: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  id: Schema.String,
  line: Schema.Finite,
  options: Schema.Array(Option),
  owners: Schema.optionalKey(Schema.Array(Schema.String)),
  path: Schema.String,
  recommendation: Schema.optionalKey(Schema.NullOr(Recommendation)),
  state: Schema.String,
  text: Schema.String,
  title: Schema.String,
  unblocks: Schema.Array(Schema.String),
  who: Schema.NullOr(Schema.String),
});

export type DecisionRecordValue = typeof DecisionRecord.Type;

export const Person = Schema.Struct({
  login: Schema.optionalKey(Schema.NullOr(Schema.String)),
  name: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

export const Records = Schema.Struct({
  lead: Schema.String,
  me: Schema.NullOr(Person),
  records: Schema.Array(DecisionRecord),
});

export type RecordsValue = typeof Records.Type;

export const AnswerResult = Schema.Struct({
  ok: Schema.Boolean,
  problems: Schema.optionalKey(Schema.Array(Schema.String)),
});

export interface Choice {
  readonly key: string;
  readonly label: string;
  readonly recommended: boolean;
  readonly why: string;
}

export const STATES = [
  "open",
  "recommended",
  "confirmed",
  "rejected",
  "superseded",
] as const;

export const isLive = (record: DecisionRecordValue) =>
  record.state === "open" || record.state === "recommended";

export const decides = (data: RecordsValue, record: DecisionRecordValue) => {
  const login = data.me?.login ?? "";

  return (
    login !== "" &&
    (login === data.lead || (record.owners ?? []).includes(`@${login}`))
  );
};

export const choicesOf = (record: DecisionRecordValue): readonly Choice[] => {
  const recommendation = record.recommendation ?? undefined;

  const options = record.options.map((option): Choice => ({
    key: option.letter,
    label: option.label,
    recommended: recommendation?.letter === option.letter,
    why: option.why ?? "",
  }));

  const asRecommended: readonly Choice[] =
    recommendation !== undefined && (recommendation.text ?? "") !== ""
      ? [
          {
            key: "rec",
            label: "As recommended",
            recommended: true,
            why: recommendation.text ?? "",
          },
        ]
      : [];

  return [
    ...options,
    ...asRecommended,
    { key: "other", label: "Other", recommended: false, why: "" },
  ];
};

export const matches = (record: DecisionRecordValue, query: string) => {
  const words = query.toLowerCase().split(/\s+/u).filter(Boolean);

  const hay =
    `${record.id} ${record.title} ${record.text} ${record.doc} ${record.area ?? ""} ${(record.fields.Question ?? []).join(" ")}`.toLowerCase();

  return words.every((word) => hay.includes(word));
};

export const answerQueue = (
  records: readonly DecisionRecordValue[],
  query: string,
  skipped: readonly string[]
) =>
  records
    .filter((record) => isLive(record) && matches(record, query))
    .toSorted(
      (a, b) =>
        skipped.indexOf(a.id) - skipped.indexOf(b.id) ||
        (b.unblocks.length > 0 ? 1 : 0) - (a.unblocks.length > 0 ? 1 : 0) ||
        a.path.localeCompare(b.path) ||
        a.line - b.line
    );
