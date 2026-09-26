"use strict";

const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 4173);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8383641781:AAEywcdPDDsaVc2JCOVF2_rwefCOCJB7CAU";
// Чат Aqua Frank для сповіщень про нові замовлення. За потреби його можна
// перевизначити через TELEGRAM_CHAT_ID без редагування коду.
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "-1004380997543";
const MAX_BODY_SIZE = 100_000;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
};

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
}

function formatMoney(value) {
  return `${new Intl.NumberFormat("uk-UA").format(value)} грн`;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) throw new Error("Запит занадто великий.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeOrder(input) {
  const items = Array.isArray(input.items) ? input.items : [];
  const name = String(input.name || "").trim();
  const phone = String(input.phone || "").trim();
  const address = String(input.address || "").trim();
  const payment = String(input.payment || "").trim();
  const total = Number(input.total);

  if (name.length < 2 || phone.length < 9 || address.length < 5 || !payment || !items.length || !Number.isFinite(total)) {
    throw new Error("Перевірте дані замовлення.");
  }

  return {
    id: `AF-${Date.now().toString().slice(-8)}`,
    createdAt: new Date().toISOString(),
    name,
    phone,
    address,
    payment,
    hasExchange: Boolean(input.hasExchange),
    total: Math.round(total),
    items: items.map((item) => ({
      name: String(item.name || "Товар").slice(0, 200),
      quantity: Math.max(1, Math.min(99, Number(item.quantity) || 1)),
      total: Math.max(0, Math.round(Number(item.total) || 0)),
      note: String(item.note || "").slice(0, 160),
    })),
  };
}

function orderMessage(order) {
  const items = order.items
    .map((item) => `• ${escapeHtml(item.name)} × ${item.quantity} = ${formatMoney(item.total)}${item.note ? ` (${escapeHtml(item.note)})` : ""}`)
    .join("\n");

  return [
    `🔔 <b>Нове замовлення ${escapeHtml(order.id)}</b>`,
    "",
    `<b>Клієнт:</b> ${escapeHtml(order.name)}`,
    `<b>Телефон:</b> ${escapeHtml(order.phone)}`,
    `<b>Адреса:</b> ${escapeHtml(order.address)}`,
    `<b>Оплата:</b> ${escapeHtml(order.payment)}`,
    `<b>Тара на обмін:</b> ${order.hasExchange ? "так" : "ні"}`,
    "",
    `<b>Товари:</b>\n${items}`,
    "",
    `<b>Разом:</b> ${formatMoney(order.total)}`,
  ].join("\n");
}

async function saveOrder(order) {
  const dataDir = path.join(ROOT, "data");
  await fs.mkdir(dataDir, { recursive: true });
  await fs.appendFile(path.join(dataDir, "orders.ndjson"), `${JSON.stringify(order)}\n`, "utf8");
}

async function notifyTelegram(order) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return false;
  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: orderMessage(order), parse_mode: "HTML" }),
  });
  if (!response.ok) throw new Error("Telegram не прийняв повідомлення.");
  return true;
}

async function handleOrder(request, response) {
  try {
    const order = normalizeOrder(await readJsonBody(request));
    await saveOrder(order);
    let sentToTelegram = false;
    let telegramWarning = false;

    try {
      sentToTelegram = await notifyTelegram(order);
    } catch {
      telegramWarning = true;
    }

    sendJson(response, 201, { ok: true, orderId: order.id, sentToTelegram, telegramWarning });
  } catch (error) {
    sendJson(response, 400, { ok: false, error: error.message || "Не вдалося прийняти замовлення." });
  }
}

function serveFile(request, response) {
  const rawPath = decodeURIComponent((request.url || "/").split("?")[0]);
  const relativePath = rawPath === "/" ? "index.html" : rawPath.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relativePath);
  if (!filePath.startsWith(`${ROOT}${path.sep}`) || relativePath === "data" || relativePath.startsWith("data/")) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath)
    .then((file) => {
      response.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
      response.end(file);
    })
    .catch(() => {
      response.writeHead(404);
      response.end("Not found");
    });
}

http.createServer((request, response) => {
  if (request.method === "POST" && request.url === "/api/orders") {
    handleOrder(request, response);
    return;
  }
  if (request.method === "GET" || request.method === "HEAD") {
    serveFile(request, response);
    return;
  }
  response.writeHead(405);
  response.end("Method not allowed");
}).listen(PORT, () => {
  console.log(`Aqua Frank працює: http://localhost:${PORT}`);
  if (!TELEGRAM_BOT_TOKEN) {
    console.log("Telegram не налаштований: задайте TELEGRAM_BOT_TOKEN, щоб заявки надсилалися у чат Aqua Frank.");
  }
});
