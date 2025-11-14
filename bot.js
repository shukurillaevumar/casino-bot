// bot.js
require("dotenv").config();
const { Telegraf, session, Markup } = require("telegraf");
const axios = require("axios");

const bot = new Telegraf(process.env.BOT_TOKEN);

const CASINO_API_BASE =
  process.env.CASINO_API_BASE || `https://api.${GAMES.code}/api/get_games`;

// Список игр и настройки для bomb
const GAMES = [
  { code: "coinflip", label: "🪙 Coinflip", code: "coinflip" },
  { code: "hilo", label: "📉 Hi-Lo" },
  { code: "dice", label: "🎲 Dice" },
  { code: "crash", label: "📈 Crash" },
  { code: "mines", label: "💣 Mines", bombRange: [2, 24] },
  { code: "stairs", label: "🪜 Stairs", bombRange: [1, 7] },
  { code: "tower", label: "🏰 Tower", bombRange: [1, 4] },
  { code: "roulette", label: "🎯 Roulette" },
  { code: "rocketman", label: "🚀 Rocketman" },
];

// Простая сессия в памяти
bot.use(
  session({
    defaultSession: () => ({
      userId: null,
      waitingForUserId: false,
      waitingForBomb: null, // { gameCode: string, min, max }
    }),
  })
);

// Хелпер: найти игру по коду
function findGame(code) {
  return GAMES.find((g) => g.code === code);
}

// Хелпер: красивое приветствие
function getWelcomeText() {
  return [
    "🛰 <b>Добро пожаловать в игровой интерфейс</b>",
    "",
    "Я твой персональный <b>игровой навигатор</b>.",
    "Сначала отправь мне свой <code>user_id</code>,",
    "а потом выбери игру из панели ниже.",
  ].join("\n");
}

function getAskUserIdText() {
  return [
    "🔐 <b>Идентификация игрока</b>",
    "",
    "Отправь свой <code>user_id</code> (ID или username).",
    "Без него я не смогу подключиться к игровому ядру.",
  ].join("\n");
}

function getGameMenuText(userId) {
  return [
    "🧬 <b>Игровой модуль активирован</b>",
    "",
    `Текущий профиль: <code>${userId}</code>`,
    "",
    "Выбери игру из нижнего меню.",
  ].join("\n");
}

function getBombPromptText(game) {
  return [
    `${game.label} активирована.`,
    "",
    "💣 <b>Настройка бомб</b>",
    `Введи количество бомб в диапазоне <code>${game.bombRange[0]}-${game.bombRange[1]}</code>.`,
  ].join("\n");
}

// Генерация inline-клавиатуры с играми
function buildGameKeyboard() {
  const buttons = GAMES.map((g) =>
    Markup.button.callback(g.label, `GAME_${g.code}`)
  );

  // Разложим по 2 в ряд
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }
  return Markup.inlineKeyboard(rows);
}

// Запрос к API казино
async function fetchGameData({ game, userId, bomb }) {
  const params = {
    game,
    user_id: userId,
  };

  // Если бомбы нужны
  if (typeof bomb !== "undefined") {
    params.bomb = bomb;
  }

  const response = await axios.get(CASINO_API_BASE, { params });
  return response.data;
}

// Старт
bot.start(async (ctx) => {
  ctx.session.userId = null;
  ctx.session.waitingForUserId = true;
  ctx.session.waitingForBomb = null;

  await ctx.reply(getWelcomeText(), { parse_mode: "HTML" });
  await ctx.reply(getAskUserIdText(), { parse_mode: "HTML" });
});

// Обработка любого текста
bot.on("text", async (ctx) => {
  const text = ctx.message.text.trim();

  // 1) Если ждем user_id
  if (ctx.session.waitingForUserId) {
    ctx.session.userId = text;
    ctx.session.waitingForUserId = false;

    await ctx.reply("✅ Профиль подключен: <code>" + text + "</code>", {
      parse_mode: "HTML",
    });

    await ctx.reply(getGameMenuText(text), {
      parse_mode: "HTML",
      ...buildGameKeyboard(),
    });
    return;
  }

  // 2) Если ждем bomb
  if (ctx.session.waitingForBomb) {
    const { gameCode, min, max } = ctx.session.waitingForBomb;
    const game = findGame(gameCode);

    const bomb = Number(text);
    if (!Number.isInteger(bomb) || bomb < min || bomb > max) {
      await ctx.reply(
        [
          "⚠️ Некорректное значение.",
          `Введи целое число от <b>${min}</b> до <b>${max}</b>.`,
        ].join("\n"),
        { parse_mode: "HTML" }
      );
      return;
    }

    // Всё ок, бомбы валидны
    ctx.session.waitingForBomb = null;

    const userId = ctx.session.userId;
    if (!userId) {
      await ctx.reply(
        "❌ Сессия потеряна. Отправь /start и заново введи user_id."
      );
      return;
    }

    await ctx.reply(
      `🧨 Конфигурация установлена.\nИгра: <b>${game.label}</b>\nБомбы: <code>${bomb}</code>\n\nЗапрашиваю данные...`,
      { parse_mode: "HTML" }
    );

    try {
      const data = await fetchGameData({ game: gameCode, userId, bomb });
      const pretty = JSON.stringify(data, null, 2);

      await ctx.reply(
        [
          "🧪 <b>Ответ игрового ядра</b>",
          "",
          "<pre>" + escapeHtml(pretty) + "</pre>",
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    } catch (err) {
      console.error(err);
      await ctx.reply(
        "🔥 Произошла ошибка при запросе к API.\nПроверь параметры или свяжись с админом."
      );
    }

    return;
  }

  // Если ничего не ждем: подскажем, что делать
  if (!ctx.session.userId) {
    ctx.session.waitingForUserId = true;
    await ctx.reply(getAskUserIdText(), { parse_mode: "HTML" });
  } else {
    await ctx.reply(
      "⚙️ Я уже знаю твой user_id.\nИспользуй меню ниже, чтобы выбрать игру.",
      buildGameKeyboard()
    );
  }
});

// Обработка нажатий на игры
GAMES.forEach((game) => {
  bot.action(`GAME_${game.code}`, async (ctx) => {
    await ctx.answerCbQuery(); // убрать "часики"

    const userId = ctx.session.userId;
    if (!userId) {
      ctx.session.waitingForUserId = true;
      await ctx.reply(getAskUserIdText(), { parse_mode: "HTML" });
      return;
    }

    // Если игре нужна bomb
    if (game.bombRange) {
      ctx.session.waitingForBomb = {
        gameCode: game.code,
        min: game.bombRange[0],
        max: game.bombRange[1],
      };

      await ctx.reply(getBombPromptText(game), { parse_mode: "HTML" });
      return;
    }

    // bomb не нужен, сразу дергаем API
    await ctx.reply(
      [
        `🚀 Игра <b>${game.label}</b> запущена.`,
        "",
        "Подключаюсь к игровому ядру...",
      ].join("\n"),
      { parse_mode: "HTML" }
    );

    try {
      const data = await fetchGameData({ game: game.code, userId });
      const pretty = JSON.stringify(data, null, 2);

      await ctx.reply(
        [
          "🧪 <b>Ответ игрового ядра</b>",
          "",
          "<pre>" + escapeHtml(pretty) + "</pre>",
        ].join("\n"),
        { parse_mode: "HTML" }
      );
    } catch (err) {
      console.error(err);
      await ctx.reply(
        "🔥 Произошла ошибка при запросе к API.\nПроверь параметры или свяжись с админом."
      );
    }
  });
});

// Хелпер для <pre> в HTML
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

bot.launch().then(() => {
  console.log("Bot started in neon mode");
});

// Чтобы корректно останавливался на хостингах
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
