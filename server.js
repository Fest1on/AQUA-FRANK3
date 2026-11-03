"use strict";

const http = require("http");
const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");

const ROOT = __dirname;

// Локальна конфігурація Telegram зберігається окремо від коду.
// Файл telegram-config.json доданий до .gitignore і не повинен потрапляти в GitHub.
// Змінні середовища хостингу мають вищий пріоритет, тож сервер можна
// розгортати і без локального конфігураційного файла.
function loadLocalConfig() {
  const configPath = path.join(ROOT, "telegram-config.json");
  if (!fsSync.existsSync(configPath)) return {};

  try {
    const parsed = JSON.parse(fsSync.readFileSync(configPath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch (error) {
    console.error("Не вдалося прочитати telegram-config.json:", error.message);
    return {};
  }
}

const localConfig = loadLocalConfig();
const PORT = Number(process.env.PORT || 4173);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || localConfig.telegramBotToken || "8383641781:AAEywcdPDDsaVc2JCOVF2_rwefCOCJB7CAU";
// Чат Aqua Frank для сповіщень про нові замовлення.
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || localConfig.telegramChatId || "-1004380997543";
const MAX_BODY_SIZE = 100_000;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
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
  const deliveryTime = String(input.deliveryTime || "").trim();
  const comment = String(input.comment || "").trim();
  const payment = String(input.payment || "").trim();
  const total = Number(input.total);

  if (
    name.length < 2
    || phone.length < 9
    || address.length < 5
    || !deliveryTime
    || (deliveryTime === "Потрібен інший час" && comment.length < 3)
    || !payment
    || !items.length
    || !Number.isFinite(total)
  ) {
    throw new Error("Перевірте дані замовлення.");
  }

  return {
    id: `AF-${Date.now().toString().slice(-8)}`,
    createdAt: new Date().toISOString(),
    name,
    phone,
    address,
    deliveryTime: deliveryTime.slice(0, 100),
    comment: comment.slice(0, 500),
    payment,
    hasExchange: Boolean(input.hasExchange),
    newCustomer: Boolean(input.newCustomer),
    waterQuantity: Math.max(0, Math.min(99, Math.round(Number(input.waterQuantity) || 0))),
    deposit: Math.max(0, Math.round(Number(input.deposit) || 0)),
    total: Math.round(total),
    items: items.slice(0, 30).map((item) => ({
      name: String(item.name || "Товар").slice(0, 200),
      quantity: Math.max(1, Math.min(99, Number(item.quantity) || 1)),
      total: Math.max(0, Math.round(Number(item.total) || 0)),
      note: String(item.note || "").replaceAll("₴", "грн").slice(0, 160),
    })),
  };
}

function orderMessage(order) {
  const lines = order.items.map(
    (item) => `• ${escapeHtml(item.name)} × ${item.quantity} = ${formatMoney(item.total)}${item.note ? ` ${escapeHtml(item.note)}` : ""}`,
  );
  if (order.deposit > 0) {
    lines.push(`• Застава за новий бутель 18,9 л × ${order.waterQuantity} = ${formatMoney(order.deposit)}`);
  }

  return [
    `🔔 <b>НОВЕ ЗАМОВЛЕННЯ ${escapeHtml(order.id)}!</b>`,
    "🌐 <i>Замовлення з сайту</i>",
    "",
    `👤 <b>Клієнт:</b> ${escapeHtml(order.name)}${order.newCustomer ? " 🆕 <i>(новий клієнт)</i>" : ""}`,
    `📞 <b>Телефон:</b> ${escapeHtml(order.phone)}`,
    `📍 <b>Адреса:</b> ${escapeHtml(order.address)}`,
    `💳 <b>Оплата:</b> ${escapeHtml(order.payment)}`,
    `🕓 <b>Час доставки:</b> ${escapeHtml(order.deliveryTime)}`,
    `💬 <b>Коментар:</b> ${escapeHtml(order.comment || "—")}`,
    ...(order.waterQuantity > 0 ? [`♻️ <b>Тара на обмін:</b> ${order.hasExchange ? "є" : "немає (потрібна нова + застава)"}`] : []),
    "",
    `📦 <b>Замовлення:</b>\n${lines.join("\n")}`,
    "",
    `💵 <b>СУМА:</b> ${formatMoney(order.total)}`,
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
  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Telegram ${response.status}: ${details.slice(0, 300)}`);
  }
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
    } catch (error) {
      telegramWarning = true;
      console.error(`[${order.id}] Не вдалося надіслати в Telegram:`, error.message);
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
