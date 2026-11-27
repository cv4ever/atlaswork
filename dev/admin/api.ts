// The admin page's calls to its dev-server routes (server.ts), with the per-start token the server put in the page,
// and to the ChatGPT plan bridge (dev/chatgpt/server.ts) with that bridge's own token, which every dev page carries.
const tokens = {
  admin: ["x-admin-token", document.querySelector<HTMLMetaElement>('meta[name="workbench-admin-token"]')?.content ?? ""],
  bridge: ["x-workbench-token", document.querySelector<HTMLMetaElement>('meta[name="workbench-chatgpt-token"]')?.content ?? ""],
} as const;
type Route = { route: string; via?: keyof typeof tokens; signal?: AbortSignal };

async function send({ route, via = "admin", signal }: Route, body: unknown) {
  const [header, token] = tokens[via];
  let response: Response;
  try {
    response = await fetch(route, { method: "POST", headers: { "Content-Type": "application/json", [header]: token }, body: JSON.stringify(body), signal });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new Error("The dev server didn't answer. Is it still running?");
  }
  if (!response.ok) {
    const json = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(json.error ?? `The dev server answered HTTP ${response.status}.`);
  }
  return response;
}

/** POSTs `body` to `route` and returns its JSON, or throws the route's own error message. */
export async function post<T>(route: string, body: unknown = {}, via: Route["via"] = "admin"): Promise<T> {
  return await (await send({ route, via }, body)).json() as T;
}

/** POSTs `body` to a route that answers in NDJSON, calling `onLine` with each line as it arrives. */
export async function stream<T>(target: Route, body: unknown, onLine: (line: T) => void) {
  const reader = (await send(target, body)).body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffered = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const lines = (buffered + value).split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onLine(JSON.parse(line) as T);
  }
  if (buffered.trim()) onLine(JSON.parse(buffered) as T);
}
