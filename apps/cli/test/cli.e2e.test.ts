// @effect-diagnostics nodeBuiltinImport:off asyncFunction:off newPromise:off globalTimers:off -- Black-box tests of the built binary: they spawn dist/cli.js as a child process and assert on stdout, stderr, and exit codes. Node built-ins and a Promise-based stdio conversation are the right tools at that boundary, so the Effect-native diagnostics are off here.
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "@effect/vitest";
import { CallEntrySchema, OutcomeSchema } from "@gds/devtools";
import { Schema } from "effect";

const cliDir = path.resolve(import.meta.dirname, "..");

const repoRoot = path.resolve(cliDir, "../..");

const cliPath = path.join(cliDir, "dist", "cli.js");

const toolNames = [
  "listStudios",
  "getAsset",
  "addVariants",
  "render",
  "pick",
  "round",
  "getPack",
  "openCheck",
] as const;

const decodeOpenApi = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      paths: Schema.Record(
        Schema.String,
        Schema.Record(Schema.String, Schema.Unknown)
      ),
    })
  )
);

const JsonRpcResponse = Schema.Struct({
  error: Schema.optional(Schema.Unknown),
  id: Schema.optional(Schema.Finite),
  result: Schema.optional(Schema.Unknown),
});

const decodeJsonRpcResponse = Schema.decodeUnknownSync(
  Schema.fromJsonString(JsonRpcResponse)
);

const decodeDevtoolsCall = Schema.decodeUnknownSync(
  Schema.Struct({
    structuredContent: Schema.Struct({
      result: Schema.Struct({
        entries: Schema.Array(CallEntrySchema),
        matched: Schema.Int,
      }),
    }),
  })
);

const decodeToolsList = Schema.decodeUnknownSync(
  Schema.Struct({
    tools: Schema.Array(
      Schema.Struct({
        annotations: Schema.optional(
          Schema.Struct({ readOnlyHint: Schema.optional(Schema.Boolean) })
        ),
        name: Schema.String,
      })
    ),
  })
);

const runCli = (arguments_: readonly string[]) =>
  spawnSync(process.execPath, [cliPath, ...arguments_], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

const mcpConversation = async (
  messages: readonly object[],
  flags: readonly string[] = []
): Promise<(typeof JsonRpcResponse.Type)[]> =>
  // oxlint-disable-next-line promise/avoid-new -- A child process conversation has no library Promise to return.
  await new Promise<(typeof JsonRpcResponse.Type)[]>((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "mcp", ...flags], {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const responses: (typeof JsonRpcResponse.Type)[] = [];
    const wanted = messages.filter((message) => "id" in message).length;
    let buffer = "";

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`mcp timed out with stdout: ${buffer}`));
    }, 15_000);

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.trim() === "") {
          continue;
        }

        const message = decodeJsonRpcResponse(line);

        if (message.id !== undefined) {
          responses.push(message);
        }
      }

      if (responses.length >= wanted) {
        clearTimeout(timer);
        child.kill();
        resolve(responses);
      }
    });
    child.on("error", reject);

    for (const message of messages) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    }
  });

describe("built CLI", () => {
  it("prints help naming every capability and surface", () => {
    const result = runCli(["--help"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("USAGE");

    for (const name of [...toolNames, "catalog", "openapi", "serve", "mcp"]) {
      expect(result.stdout).toContain(name);
    }
  });

  it("reports the typed not-built failure and exits one", () => {
    const result = runCli(["listStudios"]);

    expect(result.status).toBe(1);
    expect(`${result.stdout}${result.stderr}`).toContain(
      "listStudios has a contract but no handler yet"
    );
  });

  it("prints the catalog as TypeScript declarations", () => {
    const result = runCli(["catalog", "--types"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("declare const tools: {");
    expect(result.stdout).toContain("readonly listStudios: (input:");
  });

  it("prints an OpenAPI document with one path per capability", () => {
    const result = runCli(["openapi"]);

    expect(result.status).toBe(0);
    const document = decodeOpenApi(result.stdout);
    expect(Object.keys(document.paths).toSorted()).toEqual(
      toolNames.map((name) => `/${name}`).toSorted()
    );
  });
});

const initialize = [
  {
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      capabilities: {},
      clientInfo: { name: "e2e", version: "0.0.0" },
      protocolVersion: "2025-06-18",
    },
  },
  { jsonrpc: "2.0", method: "notifications/initialized" },
] as const;

describe("built MCP server", () => {
  it("lists the eight capabilities as tools over stdio", async () => {
    const responses = await mcpConversation([
      ...initialize,
      { id: 2, jsonrpc: "2.0", method: "tools/list", params: {} },
    ]);

    const listing = responses.find((response) => response.id === 2);
    expect(listing?.error).toBeUndefined();
    const result = decodeToolsList(listing?.result);

    expect(result.tools.map((tool) => tool.name).toSorted()).toEqual(
      [...toolNames].toSorted()
    );
    expect(
      result.tools.find((tool) => tool.name === "listStudios")?.annotations
        ?.readOnlyHint
    ).toBe(true);
  });

  it("returns the not-built failure to a code-mode program", async () => {
    const responses = await mcpConversation(
      [
        ...initialize,
        {
          id: 2,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: {
              code: "try { await tools.listStudios({}); return 'built'; } catch (error) { return error._tag ?? String(error); }",
            },
            name: "execute",
          },
        },
      ],
      ["--code-mode"]
    );

    const call = responses.find((response) => response.id === 2);
    expect(call?.error).toBeUndefined();
    expect(JSON.stringify(call?.result)).toContain("NotBuilt");
  });

  it("records calls and answers rat_list_calls with --devtools", async () => {
    const responses = await mcpConversation(
      [
        ...initialize,
        {
          id: 2,
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            arguments: {
              code: "await tools.getPack({ studio: 'vfx' }).catch(() => undefined); return await tools.rat_list_calls({});",
            },
            name: "execute",
          },
        },
      ],
      ["--devtools", "--code-mode"]
    );

    const call = responses.find((response) => response.id === 2);
    expect(call?.error).toBeUndefined();

    const { structuredContent } = decodeDevtoolsCall(call?.result);
    const { entries, matched } = structuredContent.result;
    const [entry] = entries;

    expect(matched).toBe(1);
    expect(entry).toMatchObject({
      capability: "getPack",
      input: { studio: "vfx" },
    });
    expect(
      entry !== undefined && OutcomeSchema.guards.Failed(entry.outcome)
    ).toBe(true);
  });
});
