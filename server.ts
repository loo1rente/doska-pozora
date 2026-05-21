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
  saveActiveTheme
} from "./server_db";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware
  app.use(express.json({ limit: '15mb' }));

  // Initialize DB tables (or local files)
  await initializeDb();

  // API endpoints FIRST

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
    } catch (err) {
      res.status(500).json({ error: "Failed to create infraction card" });
    }
  });

  // Update existing infraction card
  app.put("/api/cards/:id", async (req, res) => {
    try {
      const card = req.body;
      await updateCard(card);
      res.json({ success: true, card });
    } catch (err) {
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
