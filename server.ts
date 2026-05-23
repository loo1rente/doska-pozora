import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

// Load configuration
dotenv.config();

import {
  initializeDb,
  getAllCards,
  addCard,
  updateCard,
  deleteCard,
  getActiveTheme,
  saveActiveTheme,
  authenticateUser
} from "./server_db";
import { initTelegramBot } from "./telegram_bot";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '15mb' }));

  // Initialize DB tables (or local files)
  await initializeDb();

  // Initialize the Telegram Bot listener
  initTelegramBot().catch((err) => {
    console.error("Failed to initialize Telegram Bot:", err);
  });

  // API endpoints FIRST

  // Auth login/register
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { nickname, password } = req.body;
      const outcome = await authenticateUser(nickname, password);
      res.json(outcome);
    } catch (err) {
      console.error("Auth server error:", err);
      res.status(500).json({ success: false, message: "Внутренняя ошибка сервера при аутентификации." });
    }
  });

  // Get active theme settings
  app.get("/api/theme", async (req, res) => {
    try {
      const theme = await getActiveTheme();
      res.json(theme);
    } catch (err) {
      res.status(500).json({ error: "Failed to get theme settings" });
    }
  });

  // Save/Update theme settings
  app.post("/api/theme", async (req, res) => {
    try {
      await saveActiveTheme(req.body);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to update theme settings" });
    }
  });

  // Get list of all infraction cards
  app.get("/api/cards", async (req, res) => {
    try {
      const cards = await getAllCards();
      res.json(cards);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch infraction cards" });
    }
  });

  // Create new infraction card
  app.post("/api/cards", async (req, res) => {
    try {
      const card = req.body;
      await addCard(card);
      res.status(201).json({ success: true, card });
    } catch (err: any) {
      if (err?.message?.includes("CARD_DELETED")) {
        return res.status(410).json({ error: "CARD_DELETED", message: "This card has been deleted and cannot be added again." });
      }
      res.status(500).json({ error: "Failed to create infraction card" });
    }
  });

  const lastReactionTimeByIp = new Map<string, number>();

  // Update existing infraction card
  app.put("/api/cards/:id", async (req, res) => {
    try {
      const card = req.body;
      const isReact = req.headers["x-action-react"] === "true";

      if (isReact) {
        const adminToken = req.headers["authorization"];
        const isAdmin = adminToken === "123dkdk";
        if (!isAdmin) {
          // Get IP address safely from forwarded headers or remote socket
          const rawIp = req.headers["x-forwarded-for"] as string || req.socket.remoteAddress || "127.0.0.1";
          const ip = rawIp.split(',')[0].trim();

          const now = Date.now();
          const lastTime = lastReactionTimeByIp.get(ip) || 0;
          
          const currentTheme = await getActiveTheme();
          const cooldownSecs = currentTheme?.reactionCooldown ?? 30;
          const waitTime = cooldownSecs * 1000;

          if (now - lastTime < waitTime) {
            const secsLeft = Math.ceil((waitTime - (now - lastTime)) / 1000);
            return res.status(429).json({
              error: "Too Many Requests",
              retryAfter: secsLeft,
              message: `Лимит превышен. Пожалуйста, подождите ещё ${secsLeft} сек.`
            });
          }

          // Lock future reactions for this client
          lastReactionTimeByIp.set(ip, now);
        }
      }

      await updateCard(card);
      res.json({ success: true, card });
    } catch (err: any) {
      if (err?.message?.includes("CARD_DELETED")) {
        return res.status(410).json({ error: "CARD_DELETED", message: "This card has been deleted and cannot be updated." });
      }
      res.status(500).json({ error: "Failed to update infraction card" });
    }
  });

  // Delete infraction card
  app.delete("/api/cards/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await deleteCard(id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete infraction card" });
    }
  });

  // Setup Vite development or static storage endpoints
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server launched successfully on http://0.0.0.0:${PORT}`);
  });
}

startServer();
