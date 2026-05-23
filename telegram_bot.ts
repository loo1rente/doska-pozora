import { ShameCard } from "./src/types";
import { addCard } from "./server_db";
import fs from "fs";
import path from "path";

// Persistence of authorized Telegram chats
const AUTH_FILE = path.join(process.cwd(), "telegram_auth.json");
const authorizedChats = new Set<number>();

// Load pre-authorized chats on startup
try {
  if (fs.existsSync(AUTH_FILE)) {
    const data = fs.readFileSync(AUTH_FILE, "utf-8");
    const parsed = JSON.parse(data);
    if (Array.isArray(parsed)) {
      parsed.forEach((id) => authorizedChats.add(id));
    }
  }
} catch (e) {
  console.error("Failed to load authorized Telegram chats:", e);
}

function saveAuthorizedChats() {
  try {
    fs.writeFileSync(AUTH_FILE, JSON.stringify(Array.from(authorizedChats), null, 2), "utf-8");
  } catch (e) {
    console.error("Failed to save authorized Telegram chats:", e);
  }
}

interface UserBotSession {
  state: "UNAUTHORIZED" | "IDLE" | "AWAITING_NAME" | "AWAITING_DESCRIPTION" | "AWAITING_SEVERITY" | "AWAITING_PHOTO";
  name?: string;
  description?: string;
  severity?: "minor" | "moderate" | "epic";
}

const sessions = new Map<number, UserBotSession>();

// Function to send a message via Telegram Bot API
async function sendTelegramMessage(token: string, chatId: number, text: string, extraOptions: any = {}) {
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown",
        ...extraOptions
      })
    });
    if (!response.ok) {
      console.warn(`Telegram API error on sendMessage: ${await response.text()}`);
    }
  } catch (err) {
    console.error("Error sending Telegram message:", err);
  }
}

// Function to download a file and convert it to Base64
async function downloadTelegramFileAsBase64(token: string, filePath: string): Promise<string | null> {
  try {
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Failed to download file from Telegram: ${res.statusText}`);
      return null;
    }
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return `data:image/jpeg;base64,${base64}`;
  } catch (e) {
    console.error("Error in downloadTelegramFileAsBase64:", e);
    return null;
  }
}

// Main update handler
async function handleTelegramUpdate(token: string, update: any) {
  if (!update || !update.message) return;

  const msg = update.message;
  const chatId = msg.chat?.id;
  if (typeof chatId !== "number") return;

  const text = (msg.text || "").trim();

  // Initialize session
  if (!sessions.has(chatId)) {
    if (authorizedChats.has(chatId)) {
      sessions.set(chatId, { state: "IDLE" });
    } else {
      sessions.set(chatId, { state: "UNAUTHORIZED" });
    }
  }

  const session = sessions.get(chatId)!;

  // Handle /start command always
  if (text === "/start") {
    if (authorizedChats.has(chatId)) {
      session.state = "IDLE";
      await sendTelegramMessage(
        token,
        chatId,
        "👮‍♂️ *Главное Управление Позора*\n\nДобро пожаловать обратно! Вы успешно авторизованы.\n\nКоманды:\n➕ `/add` — Добавить фигуранта позора\n❓ `/help` — Получить справку"
      );
    } else {
      session.state = "UNAUTHORIZED";
      await sendTelegramMessage(
        token,
        chatId,
        "👮‍♂️ *Главное Управление Позора*\n\nПриветствую! Я Telegram-бот для мгновенного добавления фигурантов на доску позора.\n\nДля авторизации введите пароль администратора командой:\n`/auth <пароль>`\n\nили просто отправьте пароль ответным сообщением."
      );
    }
    return;
  }

  // Handle Auth
  if (session.state === "UNAUTHORIZED") {
    const isAuthCommand = text.startsWith("/auth ");
    const potentialPass = isAuthCommand ? text.substring(6).trim() : text;

    if (potentialPass === "123dkdk") {
      authorizedChats.add(chatId);
      saveAuthorizedChats();
      session.state = "IDLE";
      await sendTelegramMessage(
        token,
        chatId,
        "✅ *Авторизация успешна!*\n\nТеперь вы можете выставлять фигурантов проступков напрямую из Telegram.\n\nКоманды:\n➕ `/add` — Добавить нового фигуранта\n❓ `/help` — Справка"
      );
    } else {
      await sendTelegramMessage(
        token,
        chatId,
        "❌ Доступ ограничен. Пожалуйста, введите корректный пароль администратора для авторизации."
      );
    }
    return;
  }

  // Under authorized states:
  if (text === "/help") {
    await sendTelegramMessage(
      token,
      chatId,
      "👮‍♂️ *Справка по доске позора*\n\n➕ Используйте команду `/add` для запуска пошагового мастера создания карточки фигуранта.\n\nВы пройдете следующие шаги:\n1️⃣ Имя фигуранта\n2️⃣ Описание проступка\n3️⃣ Степень вины\n4️⃣ Фотография фигуранта\n\n🚫 Команда `/cancel` отменяет создание карточки в любой момент."
    );
    return;
  }

  if (text === "/cancel") {
    if (session.state === "IDLE") {
      await sendTelegramMessage(token, chatId, "Активных процессов добавления фигуранта нет.");
    } else {
      session.state = "IDLE";
      await sendTelegramMessage(token, chatId, "🚫 Создание карточки отменено. Вы вернулись в главное меню.");
    }
    return;
  }

  // State Machine logic
  switch (session.state) {
    case "IDLE":
      if (text === "/add" || text.toLowerCase() === "добавить") {
        session.state = "AWAITING_NAME";
        await sendTelegramMessage(
          token,
          chatId,
          "👤 *Шаг 1 из 4: Имя фигуранта*\n\nНапишите полное имя и фамилию фигуранта (или его никнейм):"
        );
      } else {
        await sendTelegramMessage(
          token,
          chatId,
          "👮‍♀️ Неизвестная команда. Введите команду `/add` для добавления фигуранта или `/help` для справки."
        );
      }
      break;

    case "AWAITING_NAME":
      if (!text || text.startsWith("/")) {
        await sendTelegramMessage(token, chatId, "⚠️ Имя не должно быть пустым или начинаться с символа '/'. Пожалуйста, введите имя фигуранта:");
        return;
      }
      session.name = text;
      session.state = "AWAITING_DESCRIPTION";
      await sendTelegramMessage(
        token,
        chatId,
        "📝 *Шаг 2 из 4: Описание проступка*\n\nПодробно опишите, какой косяк совершил фигурант (например: 'Опять свалил вину на джуна и уехал на дачу'):"
      );
      break;

    case "AWAITING_DESCRIPTION":
      if (!text || text.startsWith("/")) {
        await sendTelegramMessage(token, chatId, "⚠️ Описание не должно быть пустым или начинаться с '/'. Введите описание проступка фигуранта:");
        return;
      }
      session.description = text;
      session.state = "AWAITING_SEVERITY";
      await sendTelegramMessage(
        token,
        chatId,
        "⚠️ *Шаг 3 из 4: Степень вины*\n\nВыберите степень тяжести, отправив один из вариантов:\n\n🟢 *Легкий*\n🟡 *Средний*\n🔴 *Эпический*",
        {
          reply_markup: {
            keyboard: [
              [{ text: "🟢 Легкий" }, { text: "🟡 Средний" }, { text: "🔴 Эпический" }]
            ],
            one_time_keyboard: true,
            resize_keyboard: true
          }
        }
      );
      break;

    case "AWAITING_SEVERITY":
      const lowerText = text.toLowerCase();
      let selectedSeverity: "minor" | "moderate" | "epic" | null = null;
      if (lowerText.includes("легк") || lowerText.includes("minor") || lowerText.includes("🟢")) {
        selectedSeverity = "minor";
      } else if (lowerText.includes("средн") || lowerText.includes("moderate") || lowerText.includes("🟡")) {
        selectedSeverity = "moderate";
      } else if (lowerText.includes("эпич") || lowerText.includes("epic") || lowerText.includes("🔴")) {
        selectedSeverity = "epic";
      }

      if (!selectedSeverity) {
        await sendTelegramMessage(
          token,
          chatId,
          "⚠️ Неверный выбор! Пожалуйста, используйте кнопки ниже или напишите один из вариантов:\n- 🟢 Легкий\n- 🟡 Средний\n- 🔴 Эпический",
          {
            reply_markup: {
              keyboard: [
                [{ text: "🟢 Легкий" }, { text: "🟡 Средний" }, { text: "🔴 Эпический" }]
              ],
              one_time_keyboard: true,
              resize_keyboard: true
            }
          }
        );
        return;
      }

      session.severity = selectedSeverity;
      session.state = "AWAITING_PHOTO";
      await sendTelegramMessage(
        token,
        chatId,
        "📸 *Шаг 4 из 4: Фотография*\n\nПожалуйста, отправьте фотографию фигуранта.\n\n_Если вы хотите использовать стандартный аватар по умолчанию, отправьте команду_ `/skip`.",
        {
          reply_markup: {
            remove_keyboard: true
          }
        }
      );
      break;

    case "AWAITING_PHOTO":
      let photoUrl = "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80"; // Default
      let loadedPhoto = false;

      if (text === "/skip" || text.toLowerCase() === "пропустить") {
        loadedPhoto = true;
      } else if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
        // Take highest resolution photo size
        const photoObj = msg.photo[msg.photo.length - 1];
        const fileId = photoObj.file_id;

        await sendTelegramMessage(token, chatId, "⏳ _Фотография получена. Начинаю загрузку и оптимизацию..._");
        
        try {
          const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
          if (fileInfoRes.ok) {
            const fileInfo = await fileInfoRes.json();
            if (fileInfo.ok && fileInfo.result?.file_path) {
              const base64Img = await downloadTelegramFileAsBase64(token, fileInfo.result.file_path);
              if (base64Img) {
                photoUrl = base64Img;
                loadedPhoto = true;
              }
            }
          }
        } catch (err) {
          console.error("Failed to fetch/convert image from Telegram:", err);
        }
      }

      if (!loadedPhoto) {
        await sendTelegramMessage(
          token,
          chatId,
          "⚠️ Пожалуйста, отправьте фотографию в виде изображения (не документом!) или введите команду `/skip` для пропуска."
        );
        return;
      }

      // We have all details! Let's build and publish the ShameCard.
      const timestamp = Date.now();
      const card: ShameCard = {
        id: `shame_tg_${timestamp}`,
        name: session.name || "Анонимный Фигурант",
        description: session.description || "Совершил тайный косяк",
        photoUrl: photoUrl,
        category: "",
        severity: session.severity || "minor",
        date: new Date().toISOString().split("T")[0],
        tomatoes: 0,
        facepalms: 0,
        forgiven: 0
      };

      try {
        await addCard(card);
        session.state = "IDLE";
        await sendTelegramMessage(
          token,
          chatId,
          `🎉 *Фигурант успешно добавлен!*\n\nКарточка позора для *${card.name}* создана и опубликована! Ступайте швырять томаты на доске позора!`
        );
      } catch (saveError) {
        console.error("Failed to save card requested by Telegram Bot:", saveError);
        await sendTelegramMessage(
          token,
          chatId,
          "❌ Произошла ошибка при сохранении карточки на сервере. Пожалуйста, попробуйте еще раз."
        );
      }
      break;

    default:
      session.state = "IDLE";
      await sendTelegramMessage(token, chatId, "Что-то пошло не так. Сессия сброшена. Введите `/add` для добавления фигуранта.");
      break;
  }
}

// Background long poller
let lastUpdateId = 0;
export async function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN || "8809663869:AAEkUOFB16D7VOKx5kNXtZzq-ESxfAMOdvU";
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN is not defined. Telegram Bot disabled.");
    return;
  }

  console.log("Starting Telegram Bot listener via long polling...");

  async function poll() {
    try {
      const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId + 1}&limit=10&timeout=2`;
      const res = await fetch(url);
      if (!res.ok) {
        // Bad status (invalid token, network error, etc.). Let's wait more
        setTimeout(poll, 15000);
        return;
      }
      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          try {
            await handleTelegramUpdate(token, update);
          } catch (updateErr) {
            console.error("Error processing update:", updateErr);
          }
        }
      }
      setTimeout(poll, 100);
    } catch (err) {
      console.error("Telegram long-poll loop encountered an error:", err);
      setTimeout(poll, 5000);
    }
  }

  poll();
}
