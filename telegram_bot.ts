import { ShameCard, PRESET_THEMES, ThemeSettings, ThemePreset, BGMTrack } from "./src/types";
import { initialShameCards } from "./src/data/initialData";
import { addCard, getAllCards, updateCard, deleteCard, getActiveTheme, saveActiveTheme } from "./server_db";
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
  state: "UNAUTHORIZED" | "IDLE" |
         "AWAITING_NAME" | "AWAITING_DESCRIPTION" | "AWAITING_SEVERITY" | "AWAITING_PHOTO" | "AWAITING_TAGS" |
         "AWAITING_CUSTOM_TITLE" | "AWAITING_CUSTOM_SUBTITLE" |
         "AWAITING_ACCENT_COLOR" | "AWAITING_BG_COLOR" | "AWAITING_CARD_COLOR" | "AWAITING_TEXT_COLOR" |
         "AWAITING_EDIT_NAME" | "AWAITING_EDIT_DESCRIPTION" | "AWAITING_EDIT_PHOTO" | "AWAITING_EDIT_TAGS" |
         "AWAITING_MUSIC_FILE";
  name?: string;
  description?: string;
  severity?: "minor" | "moderate" | "epic";
  tags?: string[];
  photoUrlData?: string;
  editCardId?: string;
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

// Function to edit a telegram message to reduce clutter
async function editTelegramMessage(token: string, chatId: number, messageId: number, text: string, extraOptions: any = {}) {
  try {
    const url = `https://api.telegram.org/bot${token}/editMessageText`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: "Markdown",
        ...extraOptions
      })
    });
    if (!response.ok) {
      console.warn(`Telegram API error on editMessageText: ${await response.text()}`);
    }
  } catch (err) {
    console.error("Error editing Telegram message:", err);
  }
}

// Answer Callback Query to hide loading states on buttons
async function answerCallbackQuery(token: string, callbackQueryId: string, text?: string) {
  try {
    const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text,
      })
    });
  } catch (err) {
    console.error("Error answering callback query:", err);
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

// Menu structures generators
function getMainAdminMenuMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎨 Дизайн и Темы", callback_data: "admin_themes" },
          { text: "🦹 Список Фигурантов", callback_data: "admin_list_cards" }
        ],
        [
          { text: "⏱️ Лимиты и Таймеры", callback_data: "admin_limits" },
          { text: "🧹 Сброс и Очистка", callback_data: "admin_clearing" }
        ],
        [
          { text: "🎵 Настройка Музыки", callback_data: "admin_music_panel" },
          { text: "➕ Добавить фигуранта", callback_data: "admin_add_card" }
        ]
      ]
    }
  };
}

async function getMusicMenuText() {
  const theme = await getActiveTheme() || { ...PRESET_THEMES.artistic, bgmPlaylist: [] };
  const playlist = theme.bgmPlaylist || [];
  let txt = "🎵 <b>Управление Фоновой Музыкой</b>\n\n";
  txt += "Здесь вы можете настраивать плейлист, отправляя ссылки на Google Диск / прямые MP3 ссылки, или <b>загружая файлы песен напрямую в этот чат</b>!\n\n";
  txt += "<b>Текущий плейлист</b>:\n";
  if (playlist.length === 0) {
    txt += "<i>Нет добавленных треков.</i>\n";
  } else {
    playlist.forEach((t, i) => {
      const escapeHtml = (str: string) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const cleanName = escapeHtml(t.name || "Без названия");
      const rawUrl = t.url || "";
      const shortenedUrl = rawUrl.substring(0, 45) + (rawUrl.length > 45 ? "..." : "");
      const cleanUrl = escapeHtml(shortenedUrl);
      txt += `${i + 1}. <b>${cleanName}</b>\n  <code>${cleanUrl}</code>\n`;
    });
  }
  return txt;
}

function getMusicMenuMarkup(playlist: BGMTrack[]) {
  const inline_keyboard: any[] = [];
  
  // List tracks with delete buttons
  playlist.forEach((t) => {
    const cleanName = (t.name || "Без названия").replace(/[_*`[\]()]/g, " ");
    inline_keyboard.push([
      { text: `❌ Удалить: ${cleanName.substring(0, 20)}`, callback_data: `del_track_${t.id}` }
    ]);
  });
  
  // Buttons for adding track
  inline_keyboard.push([
    { text: "➕ Загрузить файл / Ссылку", callback_data: "add_track_interactive" }
  ]);
  
  inline_keyboard.push([
    { text: "◀️ Назад в меню", callback_data: "admin_main" }
  ]);
  
  return {
    reply_markup: {
      inline_keyboard
    }
  };
}

async function downloadTelegramFile(token: string, fileId: string, destPath: string): Promise<boolean> {
  try {
    // 1. Get file path from Telegram
    const url = `https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`;
    const infoRes = await fetch(url);
    if (!infoRes.ok) {
      console.error(`Telegram getFile API error: ${infoRes.statusText}`);
      return false;
    }
    const infoJSON: any = await infoRes.json();
    if (!infoJSON.ok || !infoJSON.result?.file_path) {
      console.error("Invalid response from Telegram getFile API:", infoJSON);
      return false;
    }
    const filePath = infoJSON.result.file_path;
    
    // 2. Download the actual file content
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) {
      console.error(`Failed to download file from Telegram path ${filePath}`);
      return false;
    }
    
    // Make sure destination folder parent exists
    const parentDir = path.dirname(destPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    
    // Write buffer using filesystem stream or writeFileSync
    const buffer = await fileRes.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(buffer));
    console.log(`Successfully saved downloaded file to ${destPath}`);
    return true;
  } catch (err) {
    console.error("Error in downloadTelegramFile:", err);
    return false;
  }
}

async function getThemesMenuText() {
  const theme = await getActiveTheme() || PRESET_THEMES.artistic;
  return `🎨 *Персонализация Стенда*\n\n` +
         `Текущая тема: *${theme.name || "Индивидуальная"}*\n` +
         `• Шрифт: *${theme.fontFamily}*\n` +
         `• Колонки: *${theme.gridColumns} равн.*\n` +
         `• Шум помех: *${theme.showBackgroundNoise ? "Включен 🟩" : "Выключен 🟥"}*\n` +
         `• Заголовок: "${theme.siteTitle}"\n\n` +
         `Выберите экспресс-тему ниже или настройте внешний вид детально вручную:`;
}

function getThemesMenuMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎨 Стиль (Artistic)", callback_data: "theme_artistic" },
          { text: "🔴 Багровый Позор", callback_data: "theme_crimson" }
        ],
        [
          { text: "👾 Киберпанк", callback_data: "theme_cyberpunk" },
          { text: "📜 Винтажное Ретро", callback_data: "theme_retro" }
        ],
        [
          { text: "⚪ Офисный Белый", callback_data: "theme_clean" },
          { text: "❄️ Нордический Холод", callback_data: "theme_nordic" }
        ],
        [
          { text: "✍️ Тексты Стенда", callback_data: "custom_text_menu" },
          { text: "🎨 Цвета и Контуры", callback_data: "custom_colors_menu" }
        ],
        [
          { text: "🔳 Сетка и Шрифт", callback_data: "custom_grid_font_menu" }
        ],
        [
          { text: "◀️ Назад в меню", callback_data: "admin_main" }
        ]
      ]
    }
  };
}

async function getCustomTextMenuText() {
  const theme = await getActiveTheme() || PRESET_THEMES.artistic;
  return `✍️ *Управление текстом и брендингом*\n\n` +
         `• Главный заголовок:\n"${theme.siteTitle}"\n\n` +
         `• Описание (Подзаголовок):\n"${theme.siteSubtitle}"\n\n` +
         `Нажмите кнопку ниже для изменения свойства, после чего отправьте новое значение в текстовом сообщении:`;
}

function getCustomTextMenuMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✏️ Главный Заголовок", callback_data: "set_title_interactive" },
          { text: "✏️ Подзаголовок", callback_data: "set_subtitle_interactive" }
        ],
        [
          { text: "◀️ Назад в меню Дизайна", callback_data: "admin_themes" }
        ]
      ]
    }
  };
}

async function getCustomColorsMenuText() {
  const theme = await getActiveTheme() || PRESET_THEMES.artistic;
  return `🎨 *Тонкая настройка цветов и контуров*\n\n` +
         `• Акцентный цвет: *${theme.accentColor}*\n` +
         `• Фон страницы: *${theme.backgroundColor}*\n` +
         `• Фон карточки: *${theme.cardColor}*\n` +
         `• Цвет текста: *${theme.textColor}*\n` +
         `• Стиль рамки: *${theme.borderStyle}*\n` +
         `• Округлость углов: *${theme.borderRadius}*\n\n` +
         `Выберите элемент для перекраски или изменения структуры углов и рамок:`;
}

function getCustomColorsMenuMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🔴 Акцентный цвет", callback_data: "set_color_accent" },
          { text: "🟩 Цвет Фона страницы", callback_data: "set_color_bg" }
        ],
        [
          { text: "🟦 Цвет Карточки", callback_data: "set_color_card" },
          { text: "⚪ Цвет Текста", callback_data: "set_color_text" }
        ],
        [
          { text: "🖼️ Стиль Рамки", callback_data: "choose_border_style" },
          { text: "📐 Сглаживание углов", callback_data: "choose_border_radius" }
        ],
        [
          { text: "◀️ Назад в Дизайн", callback_data: "admin_themes" }
        ]
      ]
    }
  };
}

function getBorderStyleMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Без рамки (none)", callback_data: "set_border_none" },
          { text: "Сплошная (solid)", callback_data: "set_border_solid" }
        ],
        [
          { text: "Штрихкод (dashed)", callback_data: "set_border_dashed" },
          { text: "Неоновый лазер (neon)", callback_data: "set_border_neon" }
        ],
        [
          { text: "◀️ Назад к цветам", callback_data: "custom_colors_menu" }
        ]
      ]
    }
  };
}

function getBorderRadiusMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "0px (Острый брутализм)", callback_data: "set_radius_0px" },
          { text: "4px (Угловатый хайтек)", callback_data: "set_radius_4px" }
        ],
        [
          { text: "12px (Стандарт карт)", callback_data: "set_radius_12px" },
          { text: "24px (Приятная округлость)", callback_data: "set_radius_24px" }
        ],
        [
          { text: "999px (Овальное облако позора)", callback_data: "set_radius_999px" }
        ],
        [
          { text: "◀️ Назад к цветам", callback_data: "custom_colors_menu" }
        ]
      ]
    }
  };
}

async function getCustomGridFontMenuText() {
  const theme = await getActiveTheme() || PRESET_THEMES.artistic;
  return `🔳 *Настройка сетки, шрифта и CRT-помех*\n\n` +
         `• Шрифт интерфейса: *${theme.fontFamily}*\n` +
         `• Лимит колонок (десктоп): *${theme.gridColumns} кол.*\n` +
         `• Шум кинескопа (CRT помехи): *${theme.showBackgroundNoise ? "ВКЛЮЧЕН (Мерцание)" : "ВЫКЛЮЧЕН (Статика)"}*\n\n` +
         `Тонкая настройка визуализации контента на экране:`;
}

function getCustomGridFontMenuMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🔤 Семейство Шрифтов", callback_data: "choose_font_family" },
          { text: "🔢 Лимит Колонок в ряд", callback_data: "choose_grid_columns" }
        ],
        [
          { text: "⚡ Переключить CRT помехи", callback_data: "toggle_bg_noise" }
        ],
        [
          { text: "◀️ Назад в Дизайн", callback_data: "admin_themes" }
        ]
      ]
    }
  };
}

function getFontFamilyMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Inter (Профессиональный sans)", callback_data: "set_font_sans" },
          { text: "Fira Code (Технологичный mono)", callback_data: "set_font_mono" }
        ],
        [
          { text: "Playfair (Редакционный serif)", callback_data: "set_font_serif" },
          { text: "Outfit (Креативный гротеск)", callback_data: "set_font_grotesk" }
        ],
        [
          { text: "◀️ Назад в параметры", callback_data: "custom_grid_font_menu" }
        ]
      ]
    }
  };
}

function getGridColumnsMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "2 Колонки", callback_data: "set_columns_2" },
          { text: "3 Колонки (Оптимально)", callback_data: "set_columns_3" },
          { text: "4 Колонки (Максимум)", callback_data: "set_columns_4" }
        ],
        [
          { text: "◀️ Назад в параметры", callback_data: "custom_grid_font_menu" }
        ]
      ]
    }
  };
}

async function getLimitsMenuText() {
  const theme = await getActiveTheme() || { reactionCooldown: 30, commentCooldown: 15, maxReactionsLimit: 100 };
  return `⏱️ *Лимиты и Флуд-Контроль стенда*\n\n` +
         `• Задержка оценок (реакций): *${theme.reactionCooldown ?? 30} сек*\n` +
         `• Задержка отправки комментов: *${theme.commentCooldown ?? 15} сек*\n` +
         `• Потолок лимита реакций на карту: *${theme.maxReactionsLimit ?? 100} штук*\n\n` +
         `Измените лимиты инлайн-кнопками ниже или отправьте текстовые выражения:\n` +
         `• \`/cooldown <сек>\`\n` +
         `• \`/comment_cooldown <сек>\`\n` +
         `• \`/limit <число>\``;
}

function getLimitsMenuMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "⏱️ Кулдаун Реакций", callback_data: "limits_react" },
          { text: "💬 Кулдаун Комментов", callback_data: "limits_comment" }
        ],
        [
          { text: "📈 Макс. Порог Оценок", callback_data: "limits_max" }
        ],
        [
          { text: "◀️ Назад в меню", callback_data: "admin_main" }
        ]
      ]
    }
  };
}

function getLimitsReactOptions() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "0с (Выкл антиспам)", callback_data: "set_react_0" },
          { text: "5 секунд", callback_data: "set_react_5" },
          { text: "15 секунд", callback_data: "set_react_15" }
        ],
        [
          { text: "30 секунд", callback_data: "set_react_30" },
          { text: "45 секунд", callback_data: "set_react_45" },
          { text: "60 секунд (1м)", callback_data: "set_react_60" }
        ],
        [
          { text: "◀️ Назад", callback_data: "admin_limits" }
        ]
      ]
    }
  };
}

function getLimitsCommentOptions() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "0с (Без кулдауна)", callback_data: "set_comment_0" },
          { text: "5 секунд", callback_data: "set_comment_5" },
          { text: "10 секунд", callback_data: "set_comment_10" }
        ],
        [
          { text: "15 секунд", callback_data: "set_comment_15" },
          { text: "30 секунд", callback_data: "set_comment_30" },
          { text: "60 секунд (1м)", callback_data: "set_comment_60" }
        ],
        [
          { text: "◀️ Назад", callback_data: "admin_limits" }
        ]
      ]
    }
  };
}

function getLimitsMaxOptions() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "50 ед.", callback_data: "set_max_50" },
          { text: "100 ед. (Дефолт)", callback_data: "set_max_100" },
          { text: "250 ед.", callback_data: "set_max_250" }
        ],
        [
          { text: "500 ед.", callback_data: "set_max_500" },
          { text: "1000 ед.", callback_data: "set_max_1000" },
          { text: "9999 ед. (Хаос)", callback_data: "set_max_9999" }
        ],
        [
          { text: "◀️ Назад", callback_data: "admin_limits" }
        ]
      ]
    }
  };
}

function getClearingMenuMarkup() {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "💬 Удалить ВСЕ Комментарии", callback_data: "confirm_clear_comments" }
        ],
        [
          { text: "🔄 Полный Сброс по Дефолту", callback_data: "confirm_reset_data" }
        ],
        [
          { text: "◀️ Назад в меню", callback_data: "admin_main" }
        ]
      ]
    }
  };
}

// Display/Redraw suspect cards list with comprehensive edit buttons
async function redisplayCardsList(token: string, chatId: number, messageId: number, cards: ShameCard[]) {
  let txt = "🦹 *Управление фигурантами Доски Позора*:\n\n";
  if (cards.length === 0) {
    txt += "На доске нет ни одного фигуранта. Стенд идеально чист! ✨";
  } else {
    cards.forEach((c, index) => {
      txt += `${index + 1}. *${c.name}* (${c.severity === "minor" ? "🟢 легкий" : c.severity === "moderate" ? "🟡 средний" : "🔴 эпический"})\n_${c.description.substring(0, 80)}${c.description.length > 80 ? "..." : ""}_\n\n`;
    });
  }

  const inlineKeyboard: any[] = [];
  cards.forEach((c) => {
    inlineKeyboard.push([
      { text: `✏️ Ред. ${c.name.substring(0, 12)}`, callback_data: `edit_card_${c.id}` },
      { text: `❌ Уд. ${c.name.substring(0, 12)}`, callback_data: `confirm_del_${c.id}` }
    ]);
  });
  inlineKeyboard.push([
    { text: "◀️ Назад в меню", callback_data: "admin_main" }
  ]);

  await editTelegramMessage(token, chatId, messageId, txt, {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  });
}

function getEditCardMarkup(cardId: string) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "👤 Изменить Имя", callback_data: `edit_fname_${cardId}` },
          { text: "📝 Изменить Описание", callback_data: `edit_fdesc_${cardId}` }
        ],
        [
          { text: "🟢 Легкий проступок", callback_data: `edit_fsev_minor_${cardId}` },
          { text: "🟡 Средний косяк", callback_data: `edit_fsev_moderate_${cardId}` }
        ],
        [
          { text: "🔴 Эпический факап", callback_data: `edit_fsev_epic_${cardId}` }
        ],
        [
          { text: "📸 Обновить Фотографию", callback_data: `edit_fphoto_${cardId}` }
        ],
        [
          { text: "🏷️ Изменить Теги", callback_data: `edit_ftags_${cardId}` },
          { text: "📜 История изменений", callback_data: `view_fhist_${cardId}` }
        ],
        [
          { text: "◀️ Вернуться к списку", callback_data: "admin_list_cards" }
        ]
      ]
    }
  };
}

// Main update handler that integrates callback query events and standard messages
async function handleTelegramUpdate(token: string, update: any) {
  if (!update) return;

  let chatId: number;
  let text = "";
  let isCallback = false;
  let callbackQueryId = "";
  let callbackData = "";
  let messageId = 0;

  if (update.callback_query) {
    isCallback = true;
    const cb = update.callback_query;
    chatId = cb.from.id;
    callbackQueryId = cb.id;
    callbackData = cb.data;
    if (cb.message) {
      chatId = cb.message.chat.id;
      messageId = cb.message.message_id;
    }
  } else if (update.message) {
    const msg = update.message;
    chatId = msg.chat?.id;
    text = (msg.text || "").trim();
  } else {
    return;
  }

  if (typeof chatId !== "number") return;

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
  if (!isCallback && text === "/start") {
    if (authorizedChats.has(chatId)) {
      session.state = "IDLE";
      await sendTelegramMessage(
        token,
        chatId,
        "👮‍♂️ *Главное Управление Позора*\n\nДобро пожаловать обратно! Вы успешно авторизованы.\n\nКоманды:\n⚙️ `/admin` — Панель администрирования (темы, удаление фигурантов, лимиты, очистка)\n➕ `/add` — Добавить фигуранта позора\n❓ `/help` — Справка"
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
    if (isCallback) {
      await answerCallbackQuery(token, callbackQueryId, "Сначала авторизуйтесь!");
      return;
    }
    const isAuthCommand = text.startsWith("/auth ");
    const potentialPass = isAuthCommand ? text.substring(6).trim() : text;

    if (potentialPass === "123dkdk") {
      authorizedChats.add(chatId);
      saveAuthorizedChats();
      session.state = "IDLE";
      await sendTelegramMessage(
        token,
        chatId,
        "✅ *Авторизация успешна!*\n\nТеперь вы можете выставлять фигурантов проступков и изменять параметры сайта напрямую из Telegram.\n\nКоманды:\n⚙️ `/admin` — Панель администрирования\n➕ `/add` — Повесить нового косячника\n❓ `/help` — Справка"
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

  // --- BELOW ROOT IS AUTHORIZED ADMINS SECTION ---

  // Safety checks for unauthorized callback clicks
  if (!authorizedChats.has(chatId)) {
    session.state = "UNAUTHORIZED";
    if (isCallback) await answerCallbackQuery(token, callbackQueryId, "Войдите заново!");
    return;
  }

  // Handle Cancel
  if (!isCallback && text === "/cancel") {
    if (session.state === "IDLE") {
      await sendTelegramMessage(token, chatId, "Активных процессов редактирования/создания карточки нет.");
    } else {
      session.state = "IDLE";
      await sendTelegramMessage(token, chatId, "🚫 Все активные изменения прерваны. Вы вернулись в меню ожидания.");
    }
    return;
  }

  // Handle Help
  if (!isCallback && text === "/help") {
    await sendTelegramMessage(
      token,
      chatId,
      "👮‍♂️ *Справка по управлению стендом*\n\n" +
      "⚙️ `/admin` — Открыть интерактивное управление сайтом (Темы, цвета, шрифты, удаление, лимиты, сброс).\n\n" +
      "➕ `/add` — Пошагово запустить добавление нового косячника:\n" +
      "  1️⃣ Имя нарушителя\n" +
      "  2️⃣ Описание косяка\n" +
      "  3️⃣ Тяжесть вины\n" +
      "  4️⃣ Веб-фото или пропуск\n" +
      "  5️⃣ Теги позора нарушителя\n\n" +
      "🔧 *Быстрые админ-команды*:\n" +
      "• `/title <текст>` — Изменить заголовок сайта\n" +
      "• `/subtitle <текст>` — Изменить подзаголовок сайта\n" +
      "• `/cooldown <сек>` — Установить лимит таймера на оценки\n" +
      "• `/comment_cooldown <сек>` — Таймер для комментариев\n" +
      "• `/limit <число>` — Установить потолок реакций\n\n" +
      "🚫 Команда `/cancel` прерывает создание карточек в любой момент."
    );
    return;
  }

  // Handle /admin text command
  if (!isCallback && (text === "/admin" || text.toLowerCase() === "админка")) {
    session.state = "IDLE";
    await sendTelegramMessage(
      token,
      chatId,
      "👮‍♂️ *Управление Стендом Позора*\n\nДобро пожаловать в центр управления! Здесь вы можете изменять оформление сайта, удалять нарушителей и настраивать лимиты в реальном времени.",
      getMainAdminMenuMarkup()
    );
    return;
  }

  // Handle Slash Text Config Overrides
  if (!isCallback && text.startsWith("/title ")) {
    const val = text.substring(7).trim();
    if (val) {
      const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
      actTheme.siteTitle = val;
      await saveActiveTheme(actTheme);
      await sendTelegramMessage(token, chatId, `✅ *Заголовок сайта изменен на*:\n"${val}"`);
    } else {
      await sendTelegramMessage(token, chatId, "⚠️ Использование: `/title <Новый Заголовок>`");
    }
    return;
  }

  if (!isCallback && text.startsWith("/subtitle ")) {
    const val = text.substring(10).trim();
    if (val) {
      const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
      actTheme.siteSubtitle = val;
      await saveActiveTheme(actTheme);
      await sendTelegramMessage(token, chatId, `✅ *Подзаголовок сайта изменен на*:\n"${val}"`);
    } else {
      await sendTelegramMessage(token, chatId, "⚠️ Использование: `/subtitle <Новый Подзаголовок>`");
    }
    return;
  }

  if (!isCallback && text.startsWith("/cooldown ")) {
    const val = parseInt(text.substring(10).trim(), 10);
    if (!isNaN(val) && val >= 0) {
      const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
      actTheme.reactionCooldown = val;
      await saveActiveTheme(actTheme);
      await sendTelegramMessage(token, chatId, `✅ *Задержка повторных реакций изменена на*: *${val} сек*`);
    } else {
      await sendTelegramMessage(token, chatId, "⚠️ Использование: `/cooldown <число секунд>`");
    }
    return;
  }

  if (!isCallback && text.startsWith("/comment_cooldown ")) {
    const val = parseInt(text.substring(18).trim(), 10);
    if (!isNaN(val) && val >= 0) {
      const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
      actTheme.commentCooldown = val;
      await saveActiveTheme(actTheme);
      await sendTelegramMessage(token, chatId, `✅ *Задержка отправки комментариев заменена на*: *${val} сек*`);
    } else {
      await sendTelegramMessage(token, chatId, "⚠️ Использование: `/comment_cooldown <число секунд>`");
    }
    return;
  }

  if (!isCallback && text.startsWith("/limit ")) {
    const val = parseInt(text.substring(7).trim(), 10);
    if (!isNaN(val) && val >= 1) {
      const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
      actTheme.maxReactionsLimit = val;
      await saveActiveTheme(actTheme);
      await sendTelegramMessage(token, chatId, `✅ *Максимальный потолок очков-реакций заменен на*: *${val}*`);
    } else {
      await sendTelegramMessage(token, chatId, "⚠️ Использование: `/limit <число реакций>`");
    }
    return;
  }


  // ==========================================
  // CALLBACK QUERIES ROUTER (Inline buttons click handler)
  // ==========================================
  if (isCallback && callbackData) {
    if (callbackData === "admin_main") {
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        "👮‍♂️ *Управление Стендом Позора*\n\nДобро пожаловать в центр управления! Здесь вы можете изменять оформление сайта, удалять нарушителей и настраивать лимиты в реальном времени.",
        getMainAdminMenuMarkup()
      );
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "admin_themes") {
      const textThemes = await getThemesMenuText();
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        textThemes,
        getThemesMenuMarkup()
      );
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    // Interactive Text Menu
    if (callbackData === "custom_text_menu") {
      const txt = await getCustomTextMenuText();
      await editTelegramMessage(token, chatId, messageId, txt, getCustomTextMenuMarkup());
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "set_title_interactive") {
      session.state = "AWAITING_CUSTOM_TITLE";
      await sendTelegramMessage(token, chatId, "✍️ *Изменение Главного Заголовка*\n\nПожалуйста, отправьте новое текстовое значение для главного заголовка сайта (например: ОФИСНЫЙ СТОЛБ ПОЗОРА):");
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "set_subtitle_interactive") {
      session.state = "AWAITING_CUSTOM_SUBTITLE";
      await sendTelegramMessage(token, chatId, "✍️ *Изменение Подзаголовка*\n\nОтправьте новое текстовое описание/подзаголовок для верхней части сайта:");
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    // Interactive Colors Menu
    if (callbackData === "custom_colors_menu") {
      const txt = await getCustomColorsMenuText();
      await editTelegramMessage(token, chatId, messageId, txt, getCustomColorsMenuMarkup());
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "set_color_accent") {
      session.state = "AWAITING_ACCENT_COLOR";
      await sendTelegramMessage(token, chatId, "🎨 *Новый Акцентный цвет*\n\nОтправьте HEX-код цвета (например, `#EF4444`, `#10B981` или `rgb`) для подсветки активных кнопок и статусов:");
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "set_color_bg") {
      session.state = "AWAITING_BG_COLOR";
      await sendTelegramMessage(token, chatId, "🎨 *Новый Фоновый цвет страницы*\n\nОтправьте HEX-код (например, `#09090B` для темного фона или `#FFFFFF` для светлого):");
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "set_color_card") {
      session.state = "AWAITING_CARD_COLOR";
      await sendTelegramMessage(token, chatId, "🎨 *Новый Цвет Карточек фигурантов*\n\nОтправьте HEX-цвет для самих карточек позорности на доске (например, `#18181B`):");
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "set_color_text") {
      session.state = "AWAITING_TEXT_COLOR";
      await sendTelegramMessage(token, chatId, "🎨 *Новый Цвет Текста*\n\nОтправьте HEX-код веб-цвета для основного шрифта на стенде (например, `#F4F4F5` или `#27272A`):");
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    // Border and Corner settings
    if (callbackData === "choose_border_style") {
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        "🖼️ *Стиль Рамки карточек нарушителей*\n\nВыберите тип обрамления всех карточек на доске:",
        getBorderStyleMarkup()
      );
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData.startsWith("set_border_")) {
      const border = callbackData.replace("set_border_", "") as any;
      const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
      actTheme.borderStyle = border;
      await saveActiveTheme(actTheme);
      await answerCallbackQuery(token, callbackQueryId, `Установлена рамка: ${border}`);
      const txt = await getCustomColorsMenuText();
      await editTelegramMessage(token, chatId, messageId, txt, getCustomColorsMenuMarkup());
      return;
    }

    if (callbackData === "choose_border_radius") {
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        "📐 *Округлость углов и краев карточек*\n\nЗадайте радиус скругления элементов доски позора:",
        getBorderRadiusMarkup()
      );
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData.startsWith("set_radius_")) {
      const radius = callbackData.replace("set_radius_", "");
      const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
      actTheme.borderRadius = radius;
      await saveActiveTheme(actTheme);
      await answerCallbackQuery(token, callbackQueryId, `Округление углов: ${radius}`);
      const txt = await getCustomColorsMenuText();
      await editTelegramMessage(token, chatId, messageId, txt, getCustomColorsMenuMarkup());
      return;
    }

    // Grid, fonts & cathode noise menu
    if (callbackData === "custom_grid_font_menu") {
      const txt = await getCustomGridFontMenuText();
      await editTelegramMessage(token, chatId, messageId, txt, getCustomGridFontMenuMarkup());
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "choose_font_family") {
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        "🔤 *Выбор Шрифта*\n\nПодберите идеальную типографику интерфейса под Вашу атмосферу:",
        getFontFamilyMarkup()
      );
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData.startsWith("set_font_")) {
      const font = callbackData.replace("set_font_", "") as "sans" | "mono" | "serif" | "grotesk";
      const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
      actTheme.fontFamily = font;
      await saveActiveTheme(actTheme);
      await answerCallbackQuery(token, callbackQueryId, `Применен шрифт: ${font}`);
      const txt = await getCustomGridFontMenuText();
      await editTelegramMessage(token, chatId, messageId, txt, getCustomGridFontMenuMarkup());
      return;
    }

    if (callbackData === "choose_grid_columns") {
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        "🔢 *Сетка галереи*\n\nЗадайте максимальное число колонок карточек на широких экранах:",
        getGridColumnsMarkup()
      );
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData.startsWith("set_columns_")) {
      const cols = callbackData.replace("set_columns_", "") as "2" | "3" | "4";
      const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
      actTheme.gridColumns = cols;
      await saveActiveTheme(actTheme);
      await answerCallbackQuery(token, callbackQueryId, `Сетка: ${cols} колонок!`);
      const txt = await getCustomGridFontMenuText();
      await editTelegramMessage(token, chatId, messageId, txt, getCustomGridFontMenuMarkup());
      return;
    }

    if (callbackData === "toggle_bg_noise") {
      const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
      actTheme.showBackgroundNoise = !actTheme.showBackgroundNoise;
      await saveActiveTheme(actTheme);
      await answerCallbackQuery(token, callbackQueryId, `CRT-шум: ${actTheme.showBackgroundNoise ? "Включен" : "Выключен"}`);
      const txt = await getCustomGridFontMenuText();
      await editTelegramMessage(token, chatId, messageId, txt, getCustomGridFontMenuMarkup());
      return;
    }

    // Limits & timing configuration router
    if (callbackData === "admin_limits") {
      const limitsTxt = await getLimitsMenuText();
      await editTelegramMessage(token, chatId, messageId, limitsTxt, getLimitsMenuMarkup());
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "limits_react") {
      await editTelegramMessage(token, chatId, messageId, "⏱️ *Задержка Оценки (Анти-спам реакций)*\n\nВыберите интервал блокировки перед возможностью метнуть следующий помидор или пинок:", getLimitsReactOptions());
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "limits_comment") {
      await editTelegramMessage(token, chatId, messageId, "💬 *Задержка Комментариев (Флуд-контроль обсуждений)*\n\nЗадайте тайм-аут ожидания между публикациями текстовых сообщений во флудилке:", getLimitsCommentOptions());
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "limits_max") {
      await editTelegramMessage(token, chatId, messageId, "📈 *Максимальный Предел Реакций*\n\nЗадайте максимальный лимит брошенных томатов, фейспалмов или пинков на одну карточку:", getLimitsMaxOptions());
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    // Changing parameters callback shortcuts
    if (callbackData.startsWith("set_react_")) {
      const val = parseInt(callbackData.replace("set_react_", ""), 10);
      const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
      actTheme.reactionCooldown = val;
      await saveActiveTheme(actTheme);
      await answerCallbackQuery(token, callbackQueryId, `Кулдаун реакций: ${val} с!`);
      const limitsTxt = await getLimitsMenuText();
      await editTelegramMessage(token, chatId, messageId, limitsTxt, getLimitsMenuMarkup());
      return;
    }

    if (callbackData.startsWith("set_comment_")) {
      const val = parseInt(callbackData.replace("set_comment_", ""), 10);
      const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
      actTheme.commentCooldown = val;
      await saveActiveTheme(actTheme);
      await answerCallbackQuery(token, callbackQueryId, `Кулдаун комментов: ${val} с!`);
      const limitsTxt = await getLimitsMenuText();
      await editTelegramMessage(token, chatId, messageId, limitsTxt, getLimitsMenuMarkup());
      return;
    }

    if (callbackData.startsWith("set_max_")) {
      const val = parseInt(callbackData.replace("set_max_", ""), 10);
      const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
      actTheme.maxReactionsLimit = val;
      await saveActiveTheme(actTheme);
      await answerCallbackQuery(token, callbackQueryId, `Макс. лимит: ${val}!`);
      const limitsTxt = await getLimitsMenuText();
      await editTelegramMessage(token, chatId, messageId, limitsTxt, getLimitsMenuMarkup());
      return;
    }

    if (callbackData === "admin_clearing") {
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        "🧹 *Сброс и очистка*\n\nВнимание! Вы зашли в опасный раздел. Произведенные здесь операции безвозвратны.",
        getClearingMenuMarkup()
      );
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "admin_music_panel") {
      const activeTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic, bgmPlaylist: [] };
      const textMusic = await getMusicMenuText();
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        textMusic,
        {
          parse_mode: "HTML",
          ...getMusicMenuMarkup(activeTheme.bgmPlaylist || [])
        }
      );
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "add_track_interactive") {
      session.state = "AWAITING_MUSIC_FILE";
      await sendTelegramMessage(
        token,
        chatId,
        "🎵 *Добавление Трека*\n\nОтправьте аудиофайл (MP3/M4A), голосовое сообщение или текстовую ссылку (например, Google Диск или прямую ссылку на .mp3):"
      );
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData.startsWith("del_track_")) {
      const trackId = callbackData.replace("del_track_", "");
      try {
        const theme = await getActiveTheme() || { ...PRESET_THEMES.artistic, bgmPlaylist: [] };
        const playlist = theme.bgmPlaylist || [];
        const updated = playlist.filter((t: BGMTrack) => t.id !== trackId);
        theme.bgmPlaylist = updated;
        await saveActiveTheme(theme);
        
        await answerCallbackQuery(token, callbackQueryId, "Трек удален!");
        
        const textMusic = await getMusicMenuText();
        await editTelegramMessage(
          token,
          chatId,
          messageId,
          textMusic,
          {
            parse_mode: "HTML",
            ...getMusicMenuMarkup(updated)
          }
        );
      } catch (err) {
        await answerCallbackQuery(token, callbackQueryId, "Ошибка удаления трека!");
      }
      return;
    }

    if (callbackData === "admin_list_cards") {
      const cardsList = await getAllCards();
      await redisplayCardsList(token, chatId, messageId, cardsList);
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "admin_add_card") {
      session.state = "AWAITING_NAME";
      await sendTelegramMessage(
        token,
        chatId,
        "👤 *Шаг 1 из 5: Имя фигуранта*\n\nНапишите полное имя и фамилию фигуранта (или его никнейм):"
      );
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    // --- INTERACTIVE CARD EDITING ---
    if (callbackData.startsWith("edit_card_")) {
      const cardId = callbackData.replace("edit_card_", "");
      const cardsList = await getAllCards();
      const card = cardsList.find(c => c.id === cardId);
      if (card) {
        session.editCardId = cardId;
        const msgText = `✏️ *Редактирование Фигуранта: ${card.name}*\n\n` +
                        `• Описание: _${card.description}_\n` +
                        `• Тяжесть: *${card.severity === "minor" ? "🟢 Легкая" : card.severity === "moderate" ? "🟡 Средняя" : "🔴 Эпик"}*\n` +
                        `• Теги: *${card.tags && card.tags.length > 0 ? card.tags.join(', ') : "нет"}*\n\n` +
                        `Выберите поле для интерактивного редактирования:`;
        await editTelegramMessage(token, chatId, messageId, msgText, getEditCardMarkup(cardId));
      } else {
        await answerCallbackQuery(token, callbackQueryId, "Карточка этого косячника уже удалена!");
      }
      return;
    }

    if (callbackData.startsWith("edit_fname_")) {
      const cardId = callbackData.replace("edit_fname_", "");
      session.state = "AWAITING_EDIT_NAME";
      session.editCardId = cardId;
      await sendTelegramMessage(token, chatId, "👤 *Редактирование Имени*\n\nВведите новое имя и фамилию для этого фигуранта:");
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData.startsWith("edit_fdesc_")) {
      const cardId = callbackData.replace("edit_fdesc_", "");
      session.state = "AWAITING_EDIT_DESCRIPTION";
      session.editCardId = cardId;
      await sendTelegramMessage(token, chatId, "📝 *Редактирование Описания*\n\nПодробно напишите новое описание провинности:");
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData.startsWith("edit_fphoto_")) {
      const cardId = callbackData.replace("edit_fphoto_", "");
      session.state = "AWAITING_EDIT_PHOTO";
      session.editCardId = cardId;
      await sendTelegramMessage(token, chatId, "📸 *Редактирование Фотографии*\n\nПожалуйста, отправьте новое изображение фигуранта (прямо картинкой в чат):");
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData.startsWith("edit_fsev_")) {
      const rest = callbackData.replace("edit_fsev_", "");
      let sev: "minor" | "moderate" | "epic" = "minor";
      let cardId = "";
      if (rest.startsWith("minor_")) {
        sev = "minor";
        cardId = rest.replace("minor_", "");
      } else if (rest.startsWith("moderate_")) {
        sev = "moderate";
        cardId = rest.replace("moderate_", "");
      } else if (rest.startsWith("epic_")) {
        sev = "epic";
        cardId = rest.replace("epic_", "");
      }

      const cards = await getAllCards();
      const currentCard = cards.find(c => c.id === cardId);
      if (currentCard) {
        const oldSev = currentCard.severity;
        currentCard.severity = sev;
        if (!currentCard.history) currentCard.history = [];
        currentCard.history.push({
          id: `hist_${Date.now()}`,
          editor: "Telegram Бот",
          action: "Изменение тяжести",
          date: new Date().toISOString(),
          details: `Было: ${oldSev === "minor" ? "Легкая" : oldSev === "moderate" ? "Средняя" : "Эпическая"}. Стало: ${sev === "minor" ? "Легкая" : sev === "moderate" ? "Средняя" : "Эпическая"}`
        });
        await updateCard(currentCard);
        await answerCallbackQuery(token, callbackQueryId, `Тяжесть изменена на: ${sev}`);

        const msgText = `✏️ *Редактирование Фигуранта: ${currentCard.name}*\n\n` +
                        `• Описание: _${currentCard.description}_\n` +
                        `• Тяжесть: *${currentCard.severity === "minor" ? "🟢 Легкая" : currentCard.severity === "moderate" ? "🟡 Средняя" : "🔴 Эпик"}*\n` +
                        `• Теги: *${currentCard.tags && currentCard.tags.length > 0 ? currentCard.tags.join(', ') : "нет"}*\n\n` +
                        `Выберите поле для интерактивного редактирования:`;
        await editTelegramMessage(token, chatId, messageId, msgText, getEditCardMarkup(cardId));
      } else {
        await answerCallbackQuery(token, callbackQueryId, "Карточка не найдена!");
      }
      return;
    }

    if (callbackData.startsWith("edit_ftags_")) {
      const cardId = callbackData.replace("edit_ftags_", "");
      session.state = "AWAITING_EDIT_TAGS";
      session.editCardId = cardId;
      await sendTelegramMessage(token, chatId, "🏷️ *Редактирование Тегов*\n\nОтправьте новые теги через запятую (например: `опоздание, совещание, ололо`) или введите `/skip` для очистки тегов:");
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData.startsWith("view_fhist_")) {
      const cardId = callbackData.replace("view_fhist_", "");
      const cardsList = await getAllCards();
      const card = cardsList.find(c => c.id === cardId);
      if (card) {
        const hist = card.history || [];
        let histText = `📜 *История изменений фигуранта: ${card.name}*\n\n`;
        if (hist.length === 0) {
          histText += "История изменений пуста.";
        } else {
          hist.forEach((h, index) => {
            const hDate = new Date(h.date).toLocaleDateString("ru-RU", { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
            histText += `${index + 1}. *${h.action}* (${hDate})\n🧑‍💻 Редактор: _${h.editor}_\n${h.details ? `📝 Детали: _${h.details}_\n` : ""}\n`;
          });
        }
        
        await editTelegramMessage(token, chatId, messageId, histText, {
          reply_markup: {
            inline_keyboard: [
              [{ text: "◀️ Назад к редактированию", callback_data: `edit_card_${cardId}` }]
            ]
          }
        });
      } else {
        await answerCallbackQuery(token, callbackQueryId, "Карточка не найдена!");
      }
      return;
    }

    // Preset changing engine
    if (callbackData.startsWith("theme_")) {
      const presetKey = callbackData.replace("theme_", "");
      const preset = PRESET_THEMES[presetKey as ThemePreset];
      if (preset) {
        const actTheme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
        const updated: ThemeSettings = {
          ...actTheme,
          id: preset.id,
          name: preset.name,
          backgroundColor: preset.backgroundColor,
          cardColor: preset.cardColor,
          accentColor: preset.accentColor,
          textColor: preset.textColor,
          textSecondaryColor: preset.textSecondaryColor,
          borderStyle: preset.borderStyle,
          borderRadius: preset.borderRadius,
          fontFamily: preset.fontFamily,
          gridColumns: preset.gridColumns,
          showBackgroundNoise: preset.showBackgroundNoise,
        };
        await saveActiveTheme(updated);
        await answerCallbackQuery(token, callbackQueryId, `Выбрана тема: ${preset.name}`);
        
        const textThemes = await getThemesMenuText();
        await editTelegramMessage(
          token,
          chatId,
          messageId,
          textThemes,
          getThemesMenuMarkup()
        );
      }
      return;
    }

    // Card deletion sequence
    if (callbackData.startsWith("confirm_del_")) {
      const cardId = callbackData.replace("confirm_del_", "");
      const cardsList = await getAllCards();
      const current = cardsList.find(c => c.id === cardId);
      if (current) {
        const confirmMarkup = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "✅ Да, стереть карту", callback_data: `do_del_${cardId}` },
                { text: "❌ Отмена", callback_data: "admin_list_cards" }
              ]
            ]
          }
        };
        await editTelegramMessage(
          token,
          chatId,
          messageId,
          `⚠️ *Подтверждение удаления*\n\nВы действительно хотите полностью стереть карточку фигуранта *${current.name}* из базы?\nВсе реакции, статистика и комментарии будут стерты!`,
          confirmMarkup
        );
      } else {
        await answerCallbackQuery(token, callbackQueryId, "Карточка этого косячника уже удалена!");
        const updatedList = await getAllCards();
        await redisplayCardsList(token, chatId, messageId, updatedList);
      }
      return;
    }

    if (callbackData.startsWith("do_del_")) {
      const cardId = callbackData.replace("do_del_", "");
      await deleteCard(cardId);
      await answerCallbackQuery(token, callbackQueryId, "Карточка успешно удалена!");
      const updatedList = await getAllCards();
      await redisplayCardsList(token, chatId, messageId, updatedList);
      return;
    }

    // Comment clearing engine
    if (callbackData === "confirm_clear_comments") {
      const keyb = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Стереть все комменты", callback_data: "do_clear_comments" },
              { text: "❌ Отмена", callback_data: "admin_clearing" }
            ]
          ]
        }
      };
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        "⚠️ *Затирание всех комментариев*\n\nВы собираетесь безвозвратно очистить ВСЕ комментарии изо ВСЕХ карточек на Стенде. Подтверждаете?",
        keyb
      );
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "do_clear_comments") {
      const cardsList = await getAllCards();
      for (const card of cardsList) {
        card.comments = [];
        await updateCard(card);
      }
      await answerCallbackQuery(token, callbackQueryId, "Все дискуссии очищены!");
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        "🧹 *Уборка завершена*\n\nВсе текстовые комментарии во всех карточках были успешно очищены с сервера.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "◀️ Вернуться к сбросу", callback_data: "admin_clearing" }]
            ]
          }
        }
      );
      return;
    }

    // Reset data engine
    if (callbackData === "confirm_reset_data") {
      const keyb = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Выполнить сброс", callback_data: "do_reset_data" },
              { text: "❌ Отмена", callback_data: "admin_clearing" }
            ]
          ]
        }
      };
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        "⚠️ *Сброс стенда позорности*\n\nЭто действие откатит все настройки активного дизайна на шаблон Artistic, полностью удалит добавленные вами карточки и восстановит начальные дефолтные карточки с каноничными проступками. Вы уверены?",
        keyb
      );
      await answerCallbackQuery(token, callbackQueryId);
      return;
    }

    if (callbackData === "do_reset_data") {
      // 1. Reset Active Theme
      const defaultTheme = PRESET_THEMES.artistic;
      await saveActiveTheme(defaultTheme);

      // 2. Wipe current cards
      const cardsList = await getAllCards();
      for (const c of cardsList) {
        await deleteCard(c.id);
      }

      // 3. Inject initial database records
      for (const card of initialShameCards) {
        await addCard(card);
      }

      await answerCallbackQuery(token, callbackQueryId, "Восстановлена дефолтная база!");
      await editTelegramMessage(
        token,
        chatId,
        messageId,
        "🔄 *Сброс Стенда завершен*\n\nВсе оформление и карточки были успешно сброшены к первоначальному каноничному контенту.",
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "◀️ Вернуться к сбросу", callback_data: "admin_clearing" }]
            ]
          }
        }
      );
      return;
    }
  }

  // ==========================================
  // TEXT MESSAGE HANDLER FOR INPUT SESSIONS
  // ==========================================
  switch (session.state) {
    case "AWAITING_MUSIC_FILE": {
      // 1. Check if they sent a text link
      if (text && (text.startsWith("http://") || text.startsWith("https://"))) {
        try {
          const theme = await getActiveTheme() || { ...PRESET_THEMES.artistic, bgmPlaylist: [] };
          const playlist = theme.bgmPlaylist || [];
          
          let trackName = "Ссылка Telegram";
          if (text.includes("drive.google.com")) {
            trackName = "Google Drive (Диск)";
          } else {
            const lastPart = text.split("/").pop() || "";
            if (lastPart.endsWith(".mp3") || lastPart.endsWith(".m4a") || lastPart.endsWith(".ogg") || lastPart.endsWith(".wav")) {
              trackName = decodeURIComponent(lastPart);
            }
          }
          
          const newTrack: BGMTrack = {
            id: `track_${Date.now()}`,
            name: `🎵 ${trackName}`,
            url: text
          };
          
          playlist.push(newTrack);
          theme.bgmPlaylist = playlist;
          await saveActiveTheme(theme);
          
          session.state = "IDLE";
          await sendTelegramMessage(
            token,
            chatId,
            `✅ *Ссылка успешно добавлена!*\n\nНазвание: *${newTrack.name}*\nURL: \`${text}\`\n\n_Напишите /admin для перехода к меню._`
          );
        } catch (err) {
          await sendTelegramMessage(token, chatId, "❌ Произошла ошибка при сохранении ссылки.");
        }
        break;
      }
      
      // 2. Check if a file was sent inside update.message
      const msg = update.message;
      if (msg) {
        let fileId = "";
        let originalName = "";
        
        if (msg.audio) {
          fileId = msg.audio.file_id;
          const artist = msg.audio.performer || "";
          const title = msg.audio.title || "";
          originalName = artist && title ? `${artist} - ${title}` : (msg.audio.file_name || "аудиозапись.mp3");
        } else if (msg.document && (msg.document.mime_type?.startsWith("audio/") || msg.document.file_name?.endsWith(".mp3") || msg.document.file_name?.endsWith(".m4a") || msg.document.file_name?.endsWith(".ogg") || msg.document.file_name?.endsWith(".wav"))) {
          fileId = msg.document.file_id;
          originalName = msg.document.file_name || "документ.mp3";
        } else if (msg.voice) {
          fileId = msg.voice.file_id;
          originalName = `Голосовое от ${new Date().toLocaleDateString()}`;
        }
        
        if (fileId) {
          await sendTelegramMessage(token, chatId, "⏳ *Загрузка и обработка аудиофайла...* Пожалуйста, подождите.");
          
          // Generate file extension
          let ext = ".mp3";
          if (originalName.toLowerCase().endsWith(".m4a")) ext = ".m4a";
          else if (originalName.toLowerCase().endsWith(".ogg")) ext = ".ogg";
          else if (originalName.toLowerCase().endsWith(".wav")) ext = ".wav";
          
          const filename = `track_${Date.now()}${ext}`;
          const destPath = path.join(process.cwd(), "uploads", filename);
          const success = await downloadTelegramFile(token, fileId, destPath);
          
          if (success) {
            try {
              const theme = await getActiveTheme() || { ...PRESET_THEMES.artistic, bgmPlaylist: [] };
              const playlist = theme.bgmPlaylist || [];
              const relativeUrl = `/uploads/${filename}`;
              
              const newTrack: BGMTrack = {
                id: `track_${Date.now()}`,
                name: originalName,
                url: relativeUrl
              };
              
              playlist.push(newTrack);
              theme.bgmPlaylist = playlist;
              await saveActiveTheme(theme);
              
              session.state = "IDLE";
              await sendTelegramMessage(
                token,
                chatId,
                `✅ *Аудиофайл успешно загружен на сайт!*\n\nНазвание: *${originalName}*\nПлейлист обновлен!\n\n_Напишите /admin для перехода к меню._`
              );
            } catch (err) {
              await sendTelegramMessage(token, chatId, "❌ Не удалось прописать файл в настройки темы сайта.");
            }
          } else {
            await sendTelegramMessage(token, chatId, "❌ Сбой при скачивании файла с серверов Telegram.");
          }
          break;
        }
      }
      
      await sendTelegramMessage(
        token,
        chatId,
        "⚠️ Пожалуйста, отправьте корректную ссылку на MP3/Google Drive или прикрепите аудиофайл в чат. Напишите `/cancel` для отмены."
      );
      break;
    }

    case "IDLE":
      if (!isCallback) {
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
            "👮‍♀️ Неизвестная команда.\n• Используйте `/admin` для открытия интерактивной панели управления.\n• Используйте `/add` для добавления новой карточки.\n• Используйте `/help` для получения полной справки."
          );
        }
      }
      break;

    case "AWAITING_CUSTOM_TITLE":
      if (!text) return;
      try {
        const theme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
        theme.siteTitle = text;
        await saveActiveTheme(theme);
        session.state = "IDLE";
        await sendTelegramMessage(token, chatId, `✅ *Главный заголовок сайта успешно изменен на:*\n"${text}"\n\n_Напишите /admin для перехода к панели управления._`);
      } catch (err) {
        await sendTelegramMessage(token, chatId, "❌ Не удалось сохранить значение на сервере. Пожалуйста, напишите /cancel и повторите попытку.");
      }
      break;

    case "AWAITING_CUSTOM_SUBTITLE":
      if (!text) return;
      try {
        const theme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
        theme.siteSubtitle = text;
        await saveActiveTheme(theme);
        session.state = "IDLE";
        await sendTelegramMessage(token, chatId, `✅ *Описание (подзаголовок) успешно изменено на:*\n"${text}"\n\n_Напишите /admin для открытия админки._`);
      } catch (err) {
        await sendTelegramMessage(token, chatId, "❌ Произошла ошибка записи в базу.");
      }
      break;

    case "AWAITING_ACCENT_COLOR":
      if (!text) return;
      try {
        const theme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
        theme.accentColor = text;
        theme.id = "custom";
        await saveActiveTheme(theme);
        session.state = "IDLE";
        await sendTelegramMessage(token, chatId, `✅ *Акцентный цвет успешно переназначен на:* \`${text}\`\n\n_Введите /admin для меню._`);
      } catch (err) {
        await sendTelegramMessage(token, chatId, "❌ Ошибка сохранения цвета.");
      }
      break;

    case "AWAITING_BG_COLOR":
      if (!text) return;
      try {
        const theme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
        theme.backgroundColor = text;
        theme.id = "custom";
        await saveActiveTheme(theme);
        session.state = "IDLE";
        await sendTelegramMessage(token, chatId, `✅ *Фоновый цвет страницы теперь:* \`${text}\`\n\n_Для админки введите /admin_`);
      } catch (err) {
        await sendTelegramMessage(token, chatId, "❌ Ошибка сохранения фона.");
      }
      break;

    case "AWAITING_CARD_COLOR":
      if (!text) return;
      try {
        const theme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
        theme.cardColor = text;
        theme.id = "custom";
        await saveActiveTheme(theme);
        session.state = "IDLE";
        await sendTelegramMessage(token, chatId, `✅ *Фоновый цвет карточек позора теперь:* \`${text}\``);
      } catch (err) {
        await sendTelegramMessage(token, chatId, "❌ Ошибка цвета карточки.");
      }
      break;

    case "AWAITING_TEXT_COLOR":
      if (!text) return;
      try {
        const theme = await getActiveTheme() || { ...PRESET_THEMES.artistic };
        theme.textColor = text;
        theme.id = "custom";
        await saveActiveTheme(theme);
        session.state = "IDLE";
        await sendTelegramMessage(token, chatId, `✅ *Основной цвет шрифта теперь:* \`${text}\``);
      } catch (err) {
        await sendTelegramMessage(token, chatId, "❌ Ошибка цвета шрифта.");
      }
      break;

    case "AWAITING_EDIT_NAME":
      if (!text || text.startsWith("/")) return;
      if (session.editCardId) {
        try {
          const cards = await getAllCards();
          const card = cards.find(c => c.id === session.editCardId);
          if (card) {
            const oldName = card.name;
            card.name = text;
            if (!card.history) card.history = [];
            card.history.push({
              id: `hist_${Date.now()}`,
              editor: "Telegram Бот",
              action: "Изменение имени",
              date: new Date().toISOString(),
              details: `Было: "${oldName}". Стало: "${text}"`
            });
            await updateCard(card);
            session.state = "IDLE";
            await sendTelegramMessage(token, chatId, `✅ *Имя фигуранта успешно изменено на:* *${text}*\n\n_Введите /admin для открытия админки._`);
          } else {
            await sendTelegramMessage(token, chatId, "⚠️ Редактируемый фигурант пропал с сервера!");
          }
        } catch (err) {
          await sendTelegramMessage(token, chatId, "❌ Ошибка записи нового имени фигуранта.");
        }
      }
      break;

    case "AWAITING_EDIT_DESCRIPTION":
      if (!text || text.startsWith("/")) return;
      if (session.editCardId) {
        try {
          const cards = await getAllCards();
          const card = cards.find(c => c.id === session.editCardId);
          if (card) {
            const oldDesc = card.description;
            card.description = text;
            if (!card.history) card.history = [];
            card.history.push({
              id: `hist_${Date.now()}`,
              editor: "Telegram Бот",
              action: "Изменение описания",
              date: new Date().toISOString(),
              details: `Было: "${oldDesc}". Стало: "${text}"`
            });
            await updateCard(card);
            session.state = "IDLE";
            await sendTelegramMessage(token, chatId, `✅ *Прогрешение фигуранта переписано на:* _${text}_\n\n_Напишите /admin для управления._`);
          } else {
            await sendTelegramMessage(token, chatId, "⚠️ Фигурант не найден в базе.");
          }
        } catch (err) {
          await sendTelegramMessage(token, chatId, "❌ Ошибка записи нового описания.");
        }
      }
      break;

    case "AWAITING_EDIT_PHOTO":
      if (isCallback) return;
      if (session.editCardId) {
        let photoUrlInput = "";
        let hasPhotoResult = false;

        // Check if sending base64 direct photo or URL
        if (text && (text.startsWith("http://") || text.startsWith("https://"))) {
          photoUrlInput = text;
          hasPhotoResult = true;
        } else if (update.message && update.message.photo && Array.isArray(update.message.photo) && update.message.photo.length > 0) {
          const photoObj = update.message.photo[update.message.photo.length - 1];
          const fileId = photoObj.file_id;
          await sendTelegramMessage(token, chatId, "⏳ _Фотография получена. Обновляю аватар фигуранта в базе..._");
          try {
            const fileInfoRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
            if (fileInfoRes.ok) {
              const fileInfo = await fileInfoRes.json();
              if (fileInfo.ok && fileInfo.result?.file_path) {
                const base64Img = await downloadTelegramFileAsBase64(token, fileInfo.result.file_path);
                if (base64Img) {
                  photoUrlInput = base64Img;
                  hasPhotoResult = true;
                }
              }
            }
          } catch (pErr) {
            console.error("Failed photo update fetch", pErr);
          }
        }

        if (hasPhotoResult && photoUrlInput) {
          try {
            const cards = await getAllCards();
            const card = cards.find(c => c.id === session.editCardId);
            if (card) {
              card.photoUrl = photoUrlInput;
              if (!card.history) card.history = [];
              card.history.push({
                id: `hist_${Date.now()}`,
                editor: "Telegram Бот",
                action: "Обновление фото",
                date: new Date().toISOString(),
                details: "Фотография фигуранта была обновлена"
              });
              await updateCard(card);
              session.state = "IDLE";
              await sendTelegramMessage(token, chatId, `✅ *Фотография фигуранта ${card.name} успешно обновлена!*\n\n_Напишите /admin для входа в админку._`);
            } else {
              await sendTelegramMessage(token, chatId, "⚠️ Карточка фигуранта удалена.");
            }
          } catch (err) {
            await sendTelegramMessage(token, chatId, "❌ Ошибка сохранения новой аватарки на сервере.");
          }
        } else {
          await sendTelegramMessage(token, chatId, "⚠️ Пожалуйста, пришлите корректное фото прямо в чат или отправьте качественную веб-ссылку.");
        }
      }
      break;

    case "AWAITING_EDIT_TAGS":
      if (isCallback) return;
      if (session.editCardId) {
        let tagsList: string[] = [];
        if (text && text !== "/skip" && text.toLowerCase() !== "пропустить") {
          tagsList = text.split(",").map(t => t.trim()).filter(Boolean);
        }
        try {
          const cards = await getAllCards();
          const card = cards.find(c => c.id === session.editCardId);
          if (card) {
            const oldTags = card.tags || [];
            card.tags = tagsList;
            if (!card.history) card.history = [];
            card.history.push({
              id: `hist_${Date.now()}`,
              editor: "Telegram Бот",
              action: "Обновление тегов",
              date: new Date().toISOString(),
              details: `Было: [${oldTags.join(', ')}]. Стало: [${tagsList.join(', ')}]`
            });
            await updateCard(card);
            session.state = "IDLE";
            await sendTelegramMessage(token, chatId, `✅ *Теги фигуранта ${card.name} успешно изменены на:* ${tagsList.length > 0 ? tagsList.join(", ") : "нет"}\n\n_Введите /admin для открытия панели._`);
          } else {
            await sendTelegramMessage(token, chatId, "⚠️ Карточка фигуранта не найдена.");
          }
        } catch (err) {
          await sendTelegramMessage(token, chatId, "❌ Ошибка при изменении тегов.");
        }
      }
      break;

    case "AWAITING_NAME":
      if (isCallback) return;
      if (!text || text.startsWith("/")) {
        await sendTelegramMessage(token, chatId, "⚠️ Имя не должно быть пустым или начинаться с символа '/'. Пожалуйста, введите имя фигуранта:");
        return;
      }
      session.name = text;
      session.state = "AWAITING_DESCRIPTION";
      await sendTelegramMessage(
        token,
        chatId,
        "📝 *Шаг 2 из 5: Описание проступка*\n\nПодробно опишите, какой косяк совершил фигурант (например: 'Опять свалил вину на джуна и уехал на дачу'):"
      );
      break;

    case "AWAITING_DESCRIPTION":
      if (isCallback) return;
      if (!text || text.startsWith("/")) {
        await sendTelegramMessage(token, chatId, "⚠️ Описание не должно быть пустым или начинаться с '/'. Введите описание проступка фигуранта:");
        return;
      }
      session.description = text;
      session.state = "AWAITING_SEVERITY";
      await sendTelegramMessage(
        token,
        chatId,
        "⚠️ *Шаг 3 из 5: Степень вины*\n\nВыберите степень тяжести, отправив один из вариантов:\n\n🟢 *Легкий*\n🟡 *Средний*\n🔴 *Эпический*",
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
      if (isCallback) return;
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
        "📸 *Шаг 4 из 5: Фотография*\n\nПожалуйста, отправьте фотографию фигуранта.\n\n_Если вы хотите использовать стандартный аватар по умолчанию, отправьте команду_ `/skip`.",
        {
          reply_markup: {
            remove_keyboard: true
          }
        }
      );
      break;

    case "AWAITING_PHOTO":
      if (isCallback) return;
      let photoUrl = "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80"; // Default
      let loadedPhoto = false;

      if (text === "/skip" || text.toLowerCase() === "пропустить") {
        loadedPhoto = true;
      } else if (update.message && update.message.photo && Array.isArray(update.message.photo) && update.message.photo.length > 0) {
        // Take highest resolution photo size
        const photoObj = update.message.photo[update.message.photo.length - 1];
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

      // Transition to Stage 5: Tags list
      session.photoUrlData = photoUrl;
      session.state = "AWAITING_TAGS";
      await sendTelegramMessage(
        token,
        chatId,
        "🏷️ *Шаг 5 из 5: Теги фигуранта*\n\nНапишите теги позора через запятую (например: _веб, баг, деплой_) или введите команду `/skip` для пропуска."
      );
      break;

    case "AWAITING_TAGS": {
      if (isCallback) return;
      let tagsList: string[] = [];
      if (text && text !== "/skip" && text.toLowerCase() !== "пропустить") {
        tagsList = text.split(",").map(t => t.trim()).filter(Boolean);
      }
      
      const timestamp = Date.now();
      const card: ShameCard = {
        id: `shame_tg_${timestamp}`,
        name: session.name || "Анонимный Фигурант",
        description: session.description || "Совершил тайный косяк",
        photoUrl: session.photoUrlData || "https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400&q=80",
        category: "",
        severity: session.severity || "minor",
        date: new Date().toISOString().split("T")[0],
        tomatoes: 0,
        facepalms: 0,
        forgiven: 0,
        comments: [],
        tags: tagsList,
        history: [{
          id: `hist_${Date.now()}`,
          editor: "Telegram Бот",
          action: "Создание карточки улик",
          date: new Date().toISOString(),
          details: `Создано в Telegram. Теги: ${tagsList.length > 0 ? tagsList.join(", ") : "нет"}`
        }]
      };

      try {
        await addCard(card);
        session.state = "IDLE";
        await sendTelegramMessage(
          token,
          chatId,
          `🎉 *Фигурант успешно добавлен!*\n\nКарточка позора для *${card.name}* создана и опубликована! Теги: ${tagsList.length > 0 ? tagsList.map(t => `#${t}`).join(", ") : "нет"}.\n\nСтупайте швырять томаты на доске позора!`
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
    }

    default:
      session.state = "IDLE";
      await sendTelegramMessage(token, chatId, "Что-то пошло не так. Сессия сброшена. Введите `/add` для добавления фигуранта.");
      break;
  }
}

// Background long poller
const UPDATE_ID_FILE = path.join(process.cwd(), "telegram_last_update.json");
let lastUpdateId = 0;

export async function initTelegramBot() {
  const token = process.env.TELEGRAM_BOT_TOKEN || "8809663869:AAEkUOFB16D7VOKx5kNXtZzq-ESxfAMOdvU";
  if (!token) {
    console.warn("TELEGRAM_BOT_TOKEN is not defined. Telegram Bot disabled.");
    return;
  }

  // 1. Try loading last processed update ID from cache file
  try {
    if (fs.existsSync(UPDATE_ID_FILE)) {
      const savedId = fs.readFileSync(UPDATE_ID_FILE, "utf-8");
      const parsed = parseInt(savedId, 10);
      if (!isNaN(parsed) && parsed > 0) {
        lastUpdateId = parsed;
        console.log(`Telegram Bot loaded lastUpdateId from file: ${lastUpdateId}`);
      }
    }
  } catch (e) {
    console.error("Failed to load telegram_last_update.json:", e);
  }

  // 2. If no cache exists, query Telegram for the absolute latest update ID and skip previous queue backlog
  if (lastUpdateId === 0) {
    try {
      const initUrl = `https://api.telegram.org/bot${token}/getUpdates?offset=-1&limit=1`;
      const initRes = await fetch(initUrl);
      if (initRes.ok) {
        const initData = await initRes.json();
        if (initData.ok && Array.isArray(initData.result) && initData.result.length > 0) {
          lastUpdateId = initData.result[0].update_id;
          console.log(`Telegram Bot initialized with latest update_id from Telegram: ${lastUpdateId}`);
          try {
            fs.writeFileSync(UPDATE_ID_FILE, lastUpdateId.toString(), "utf-8");
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error("Failed to initialize Telegram Bot lastUpdateId online:", err);
    }
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
      if (data.ok && Array.isArray(data.result) && data.result.length > 0) {
        let maxId = lastUpdateId;
        for (const update of data.result) {
          maxId = Math.max(maxId, update.update_id);
          try {
            await handleTelegramUpdate(token, update);
          } catch (updateErr) {
            console.error("Error processing update:", updateErr);
          }
        }
        if (maxId > lastUpdateId) {
          lastUpdateId = maxId;
          try {
            fs.writeFileSync(UPDATE_ID_FILE, lastUpdateId.toString(), "utf-8");
          } catch (e) {}
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
