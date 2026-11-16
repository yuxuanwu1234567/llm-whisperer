/**
 * DSML (Domain-Specific Markup Language) tool-call parser.
 *
 * The real DSML wire format is an XML-like structure using `<|| DSML || ...>` as
 * tag delimiters. A model (e.g. DeepSeek via browser) emits tool calls as:
 *
 *   <|| DSML || calls>
 *     <||* DSML || invoke name="get_weather">
 *       <|| DSML || parameter name="city" string="true">Kathmandu</|| DSML || parameter>
 *     </|| DSML || invoke>
 *   </|| DSML || calls>
 *
 * Some models omit the `<...calls>` wrapper and emit bare `<...invoke>` elements.
 * The `string` attribute on `parameter` may also be absent. Both are tolerated.
 */

import { newCallId, ToolCallScanner, type ToolCall } from "./tool-protocol.js";

const WSPR_OPEN = "\u003ctool_call\u003e";

const DSML_BEGIN_RE = /<\s*[|｜]{2}\s*DSML\s*[|｜]{2}\s*calls\s*>/;
const DSML_END_RE = /<\s*\/\s*[|｜]{2}\s*DSML\s*[|｜]{2}\s*calls\s*>/;
const DSML_INVOKE_BEGIN_RE = /<\s*[|｜]{2}\s*DSML\s*[|｜]{2}\s*invoke\s+name="[^"]*"\s*>/;
const DSML_INVOKE_END_RE = /<\s*\/\s*[|｜]{2}\s*DSML\s*[|｜]{2}\s*invoke\s*>/;
const INVOKE_RE =
  /<\s*[|｜]{2}\s*DSML\s*[|｜]{2}\s*invoke\s+name="([^"]*)"\s*>([\s\S]*?)<\s*\/\s*[|｜]{2}\s*DSML\s*[|｜]{2}\s*invoke\s*>/g;
const PARAM_RE =
  /<\s*[|｜]{2}\s*DSML\s*[|｜]{2}\s*parameter\s+name="([^"]*)"(?:\s+string="([^"]*)")?\s*>([\s\S]*?)<\s*\/\s*[|｜]{2}\s*DSML\s*[|｜]{2}\s*parameter\s*>/g;

/**
 * Parse every DSML tool-call block in `text`. Returns the prose with the DSML
 * regions removed and the extracted calls. Handles both a `<...calls>` wrapper
 * and bare `<...invoke>` elements (some models omit the wrapper).
 */
export function parseDsmlToolCalls(
  text: string,
  toolNames?: ReadonlySet<string>,
): { text: string; calls: ToolCall[] } {
  const beginMatch = text.match(DSML_BEGIN_RE);
  if (beginMatch) {
    const beginIdx = beginMatch.index!;
    const afterBegin = beginIdx + beginMatch[0].length;
    const rest = text.slice(afterBegin);
    const endMatch = rest.match(DSML_END_RE);
    const endIdx = endMatch ? afterBegin + endMatch.index! : text.length;
    const endLen = endMatch ? endMatch[0].length : 0;
    const blockEnd = endIdx + endLen;
    const block = text.slice(beginIdx, blockEnd);
    const prose = text.slice(0, beginIdx) + (endMatch ? text.slice(blockEnd) : "");
    return { text: prose, calls: parseInvokes(block, toolNames) };
  }

  const calls = parseInvokes(text, toolNames);
  if (calls.length === 0) return { text, calls: [] };
  const prose = stripInvokes(text);
  return { text: prose, calls };
}

/** Extract every `<|| DSML || invoke>` element from a block. */
function parseInvokes(block: string, toolNames?: ReadonlySet<string>): ToolCall[] {
  const calls: ToolCall[] = [];
  INVOKE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INVOKE_RE.exec(block))) {
    const name = m[1];
    const body = m[2];
    if (toolNames && !toolNames.has(name)) continue;
    const args = parseParams(body);
    calls.push({ id: newCallId(), name, arguments: JSON.stringify(args) });
  }
  return calls;
}

/** Remove all `<|| DSML || invoke>` elements from text, leaving prose. */
function stripInvokes(text: string): string {
  INVOKE_RE.lastIndex = 0;
  return text.replace(INVOKE_RE, "");
}

/** Parse all `<|| DSML || parameter>` children of an invoke element. */
function parseParams(body: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  PARAM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PARAM_RE.exec(body))) {
    const [, name, isString, rawValue] = m;
    const value = rawValue.trim();
    args[name] = (isString ?? "true") === "true" ? value : tryParse(value);
  }
  return args;
}

/** Parse a non-string parameter value (boolean / number / null). */
function tryParse(s: string): unknown {
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  const num = Number(s);
  if (!Number.isNaN(num) && s.trim() !== "") return num;
  return s;
}

/**
 * Streaming scanner for DSML tool-call blocks. Same interface as
 * {@link ToolCallScanner}: feed deltas with `push`, drain with `flush`.
 */
export class DsmlScanner {
  private buffer = "";
  private tools: ReadonlySet<string> | undefined;
  private mode: "none" | "calls" | "invoke" = "none";
  private disabled: boolean;

  constructor(tools?: ReadonlySet<string>) {
    this.tools = tools;
    this.disabled = !tools || tools.size === 0;
  }

  push(delta: string): { text: string; calls: ToolCall[] } {
    if (this.disabled) return { text: delta, calls: [] };
    this.buffer += delta;

    if (this.mode === "none") {
      const beginCalls = this.buffer.match(DSML_BEGIN_RE);
      if (beginCalls) {
        const text = this.buffer.slice(0, beginCalls.index!);
        this.buffer = this.buffer.slice(beginCalls.index!);
        this.mode = "calls";
        if (text) return { text, calls: [] };
      } else {
        const beginInvoke = this.buffer.match(DSML_INVOKE_BEGIN_RE);
        if (beginInvoke) {
          const text = this.buffer.slice(0, beginInvoke.index!);
          this.buffer = this.buffer.slice(beginInvoke.index!);
          this.mode = "invoke";
          if (text) return { text, calls: [] };
        } else {
          const hold = markerHoldLength(this.buffer);
          const emitLen = this.buffer.length - hold;
          if (emitLen > 0) {
            const text = this.buffer.slice(0, emitLen);
            this.buffer = this.buffer.slice(emitLen);
            return { text, calls: [] };
          }
          return { text: "", calls: [] };
        }
      }
    }

    const endRe = this.mode === "calls" ? DSML_END_RE : DSML_INVOKE_END_RE;
    const endMatch = this.buffer.match(endRe);
    if (!endMatch) return { text: "", calls: [] };

    const endIdx = endMatch.index!;
    const endLen = endMatch[0].length;
    const block = this.buffer.slice(0, endIdx + endLen);
    this.buffer = this.buffer.slice(endIdx + endLen);
    this.mode = "none";

    const { calls } = parseDsmlToolCalls(block, this.tools);
    return { text: "", calls };
  }

  flush(): { text: string; calls: ToolCall[] } {
    if (this.disabled) return { text: "", calls: [] };
    const text = this.buffer;
    this.buffer = "";
    if (this.mode !== "none") {
      const { calls, text: leftover } = parseDsmlToolCalls(text, this.tools);
      this.mode = "none";
      if (calls.length) return { text: leftover, calls };
      return { text, calls: [] };
    }
    return { text, calls: [] };
  }
}

/**
 * A streaming scanner that routes each turn to either the wspr `` protocol
 * ({@link ToolCallScanner}) or the DSML protocol ({@link DsmlScanner}).
 */
export class MultiToolCallScanner {
  private wspr: ToolCallScanner;
  private dsml: DsmlScanner;
  private mode: "unknown" | "dsml" | "wspr" = "unknown";
  private buffer = "";
  private disabled: boolean;

  constructor(tools?: ReadonlySet<string>) {
    this.disabled = !tools || tools.size === 0;
    this.wspr = new ToolCallScanner(tools);
    this.dsml = new DsmlScanner(tools);
  }

  push(delta: string): { text: string; calls: ToolCall[] } {
    if (this.disabled) return { text: delta, calls: [] };
    if (this.mode === "dsml") return this.dsml.push(delta);
    if (this.mode === "wspr") return this.wspr.push(delta);

    this.buffer += delta;

    const wsprIdx = this.buffer.indexOf(WSPR_OPEN);
    const dsmlCallsMatch = this.buffer.match(DSML_BEGIN_RE);
    const dsmlInvokeMatch = this.buffer.match(DSML_INVOKE_BEGIN_RE);
    const dsmlIdx = dsmlCallsMatch
      ? dsmlCallsMatch.index!
      : dsmlInvokeMatch
        ? dsmlInvokeMatch.index!
        : -1;

    if (dsmlIdx !== -1 && (wsprIdx === -1 || dsmlIdx < wsprIdx)) {
      this.mode = "dsml";
      const before = this.buffer.slice(0, dsmlIdx);
      const rest = this.buffer.slice(dsmlIdx);
      this.buffer = "";
      const out = this.dsml.push(rest);
      return { text: before + out.text, calls: out.calls };
    }

    if (wsprIdx !== -1) {
      this.mode = "wspr";
      const before = this.buffer.slice(0, wsprIdx);
      const rest = this.buffer.slice(wsprIdx);
      this.buffer = "";
      const out = this.wspr.push(rest);
      return { text: before + out.text, calls: out.calls };
    }

    const hold = markerHoldLength(this.buffer);
    const emitLen = this.buffer.length - hold;
    if (emitLen > 0) {
      const text = this.buffer.slice(0, emitLen);
      this.buffer = this.buffer.slice(emitLen);
      return { text, calls: [] };
    }
    return { text: "", calls: [] };
  }

  flush(): { text: string; calls: ToolCall[] } {
    if (this.disabled) return { text: "", calls: [] };
    if (this.mode === "dsml") return this.dsml.flush();
    if (this.mode === "wspr") return this.wspr.flush();
    const text = this.buffer;
    this.buffer = "";
    return { text, calls: [] };
  }
}

/**
 * Hold back a trailing suffix of `s` that could grow into a DSML begin marker
 * or a wspr open marker. Tolerates whitespace variations like `< || DSML ||`.
 * Returns the number of trailing characters to withhold.
 */
function markerHoldLength(s: string): number {
  const lt = s.lastIndexOf("<");
  if (lt === -1) return 0;
  const tail = s.slice(lt);
  if (tail.length > 32) return 0;
  if (DSML_BEGIN_RE.test(tail) || DSML_INVOKE_BEGIN_RE.test(tail) || tail.includes(WSPR_OPEN)) return 0;
  return tail.length;
}
