import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseDsmlToolCalls,
  DsmlScanner,
  MultiToolCallScanner,
} from "../src/providers/dsml-parser.js";

const TOOLS = new Set(["Grep", "Read", "get_weather"]);

function dsmlBlock(calls: string): string {
  return `<|| DSML || calls>${calls}</|| DSML || calls>`;
}

function invoke(name: string, params: string): string {
  return `<|| DSML || invoke name="${name}">${params}</|| DSML || invoke>`;
}

function param(name: string, isString: boolean, value: string): string {
  return `<|| DSML || parameter name="${name}" string="${isString}">${value}</|| DSML || parameter>`;
}

describe("parseDsmlToolCalls", () => {
  it("returns text unchanged when there is no DSML marker", () => {
    const out = parseDsmlToolCalls("just prose, no tools", TOOLS);
    assert.equal(out.text, "just prose, no tools");
    assert.equal(out.calls.length, 0);
  });

  it("parses a single invoke with string parameters", () => {
    const block = dsmlBlock(
      invoke(
        "Grep",
        param("pattern", true, "WA_TranslucentBackground|FramelessWindowHint") +
          param("path", true, "d:\\trunk\\src\\mainwindow.cpp") +
          param("output_mode", true, "content") +
          param("-n", false, "true"),
      ),
    );
    const out = parseDsmlToolCalls(block, TOOLS);
    assert.equal(out.calls.length, 1);
    assert.equal(out.calls[0].name, "Grep");
    const args = JSON.parse(out.calls[0].arguments);
    assert.equal(args.pattern, "WA_TranslucentBackground|FramelessWindowHint");
    assert.equal(args.path, "d:\\trunk\\src\\mainwindow.cpp");
    assert.equal(args.output_mode, "content");
    assert.equal(args["-n"], true);
  });

  it("parses multiple invokes (Grep + Read) matching the screenshot", () => {
    const block = dsmlBlock(
      invoke(
        "Grep",
        param("pattern", true, "WA_TranslucentBackground|setAttribute|FramelessWindowHint") +
          param("path", true, "d:\\trunk\\EmmdaSystem\\src\\mainwindow.cpp") +
          param("output_mode", true, "content") +
          param("-n", false, "true"),
      ) +
        invoke(
          "Read",
          param("file_path", true, "d:\\trunk\\EmmdaSystem\\src\\mainwindow.cpp") +
            param("offset", false, "1440") +
            param("limit", false, "70"),
        ),
    );
    const out = parseDsmlToolCalls(block, TOOLS);
    assert.equal(out.calls.length, 2);
    assert.equal(out.calls[0].name, "Grep");
    assert.equal(out.calls[1].name, "Read");
    const readArgs = JSON.parse(out.calls[1].arguments);
    assert.equal(readArgs.file_path, "d:\\trunk\\EmmdaSystem\\src\\mainwindow.cpp");
    assert.equal(readArgs.offset, 1440);
    assert.equal(readArgs.limit, 70);
  });

  it("keeps surrounding prose and removes the DSML block", () => {
    const block = dsmlBlock(invoke("get_weather", param("city", true, "北京")));
    const text = "让我查一下。\n" + block + "\n完成。";
    const out = parseDsmlToolCalls(text, TOOLS);
    assert.equal(out.calls.length, 1);
    assert.equal(out.text, "让我查一下。\n\n完成。");
  });

  it("skips invokes with unknown tool names", () => {
    const block = dsmlBlock(
      invoke("UnknownTool", param("x", true, "1")) +
        invoke("get_weather", param("city", true, "KTM")),
    );
    const out = parseDsmlToolCalls(block, TOOLS);
    assert.equal(out.calls.length, 1);
    assert.equal(out.calls[0].name, "get_weather");
  });

  it("parses non-string parameters as booleans and numbers", () => {
    const block = dsmlBlock(
      invoke("Read", param("offset", false, "100") + param("verbose", false, "false")),
    );
    const out = parseDsmlToolCalls(block, TOOLS);
    const args = JSON.parse(out.calls[0].arguments);
    assert.equal(args.offset, 100);
    assert.equal(args.verbose, false);
  });

  it("tolerates whitespace variations in tags", () => {
    const block = `< || DSML || calls>< || DSML || invoke name="get_weather">< || DSML || parameter name="city" string="true">KTM< / || DSML || parameter>< / || DSML || invoke>< / || DSML || calls>`;
    const out = parseDsmlToolCalls(block, TOOLS);
    assert.equal(out.calls.length, 1);
    assert.equal(out.calls[0].name, "get_weather");
  });

  it("parses real DSML with fullwidth pipes (｜｜ U+FF5C) matching production output", () => {
    const dsml =
      "<\uff5c\uff5cDSML\uff5c\uff5c calls>" +
      '<\uff5c\uff5cDSML\uff5c\uff5c invoke name="WebSearch">' +
      '<\uff5c\uff5cDSML\uff5c\uff5c parameter name="query" string="true">Qt frameless flicker</\uff5c\uff5cDSML\uff5c\uff5c parameter>' +
      '<\uff5c\uff5cDSML\uff5c\uff5c parameter name="num" string="false">6</\uff5c\uff5cDSML\uff5c\uff5c parameter>' +
      "</\uff5c\uff5cDSML\uff5c\uff5c invoke>" +
      '<\uff5c\uff5cDSML\uff5c\uff5c invoke name="Read">' +
      '<\uff5c\uff5cDSML\uff5c\uff5c parameter name="file_path" string="true">d:\\trunk\\src\\mainwindow.cpp</\uff5c\uff5cDSML\uff5c\uff5c parameter>' +
      '<\uff5c\uff5cDSML\uff5c\uff5c parameter name="offset" string="false">1440</\uff5c\uff5cDSML\uff5c\uff5c parameter>' +
      '<\uff5c\uff5cDSML\uff5c\uff5c parameter name="limit" string="false">120</\uff5c\uff5cDSML\uff5c\uff5c parameter>' +
      "</\uff5c\uff5cDSML\uff5c\uff5c invoke>" +
      "</\uff5c\uff5cDSML\uff5c\uff5c calls>";
    const out = parseDsmlToolCalls(dsml, new Set(["WebSearch", "Read"]));
    assert.equal(out.calls.length, 2);
    assert.equal(out.calls[0].name, "WebSearch");
    assert.equal(out.calls[1].name, "Read");
    const args0 = JSON.parse(out.calls[0].arguments);
    assert.equal(args0.query, "Qt frameless flicker");
    assert.equal(args0.num, 6);
    const args1 = JSON.parse(out.calls[1].arguments);
    assert.equal(args1.file_path, "d:\\trunk\\src\\mainwindow.cpp");
    assert.equal(args1.offset, 1440);
    assert.equal(args1.limit, 120);
  });

  it("parses bare invoke without a calls wrapper", () => {
    const dsml =
      '<|| DSML || invoke name="get_weather">' +
      '<|| DSML || parameter name="city" string="true">KTM</|| DSML || parameter>' +
      "</|| DSML || invoke>";
    const out = parseDsmlToolCalls(dsml, TOOLS);
    assert.equal(out.calls.length, 1);
    assert.equal(out.calls[0].name, "get_weather");
    assert.equal(out.text, "");
  });

  it("parses parameter without a string attribute (defaults to string)", () => {
    const dsml = dsmlBlock(
      invoke("get_weather", '<|| DSML || parameter name="city">KTM</|| DSML || parameter>'),
    );
    const out = parseDsmlToolCalls(dsml, TOOLS);
    assert.equal(out.calls.length, 1);
    const args = JSON.parse(out.calls[0].arguments);
    assert.equal(args.city, "KTM");
  });
});

describe("DsmlScanner", () => {
  const feed = (deltas: string[], tools = TOOLS) => {
    const s = new DsmlScanner(tools);
    let text = "";
    const calls: ToolCall[] = [];
    for (const d of deltas) {
      const out = s.push(d);
      text += out.text;
      calls.push(...out.calls);
    }
    const end = s.flush();
    return { text: text + end.text, calls: calls.concat(end.calls) };
  };

  it("is a passthrough when no tools are declared", () => {
    const s = new DsmlScanner();
    const block = dsmlBlock(invoke("get_weather", param("city", true, "KTM")));
    const out = s.push(block);
    assert.equal(out.calls.length, 0);
  });

  it("parses a complete block in one push", () => {
    const block = dsmlBlock(invoke("get_weather", param("city", true, "KTM")));
    const out = feed([block]);
    assert.equal(out.calls.length, 1);
    assert.equal(out.calls[0].name, "get_weather");
    assert.equal(out.text, "");
  });

  it("parses a block streamed one character at a time", () => {
    const block = dsmlBlock(invoke("get_weather", param("city", true, "KTM")));
    const out = feed(block.split(""));
    assert.equal(out.calls.length, 1);
    assert.equal(out.calls[0].name, "get_weather");
  });

  it("emits prose before and after the block", () => {
    const block = dsmlBlock(invoke("get_weather", param("city", true, "KTM")));
    const out = feed(["Checking.\n" + block + "\nDone."]);
    assert.equal(out.calls.length, 1);
    assert.equal(out.text, "Checking.\n\nDone.");
  });

  it("holds back a partial begin marker", () => {
    const s = new DsmlScanner(TOOLS);
    const out = s.push("prose <|| DSM");
    assert.equal(out.text, "prose ");
    assert.equal(out.calls.length, 0);
  });

  it("recovers calls from a never-closed block at flush", () => {
    const s = new DsmlScanner(TOOLS);
    s.push(dsmlBlock(invoke("get_weather", param("city", true, "KTM"))).replace("</|| DSML || calls>", ""));
    const out = s.flush();
    assert.equal(out.calls.length, 1);
  });
});

describe("MultiToolCallScanner", () => {
  const feed = (deltas: string[], tools = TOOLS) => {
    const s = new MultiToolCallScanner(tools);
    let text = "";
    const calls: ToolCall[] = [];
    for (const d of deltas) {
      const out = s.push(d);
      text += out.text;
      calls.push(...out.calls);
    }
    const end = s.flush();
    return { text: text + end.text, calls: calls.concat(end.calls) };
  };

  it("routes a DSML turn to the DSML parser", () => {
    const block = dsmlBlock(
      invoke("get_weather", param("city", true, "北京")),
    );
    const out = feed(["让我查一下。\n" + block + "\n完成。"]);
    assert.equal(out.calls.length, 1);
    assert.equal(out.calls[0].name, "get_weather");
    assert.equal(out.text, "让我查一下。\n\n完成。");
  });

  it("routes a wspr  turn to the wspr parser", () => {
    const block = "\u003ctool_call\u003e\n" + JSON.stringify({ name: "get_weather", arguments: { city: "KTM" } }) + "\n\u003c/tool_call\u003e";
    const out = feed(["Answer: " + block]);
    assert.equal(out.calls.length, 1);
    assert.equal(out.calls[0].name, "get_weather");
  });

  it("passes plain prose through untouched", () => {
    const out = feed(["Just a normal answer, no tools."]);
    assert.equal(out.text, "Just a normal answer, no tools.");
    assert.equal(out.calls.length, 0);
  });

  it("is a passthrough when no tools are declared", () => {
    const s = new MultiToolCallScanner();
    const block = dsmlBlock(invoke("get_weather", param("city", true, "KTM")));
    const out = s.push(block);
    assert.equal(out.calls.length, 0);
  });

  it("routes correctly when streamed one character at a time", () => {
    const block = dsmlBlock(invoke("get_weather", param("city", true, "KTM")));
    const text = "Prose.\n" + block;
    const out = feed(text.split(""));
    assert.equal(out.calls.length, 1);
    assert.equal(out.calls[0].name, "get_weather");
    assert.equal(out.text, "Prose.\n");
  });

  it("parses the real DSML format with spaces (< || DSML || ...>) streamed", () => {
    const block =
      "< || DSML || calls>" +
      "< || DSML || invoke name=\"WebSearch\">" +
      "< || DSML || parameter name=\"query\" string=\"true\">Qt frameless window flicker</ || DSML || parameter>" +
      "< || DSML || parameter name=\"num\" string=\"false\">6</ || DSML || parameter>" +
      "</ || DSML || invoke>" +
      "</ || DSML || calls>";
    const out = feed(block.split(""), new Set(["WebSearch", "Read"]));
    assert.equal(out.calls.length, 1);
    assert.equal(out.calls[0].name, "WebSearch");
    const args = JSON.parse(out.calls[0].arguments);
    assert.equal(args.query, "Qt frameless window flicker");
    assert.equal(args.num, 6);
  });
});

import type { ToolCall } from "../src/providers/tool-protocol.js";
