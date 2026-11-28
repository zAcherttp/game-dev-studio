import { Command, Component, UiSchema } from "@effect/ui";
import { Html } from "@effect/ui/html";
import { Effect, Layer, Match, Schema } from "effect";
import { AsyncResult } from "effect/reactivity";

import { GetRecords, RecordsTag } from "../client/queries/get-records.ts";
import { failureText, Studio } from "../client/studio.ts";
import type { DecisionRecordValue, RecordsValue } from "../domain/decision.ts";
import {
  answerQueue,
  choicesOf,
  decides,
  isLive,
  matches,
  STATES,
} from "../domain/decision.ts";
import { Page } from "../domain/page.ts";

export const DecisionsMessage = UiSchema.TaggedEnum({
  ClickedBack: {},
  ClickedConfirm: {},
  ClickedRecord: { id: Schema.String },
  ClickedSkip: {},
  FailedAnswer: { id: Schema.String, reason: Schema.String },
  PickedChoice: { key: Schema.String },
  SelectedState: { state: Schema.String },
  SelectedTab: { tab: Schema.Literals(["answer", "all"]) },
  SucceededAnswer: { id: Schema.String, label: Schema.String },
  UpdatedNote: { value: Schema.String },
  UpdatedOther: { value: Schema.String },
  UpdatedQuery: { value: Schema.String },
});

const AnswerArgs = Schema.Struct({
  choice: Schema.String,
  digest: Schema.String,
  id: Schema.String,
  label: Schema.String,
  note: Schema.String,
  text: Schema.String,
});

export class AnswerDecision extends Command.Service<AnswerDecision>()(
  "gds/AnswerDecision",
  {
    args: { answer: AnswerArgs, page: Page },
    invalidates: () => [RecordsTag],
    mode: "queue",
    success: DecisionsMessage,
  }
) {
  static readonly layer = this.toLayer(
    Effect.gen(function* answerDecision() {
      const studio = yield* Studio;

      return ({ answer, page }) =>
        studio
          .answer(page, {
            choice: answer.choice,
            digest: answer.digest,
            id: answer.id,
            note: answer.note,
            text: answer.text,
          })
          .pipe(
            Effect.match({
              onFailure: (error) =>
                DecisionsMessage.FailedAnswer({
                  id: answer.id,
                  reason: error.message,
                }),
              onSuccess: (result) =>
                result.ok
                  ? DecisionsMessage.SucceededAnswer({
                      id: answer.id,
                      label: answer.label,
                    })
                  : DecisionsMessage.FailedAnswer({
                      id: answer.id,
                      reason: (result.problems ?? ["Refused."]).join("\n"),
                    }),
            })
          );
    })
  );
}

const DecisionsModel = Schema.Struct({
  busy: Schema.Boolean,
  current: Schema.String,
  flash: Schema.String,
  flashBad: Schema.Boolean,
  note: Schema.String,
  other: Schema.String,
  pick: Schema.String,
  query: Schema.String,
  skipped: Schema.Array(Schema.String),
  state: Schema.String,
  tab: Schema.Literals(["answer", "all"]),
  trail: Schema.Array(Schema.String),
});

type Model = typeof DecisionsModel.Type;

const DecisionsDef = Html.component({
  message: DecisionsMessage,
  model: DecisionsModel,
  name: "Decisions",
  props: Schema.Struct({ page: Page }),
  queries: {
    records: { args: ({ props }) => ({ page: props.page }), query: GetRecords },
  },
});

const cardOf = (data: RecordsValue, model: Model) => {
  const queue = answerQueue(data.records, model.query, model.skipped);

  return queue.find((record) => record.id === model.current) ?? queue[0];
};

const fresh = { note: "", other: "", pick: "" } as const;

const choiceLabel = (
  record: DecisionRecordValue,
  key: string,
  other: string
) => {
  const choice = choicesOf(record).find((entry) => entry.key === key);

  if (choice === undefined) {
    return key;
  }

  return Match.value(key).pipe(
    Match.when("other", () => `Other: ${other}`),
    Match.when("rec", () => "As recommended"),
    Match.orElse(() => `(${choice.key}) ${choice.label}`)
  );
};

const answerCard = DecisionsDef.fragment(
  (
    h,
    data: RecordsValue,
    record: DecisionRecordValue,
    model: Model,
    total: number,
    at: number
  ) => {
    const mine = decides(data, record);

    return h.article.class("card").children(
      h.p
        .class("card-head")
        .children(
          h.span.class("count").children(`${at} of ${total}`),
          h.code(record.id),
          h.span.class(`state state-${record.state}`).children(record.state),
          h.span
            .class("where")
            .children(
              [record.doc, record.area ?? ""].filter(Boolean).join(" · ")
            )
        ),
      h.h2(record.title),
      h.p.class("text").children(record.text),
      record.unblocks.length === 0
        ? []
        : h.p
            .class("unblocks")
            .children(`Unblocks ${record.unblocks.join(", ")}`),
      (record.fields.Question ?? []).map((question, index) =>
        h.blockquote.key(`q${index}`).children(question)
      ),
      h.div
        .class("choices")
        .attr("role", "radiogroup")
        .children(
          choicesOf(record).map((choice, index) =>
            h.button
              .key(choice.key)
              .class(
                "choice",
                model.pick === choice.key && "on",
                choice.recommended && "rec"
              )
              .attr("role", "radio")
              .attr("aria-checked", String(model.pick === choice.key))
              .on("click", DecisionsMessage.PickedChoice({ key: choice.key }))
              .children(
                h.span.class("n").children(String(index + 1)),
                h.span.class("label").children(choice.label),
                choice.why === ""
                  ? []
                  : h.span.class("why").children(choice.why)
              )
          )
        ),
      model.pick === "other"
        ? h.textarea
            .class("other")
            .attr("placeholder", "Your own answer")
            .attr("aria-label", "Your own answer")
            .value(model.other)
            .on("input", (payload) =>
              DecisionsMessage.UpdatedOther({ value: payload.value })
            )
        : [],
      h.input
        .class("note-input")
        .attr("placeholder", "Note (optional, written with the answer)")
        .attr("aria-label", "Note")
        .value(model.note)
        .on("input", (payload) =>
          DecisionsMessage.UpdatedNote({ value: payload.value })
        ),
      model.flash === ""
        ? []
        : h.p
            .class("flash", model.flashBad && "bad")
            .attr("role", "status")
            .children(model.flash),
      h.div.class("actions").children(
        h.button.on("click", DecisionsMessage.ClickedBack()).children("Back"),
        h.button.on("click", DecisionsMessage.ClickedSkip()).children("Skip"),
        h.button
          .class("primary")
          .disabled(!mine || model.busy || model.pick === "")
          .attr(
            "title",
            mine ? "" : "Only the lead or the record's owner decides it"
          )
          .on("click", DecisionsMessage.ClickedConfirm())
          .children(model.busy ? "Saving…" : "Confirm")
      )
    );
  }
);

const answerOrDone = DecisionsDef.fragment(
  (
    h,
    data: RecordsValue,
    card: DecisionRecordValue | undefined,
    model: Model,
    total: number,
    at: number
  ) =>
    card === undefined
      ? h.p.class("note pad").children("Nothing left to answer here.")
      : answerCard(h, data, card, model, total, at)
);

const allList = DecisionsDef.fragment((h, data: RecordsValue, model: Model) => {
  const shown = data.records.filter(
    (record) =>
      (model.state === "" || record.state === model.state) &&
      matches(record, model.query)
  );

  return h.div.class("all").children(
    h.div.class("states").children(
      ["", ...STATES].map((state) =>
        h.button
          .key(state === "" ? "any" : state)
          .attr("aria-pressed", String(model.state === state))
          .on("click", DecisionsMessage.SelectedState({ state }))
          .children(
            `${state === "" ? "All" : state} ${state === "" ? data.records.length : data.records.filter((record) => record.state === state).length}`
          )
      )
    ),
    h.ul.class("rows").children(
      shown.slice(0, 300).map((record) =>
        h.li.key(record.id).children(
          h.button
            .class("row")
            .disabled(!isLive(record))
            .on("click", DecisionsMessage.ClickedRecord({ id: record.id }))
            .children(
              h.code(record.id),
              h.span
                .class(`state state-${record.state}`)
                .children(record.state),
              h.span.class("title").children(record.title)
            )
        )
      )
    ),
    shown.length > 300
      ? h.p
          .class("note")
          .children(`Showing 300 of ${shown.length}. Search to narrow.`)
      : []
  );
});

export const DecisionsNoDeps = DecisionsDef.make({
  init: () => ({
    busy: false,
    current: "",
    flash: "",
    flashBad: false,
    note: "",
    other: "",
    pick: "",
    query: "",
    skipped: [],
    state: "open",
    tab: "answer",
    trail: [],
  }),
  update: ($, message) => {
    const data = AsyncResult.isSuccess($.queries.records)
      ? $.queries.records.value
      : undefined;

    const card = data === undefined ? undefined : cardOf(data, $.model);

    return DecisionsMessage.match(message, {
      ClickedBack: () => {
        const back = $.model.trail.at(-1);

        return back === undefined
          ? $.model
          : $.evolve({
              ...fresh,
              current: back,
              flash: "",
              trail: $.model.trail.slice(0, -1),
            });
      },
      ClickedConfirm: () => {
        if (
          card === undefined ||
          data === undefined ||
          !decides(data, card) ||
          $.model.busy
        ) {
          return $.model;
        }

        if ($.model.pick === "other" && $.model.other.trim() === "") {
          return $.evolve({
            flash: "Write your answer in Other, or pick an option.",
            flashBad: true,
          });
        }

        return $.evolve({ busy: true, flash: "" }).run(
          AnswerDecision.make({
            answer: {
              choice: $.model.pick,
              digest: card.digest ?? "",
              id: card.id,
              label: choiceLabel(card, $.model.pick, $.model.other),
              note: $.model.note,
              text: $.model.pick === "other" ? $.model.other : "",
            },
            page: $.props.page,
          })
        );
      },
      ClickedRecord: ({ id }) =>
        $.evolve({
          ...fresh,
          current: id,
          flash: "",
          query: "",
          tab: "answer",
        }),
      ClickedSkip: () =>
        card === undefined
          ? $.model
          : $.evolve({
              ...fresh,
              current: "",
              flash: "",
              skipped: [
                ...$.model.skipped.filter((id) => id !== card.id),
                card.id,
              ],
              trail: [...$.model.trail, card.id],
            }),
      FailedAnswer: ({ reason }) =>
        $.evolve({ busy: false, flash: reason, flashBad: true }),
      PickedChoice: ({ key }) => $.evolve({ pick: key }),
      SelectedState: ({ state }) => $.evolve({ state }),
      SelectedTab: ({ tab }) => $.evolve({ tab }),
      SucceededAnswer: ({ id, label }) =>
        $.evolve({
          ...fresh,
          busy: false,
          current: "",
          flash: `Confirmed ${id}: ${label}`,
          flashBad: false,
          trail: [...$.model.trail, id],
        }),
      UpdatedNote: ({ value }) => $.evolve({ note: value }),
      UpdatedOther: ({ value }) => $.evolve({ other: value }),
      UpdatedQuery: ({ value }) => $.evolve({ current: "", query: value }),
    });
  },
  view: (h, model) =>
    AsyncResult.match(h.queries.records, {
      onFailure: ({ cause }) =>
        h.p.class("note pad").children(failureText(cause)),
      onInitial: () =>
        h.p
          .class("note pad")
          .children("Loading decisions… the first load takes a few seconds."),
      onSuccess: ({ value: data }) => {
        const queue = answerQueue(data.records, model.query, model.skipped);
        const card = cardOf(data, model);
        const at = card === undefined ? 0 : queue.indexOf(card) + 1;

        return h.section.class("decisions").children(
          h.header.class("tools").children(
            h.h1(h.props.page.title),
            h.div
              .class("tabs")
              .attr("role", "tablist")
              .children(
                h.button
                  .attr("role", "tab")
                  .attr("aria-selected", String(model.tab === "answer"))
                  .on("click", DecisionsMessage.SelectedTab({ tab: "answer" }))
                  .children(`Answer ${queue.length}`),
                h.button
                  .attr("role", "tab")
                  .attr("aria-selected", String(model.tab === "all"))
                  .on("click", DecisionsMessage.SelectedTab({ tab: "all" }))
                  .children(`All ${data.records.length}`)
              ),
            h.input
              .class("search")
              .attr("type", "search")
              .attr("placeholder", "Search ids, titles, calls")
              .attr("aria-label", "Search")
              .value(model.query)
              .on("input", (payload) =>
                DecisionsMessage.UpdatedQuery({ value: payload.value })
              ),
            h.span
              .class("me")
              .children(`as ${data.me?.name ?? data.me?.login ?? "nobody"}`)
          ),
          model.tab === "all"
            ? allList(h, data, model)
            : answerOrDone(h, data, card, model, queue.length, at)
        );
      },
    }),
});

export const Decisions = DecisionsNoDeps.pipe(
  Component.provide([
    GetRecords.layer.pipe(Layer.provide(Studio.layerHttp)),
    AnswerDecision.layer.pipe(Layer.provide(Studio.layerHttp)),
  ])
);
