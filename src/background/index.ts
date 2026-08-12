type CompanionRequestMessage = {
  type: "phraseloop-companion-request";
  config: {
    url: string;
    token: string;
  };
  path: string;
  method: string;
  body?: string;
};

type CompanionResponse = {
  ok: boolean;
  status: number;
  body: unknown;
};

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isCompanionRequest(message)) return false;

  void proxyCompanionRequest(message)
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({
        ok: false,
        status: 0,
        body: { error: error instanceof Error ? error.message : "Could not connect to PhraseLoop Companion." }
      } satisfies CompanionResponse);
    });
  return true;
});

async function proxyCompanionRequest(message: CompanionRequestMessage): Promise<CompanionResponse> {
  const baseUrl = validateLocalUrl(message.config.url);
  if (!message.config.token.trim()) throw new Error("Companion token is required.");
  if (!message.path.startsWith("/") || message.path.startsWith("//")) throw new Error("Invalid companion request path.");

  const response = await fetch(`${baseUrl}${message.path}`, {
    method: message.method,
    headers: {
      Authorization: `Bearer ${message.config.token.trim()}`,
      "Content-Type": "application/json"
    },
    ...(message.body === undefined ? {} : { body: message.body })
  });
  return {
    ok: response.ok,
    status: response.status,
    body: await response.json().catch(() => null)
  };
}

function validateLocalUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") {
    throw new Error("Companion URL must use http://127.0.0.1.");
  }
  return parsed.origin;
}

function isCompanionRequest(value: unknown): value is CompanionRequestMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<CompanionRequestMessage>;
  return (
    message.type === "phraseloop-companion-request" &&
    typeof message.path === "string" &&
    typeof message.method === "string" &&
    typeof message.config?.url === "string" &&
    typeof message.config?.token === "string" &&
    (message.body === undefined || typeof message.body === "string")
  );
}
