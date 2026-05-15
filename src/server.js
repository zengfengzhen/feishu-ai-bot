import "dotenv/config";
import express from "express";
import OpenAI from "openai";

const {
  PORT = "3008",
  FEISHU_APP_ID,
  FEISHU_APP_SECRET,
  FEISHU_VERIFICATION_TOKEN,
  OPENAI_API_KEY,
  OPENAI_MODEL = "gpt-4o-mini",
  BOT_SYSTEM_PROMPT = "You are a helpful assistant.",
} = process.env;

const app = express();
app.use(express.json({ limit: "2mb" }));

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const handledMessageIds = new Set();

let tenantTokenCache = {
  token: null,
  expiresAt: 0,
};

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

function validateConfig() {
  requireEnv("FEISHU_APP_ID", FEISHU_APP_ID);
  requireEnv("FEISHU_APP_SECRET", FEISHU_APP_SECRET);
  requireEnv("FEISHU_VERIFICATION_TOKEN", FEISHU_VERIFICATION_TOKEN);
  requireEnv("OPENAI_API_KEY", OPENAI_API_KEY);
}

function verifyFeishuToken(body) {
  const token = body?.token ?? body?.header?.token;
  return token === FEISHU_VERIFICATION_TOKEN;
}

function parseTextContent(message) {
  if (message?.message_type !== "text") {
    return "";
  }

  try {
    const content = JSON.parse(message.content || "{}");
    return String(content.text || "").trim();
  } catch {
    return "";
  }
}

function stripBotMention(text) {
  return text.replace(/^@\S+\s*/, "").trim();
}

async function getTenantAccessToken() {
  const now = Date.now();
  if (tenantTokenCache.token && tenantTokenCache.expiresAt > now + 60_000) {
    return tenantTokenCache.token;
  }

  const response = await fetch(
    "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: FEISHU_APP_ID,
        app_secret: FEISHU_APP_SECRET,
      }),
    },
  );

  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(`Failed to get tenant token: ${JSON.stringify(data)}`);
  }

  tenantTokenCache = {
    token: data.tenant_access_token,
    expiresAt: now + Math.max(0, Number(data.expire || 0) - 120) * 1000,
  };

  return tenantTokenCache.token;
}

async function sendFeishuText(chatId, text) {
  const token = await getTenantAccessToken();
  const response = await fetch(
    "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      }),
    },
  );

  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(`Failed to send Feishu message: ${JSON.stringify(data)}`);
  }
}

async function askOpenAI(userText) {
  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: BOT_SYSTEM_PROMPT },
      { role: "user", content: userText },
    ],
    temperature: 0.4,
  });

  return response.choices?.[0]?.message?.content?.trim() || "我刚刚没有生成出有效回复，可以再发一次吗？";
}

async function handleMessageEvent(event) {
  const message = event?.message;
  const chatId = message?.chat_id;
  const messageId = message?.message_id;
  const userText = stripBotMention(parseTextContent(message));

  if (!chatId || !messageId || !userText) {
    return;
  }

  if (handledMessageIds.has(messageId)) {
    return;
  }
  handledMessageIds.add(messageId);

  if (handledMessageIds.size > 500) {
    const oldest = handledMessageIds.values().next().value;
    handledMessageIds.delete(oldest);
  }

  const reply = await askOpenAI(userText);
  await sendFeishuText(chatId, reply);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "feishu-ai-bot" });
});

app.post("/feishu/events", async (req, res) => {
  const body = req.body;
  console.log(
    `[feishu] event received: ${body?.type || body?.header?.event_type || "unknown"}`,
  );

  if (body?.encrypt) {
    return res.status(400).json({
      error: "Encrypted Feishu events are not enabled in this starter. Disable event encryption for the first test.",
    });
  }

  if (body?.type === "url_verification" || body?.challenge) {
    if (!verifyFeishuToken(body)) {
      return res.status(401).json({ error: "Invalid Feishu verification token" });
    }
    return res.json({ challenge: body.challenge });
  }

  if (!verifyFeishuToken(body)) {
    return res.status(401).json({ error: "Invalid Feishu verification token" });
  }

  res.json({ ok: true });

  const eventType = body?.header?.event_type;
  if (eventType !== "im.message.receive_v1") {
    return;
  }

  try {
    await handleMessageEvent(body.event);
  } catch (error) {
    console.error("[feishu] failed to handle message event", error);
  }
});

try {
  validateConfig();
  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Feishu AI bot listening on http://localhost:${PORT}`);
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
