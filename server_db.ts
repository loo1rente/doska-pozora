import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { ShameCard, ThemeSettings } from './src/types';
import { initialShameCards } from './src/data/initialData';

// Setup database mode
const databaseUrl = process.env.DATABASE_URL || '';
const isPostgres = databaseUrl.trim().length > 0;

const JSON_FILE_PATH = path.join(process.cwd(), 'shame_data_backup.json');

// Postgres Client Pool/Client Setup
let pool: pg.Pool | null = null;
if (isPostgres) {
  console.log('Connecting to PostgreSQL database using DATABASE_URL...');
  pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false } // Required for platforms like Render/Neon/etc.
  });
} else {
  console.log('No DATABASE_URL found. Working in Local File Database fallback mode using shame_data_backup.json');
}

// In-memory or file backing utils
function loadLocalData(): { cards: ShameCard[]; theme: ThemeSettings | null } {
  if (fs.existsSync(JSON_FILE_PATH)) {
    try {
      const data = fs.readFileSync(JSON_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.cards)) {
        parsed.cards = parsed.cards.filter((c: any) => c.id !== '2' && c.id !== '3' && c.id !== '4');
      }
      return parsed;
    } catch (e) {
      console.error('Error reading local file database:', e);
    }
  }
  return { cards: initialShameCards, theme: null };
}

function saveLocalData(cards: ShameCard[], theme: ThemeSettings | null) {
  try {
    const cleanCards = cards.filter(c => c.id !== '2' && c.id !== '3' && c.id !== '4');
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify({ cards: cleanCards, theme }, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing local file database:', e);
  }
}

// Initialize tables or JSON file
export async function initializeDb() {
  if (isPostgres && pool) {
    try {
      const dbClient = await pool.connect();
      console.log('PostgreSQL connection established successfully.');
      
      // Create shame_cards table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS shame_cards (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          photo_url TEXT NOT NULL,
          category TEXT NOT NULL,
          severity TEXT NOT NULL,
          date TEXT NOT NULL,
          tomatoes INTEGER DEFAULT 0,
          facepalms INTEGER DEFAULT 0,
          forgiven INTEGER DEFAULT 0
        )
      `);
      console.log('Table "shame_cards" verified/created.');

      // Delete old seeding records to ensure they are cleared
      await dbClient.query("DELETE FROM shame_cards WHERE id IN ('2', '3', '4')");
      console.log('Old seeded cards (Dmitriy, Anastasia, Sergey) deleted from Postgres.');

      // Create shame_theme table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS shame_theme (
          id TEXT PRIMARY KEY,
          settings JSONB NOT NULL
        )
      `);
      console.log('Table "shame_theme" verified/created.');

      // Seed shame_cards table if it's empty
      const countRes = await dbClient.query('SELECT COUNT(*) FROM shame_cards');
      const count = parseInt(countRes.rows[0].count, 10);
      if (count === 0) {
        console.log('Seeding initial PostgreSQL database cards...');
        for (const card of initialShameCards) {
          await dbClient.query(`
            INSERT INTO shame_cards (id, name, description, photo_url, category, severity, date, tomatoes, facepalms, forgiven)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            card.id,
            card.name,
            card.description,
            card.photoUrl,
            card.category || '',
            card.severity,
            card.date,
            card.tomatoes,
            card.facepalms,
            card.forgiven
          ]);
        }
        console.log('Successfully seeded initial PostgreSQL database.');
      }
      
      dbClient.release();
    } catch (err) {
      console.error('Failed to initialize PostgreSQL. Falling back to local file model.', err);
    }
  } else {
    // Local File Mode Setup check
    let data = loadLocalData();
    data.cards = data.cards.filter(c => c.id !== '2' && c.id !== '3' && c.id !== '4');
    saveLocalData(data.cards, data.theme);
    console.log('Local File Database (shame_data_backup.json) initialized and cleared of old seed data.');
  }
}

// Fetch all Shame Cards
export async function getAllCards(): Promise<ShameCard[]> {
  if (isPostgres && pool) {
    try {
      const res = await pool.query('SELECT * FROM shame_cards');
      return res.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        photoUrl: row.photo_url,
        category: row.category,
        severity: row.severity,
        date: row.date,
        tomatoes: Number(row.tomatoes),
        facepalms: Number(row.facepalms),
        forgiven: Number(row.forgiven)
      }));
    } catch (e) {
      console.error('Error fetching cards from Postgres, using local JSON fallback', e);
    }
  }
  return loadLocalData().cards;
}

// Add card
export async function addCard(card: ShameCard): Promise<void> {
  if (isPostgres && pool) {
    try {
      await pool.query(`
        INSERT INTO shame_cards (id, name, description, photo_url, category, severity, date, tomatoes, facepalms, forgiven)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        card.id,
        card.name,
        card.description,
        card.photoUrl,
        card.category || '',
        card.severity,
        card.date,
        card.tomatoes,
        card.facepalms,
        card.forgiven
      ]);
      return;
    } catch (e) {
      console.error('Error inserting card to Postgres, using local JSON fallback', e);
    }
  }
  const data = loadLocalData();
  data.cards.unshift(card);
  saveLocalData(data.cards, data.theme);
}

// Update card
export async function updateCard(card: ShameCard): Promise<void> {
  if (isPostgres && pool) {
    try {
      await pool.query(`
        UPDATE shame_cards
        SET name = $2, description = $3, photo_url = $4, category = $5, severity = $6, date = $7, tomatoes = $8, facepalms = $9, forgiven = $10
        WHERE id = $1
      `, [
        card.id,
        card.name,
        card.description,
        card.photoUrl,
        card.category || '',
        card.severity,
        card.date,
        card.tomatoes,
        card.facepalms,
        card.forgiven
      ]);
      return;
    } catch (e) {
      console.error('Error updating card in Postgres, using local JSON fallback', e);
    }
  }
  const data = loadLocalData();
  data.cards = data.cards.map(c => c.id === card.id ? card : c);
  saveLocalData(data.cards, data.theme);
}

// Delete card
export async function deleteCard(id: string): Promise<void> {
  if (isPostgres && pool) {
    try {
      await pool.query('DELETE FROM shame_cards WHERE id = $1', [id]);
      return;
    } catch (e) {
      console.error('Error deleting card in Postgres, using local JSON fallback', e);
    }
  }
  const data = loadLocalData();
  data.cards = data.cards.filter(c => c.id !== id);
  saveLocalData(data.cards, data.theme);
}

// Get Active Theme
export async function getActiveTheme(): Promise<ThemeSettings | null> {
  if (isPostgres && pool) {
    try {
      const res = await pool.query('SELECT settings FROM shame_theme WHERE id = $1', ['active_theme']);
      if (res.rows.length > 0) {
        return res.rows[0].settings as ThemeSettings;
      }
    } catch (e) {
      console.error('Error getting theme from Postgres, using local JSON fallback', e);
    }
  }
  return loadLocalData().theme;
}

// Save Theme
export async function saveActiveTheme(theme: ThemeSettings): Promise<void> {
  if (isPostgres && pool) {
    try {
      await pool.query(`
        INSERT INTO shame_theme (id, settings)
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings
      `, ['active_theme', JSON.stringify(theme)]);
      return;
    } catch (e) {
      console.error('Error upserting theme in Postgres, using local JSON fallback', e);
    }
  }
  const data = loadLocalData();
  data.theme = theme;
  saveLocalData(data.cards, data.theme);
}
