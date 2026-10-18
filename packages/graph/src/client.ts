export interface FalkorDBConfig {
  url: string;
  username?: string;
  password?: string;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

function encodeCommand(args: string[]): string {
  let out = `*${args.length}\r\n`;
  for (const arg of args) {
    out += `$${Buffer.byteLength(arg)}\r\n${arg}\r\n`;
  }
  return out;
}

function parseValue(input: string, start: number): { value: unknown; end: number } | null {
  if (start >= input.length) return null;
  const type = input[start];
  const lineEnd = input.indexOf("\r\n", start);
  if (type === "+" || type === "-" || type === ":") {
    if (lineEnd === -1) return null;
    const body = input.slice(start + 1, lineEnd);
    if (type === "-") throw new Error(body);
    if (type === ":") return { value: Number(body), end: lineEnd + 2 };
    return { value: body, end: lineEnd + 2 };
  }
  if (type === "$") {
    if (lineEnd === -1) return null;
    const length = Number(input.slice(start + 1, lineEnd));
    if (Number.isNaN(length)) return null;
    if (length === -1) return { value: null, end: lineEnd + 2 };
    const dataStart = lineEnd + 2;
    const dataEnd = dataStart + length;
    if (dataEnd + 2 > input.length) return null;
    return { value: input.slice(dataStart, dataEnd), end: dataEnd + 2 };
  }
  if (type === "*") {
    if (lineEnd === -1) return null;
    const count = Number(input.slice(start + 1, lineEnd));
    if (Number.isNaN(count)) return null;
    if (count === -1) return { value: null, end: lineEnd + 2 };
    let cursor = lineEnd + 2;
    const values: unknown[] = [];
    for (let i = 0; i < count; i += 1) {
      const parsed = parseValue(input, cursor);
      if (!parsed) return null;
      values.push(parsed.value);
      cursor = parsed.end;
    }
    return { value: values, end: cursor };
  }
  return null;
}

export class FalkorDBClient {
  private socket: any = null;
  private buffer = "";
  private pending: { resolve: Pending["resolve"]; reject: Pending["reject"] } | null = null;
  private queue: Array<{ args: string[]; resolve: Pending["resolve"]; reject: Pending["reject"] }> = [];
  private readonly url: string;
  private readonly username?: string;
  private readonly password?: string;

  constructor(config: FalkorDBConfig) {
    this.url = config.url;
    this.username = config.username;
    this.password = config.password;
  }

  async connect(): Promise<void> {
    const parsed = new URL(this.url);
    if (parsed.protocol !== "falkordb:") {
      throw new Error(
        `FALKORDB_URL must use the falkordb:// scheme, received "${parsed.protocol}//"`,
      );
    }
    this.socket = await (Bun as any).connect({
      hostname: parsed.hostname || "localhost",
      port: Number(parsed.port || 6379),
      socket: {
        data: (_socket: any, data: Uint8Array) => {
          this.buffer += new TextDecoder().decode(data);
          this.pump();
        },
        close: () => this.failAll(new Error("FalkorDB connection closed")),
        error: (_socket: any, error: Error) => this.failAll(error),
      },
    });

    if (this.password) {
      await this.send(["AUTH", this.username ?? "default", this.password]);
    }
  }

  async send(args: string[]): Promise<unknown> {
    return new Promise((resolve, reject) => {
      this.queue.push({ args, resolve, reject });
      this.drain();
    });
  }

  async query(graph: string, cypher: string): Promise<unknown> {
    return this.send(["GRAPH.QUERY", graph, cypher]);
  }

  async close(): Promise<void> {
    try {
      this.socket?.end?.();
    } catch {
      // ignore close errors
    }
    this.socket = null;
  }

  private drain(): void {
    if (this.pending || this.queue.length === 0 || !this.socket) return;
    const item = this.queue.shift()!;
    this.pending = { resolve: item.resolve, reject: item.reject };
    try {
      this.socket.write(encodeCommand(item.args));
    } catch (error) {
      this.pending = null;
      item.reject(error);
      this.drain();
    }
  }

  private pump(): void {
    if (!this.pending) return;
    let parsed: { value: unknown; end: number } | null = null;
    try {
      parsed = parseValue(this.buffer, 0);
    } catch (error) {
      const pending = this.pending;
      this.pending = null;
      pending.reject(error);
      this.drain();
      return;
    }
    if (!parsed) return;
    this.buffer = this.buffer.slice(parsed.end);
    const pending = this.pending;
    this.pending = null;
    pending.resolve(parsed.value);
    this.drain();
  }

  private failAll(error: unknown): void {
    if (this.pending) {
      this.pending.reject(error);
      this.pending = null;
    }
    while (this.queue.length > 0) {
      this.queue.shift()!.reject(error);
    }
  }
}
