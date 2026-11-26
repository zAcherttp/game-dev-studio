import { Option, Schema } from "effect";

type Json = Schema.Json;

export interface DevCall {
  readonly args: readonly Json[];
  readonly fn: string;
  readonly module: string;
}

export interface CallContext {
  readonly params: Readonly<Record<string, Json>>;
  readonly seed: number;
  readonly take: Readonly<Record<string, string>>;
}

const CALL =
  /^\s*(?<module>[A-Za-z_]\w*)\.(?<fn>[A-Za-z_]\w*)\s*(?:\((?<inner>.*)\))?\s*$/su;

const TOKEN = /\$(?<name>seed|take|params)(?:\.(?<key>[\w-]+))?/gu;

const decodeArgs = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Array(Schema.Json))
);

const decodeJson = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Json)
);

const tokenValue = (
  context: CallContext,
  name: string,
  key: string | undefined
): Json | undefined => {
  if (name === "seed") {
    return context.seed;
  }

  if (key === undefined) {
    return undefined;
  }

  return name === "take" ? context.take[key] : context.params[key];
};

export const resolveTokens = (text: string, context: CallContext): string =>
  text.replaceAll(TOKEN, (_whole, name: string, key: string | undefined) =>
    JSON.stringify(tokenValue(context, name, key) ?? null)
  );

export const parseCall = (
  text: string,
  context: CallContext
): Option.Option<DevCall> => {
  const found = CALL.exec(text);

  if (found === null) {
    return Option.none();
  }

  const module = found.groups?.module ?? "";
  const fn = found.groups?.fn ?? "";
  const inner = found.groups?.inner;

  if (inner === undefined || inner.trim() === "") {
    return Option.some({ args: [], fn, module });
  }

  return decodeArgs(`[${resolveTokens(inner, context)}]`).pipe(
    Option.map((args) => ({ args, fn, module }))
  );
};

export const gateCall = (
  run: readonly [string, ...string[]],
  context: CallContext
): Option.Option<DevCall> => {
  const [head, ...rest] = run;

  return parseCall(head, context).pipe(
    Option.map((call) => ({
      ...call,
      args: [
        ...call.args,
        ...rest.map((arg) =>
          Option.getOrElse(decodeJson(resolveTokens(arg, context)), () => arg)
        ),
      ],
    }))
  );
};

export const CallOutcome = Schema.Struct({
  error: Schema.optionalKey(Schema.String),
  ok: Schema.Boolean,
  value: Schema.optionalKey(Schema.Json),
});

export const CALL_MARK = "GDSJSON ";

const luauString = (text: string): string => {
  let level = 0;

  while (text.includes(`]${"=".repeat(level)}]`)) {
    level += 1;
  }

  const bar = "=".repeat(level);

  return `[${bar}[${text}]${bar}]`;
};

export const serverCallsLuau = (calls: readonly DevCall[]): string => {
  const encoded = JSON.stringify(
    calls.map((call) => ({
      args: call.args.map((value) => ({ v: value })),
      fn: call.fn,
      module: call.module,
      n: call.args.length,
    }))
  );

  return [
    'local HttpService = game:GetService("HttpService")',
    'local ServerScriptService = game:GetService("ServerScriptService")',
    `local calls = HttpService:JSONDecode(${luauString(encoded)})`,
    "local function invoke(call)",
    "    local module = ServerScriptService:FindFirstChild(call.module, true)",
    '    assert(module and module:IsA("ModuleScript"), "no dev module " .. call.module .. " under ServerScriptService")',
    "    local api = require(module)",
    "    local fn = api[call.fn]",
    '    assert(type(fn) == "function", call.module .. " has no function " .. call.fn)',
    "    local args = {}",
    "    for index = 1, call.n do",
    "        args[index] = call.args[index].v",
    "    end",
    "    return fn(table.unpack(args, 1, call.n))",
    "end",
    "local out = {}",
    "for index, call in calls do",
    "    local ok, value = pcall(invoke, call)",
    "    if ok then",
    "        local fine = pcall(HttpService.JSONEncode, HttpService, { value })",
    "        out[index] = { ok = true, value = if fine then value else tostring(value) }",
    "    else",
    "        out[index] = { ok = false, error = tostring(value) }",
    "    end",
    "end",
    `return ${JSON.stringify(CALL_MARK)} .. HttpService:JSONEncode(out)`,
    "",
  ].join("\n");
};

export interface CameraPose {
  readonly fov: number;
  readonly lookAt: readonly [number, number, number];
  readonly position: readonly [number, number, number];
}

export const cameraLuau = (pose: CameraPose, settle: number): string =>
  [
    'local Players = game:GetService("Players")',
    'local StarterGui = game:GetService("StarterGui")',
    `local eye = Vector3.new(${pose.position.join(", ")})`,
    `local target = Vector3.new(${pose.lookAt.join(", ")})`,
    "local player = Players.LocalPlayer",
    "pcall(function()",
    "    player:RequestStreamAroundAsync(eye, 10)",
    "end)",
    "pcall(function()",
    "    StarterGui:SetCoreGuiEnabled(Enum.CoreGuiType.All, false)",
    "end)",
    'for _, gui in player:WaitForChild("PlayerGui"):GetChildren() do',
    '    if gui:IsA("ScreenGui") then',
    "        gui.Enabled = false",
    "    end",
    "end",
    "local camera = workspace.CurrentCamera",
    "camera.CameraType = Enum.CameraType.Scriptable",
    `camera.FieldOfView = ${pose.fov}`,
    "camera.CFrame = CFrame.lookAt(eye, target)",
    `task.wait(${settle})`,
    "camera.CFrame = CFrame.lookAt(eye, target)",
    `return ${JSON.stringify(CALL_MARK)} .. "placed"`,
    "",
  ].join("\n");

export const markedLine = (printed: string): Option.Option<string> =>
  Option.fromUndefinedOr(
    printed
      .split("\n")
      .map((line) => line.trim())
      .findLast((line) => line.startsWith(CALL_MARK))
  ).pipe(Option.map((line) => line.slice(CALL_MARK.length)));
