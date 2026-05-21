import { initializeApp } from 'firebase/app';
import { getFirestore, doc, collection, getDocs, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { ShameCard, ThemeSettings } from './src/types';
import { initialShameCards } from './src/data/initialData';

// Firestore Operation Helpers for Error Handler
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 1. Firebase Firestore Setup
const firebaseApiKey = process.env.FIREBASE_API_KEY;
const firebaseAuthDomain = process.env.FIREBASE_AUTH_DOMAIN;
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseFirestoreDatabaseId = process.env.FIREBASE_FIRESTORE_DATABASE_ID;
const firebaseStorageBucket = process.env.FIREBASE_STORAGE_BUCKET;
const firebaseMessagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID;
const firebaseAppId = process.env.FIREBASE_APP_ID;

let firebaseConfig: any = null;

if (firebaseApiKey && firebaseProjectId) {
  firebaseConfig = {
    apiKey: firebaseApiKey,
    authDomain: firebaseAuthDomain,
    projectId: firebaseProjectId,
    firestoreDatabaseId: firebaseFirestoreDatabaseId,
    storageBucket: firebaseStorageBucket,
    messagingSenderId: firebaseMessagingSenderId,
    appId: firebaseAppId
  };
} else {
  // Fallback to config file in development
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    try {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      console.error('Error reading firebase-applet-config.json', e);
    }
  }
}

let db: any = null;
if (firebaseConfig) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
    console.log(`Firebase Firestore initialized successfully for project ${firebaseConfig.projectId}`);
  } catch (e) {
    console.error('Failed to initialize Firebase Firestore SDK:', e);
  }
}

// 2. PostgreSQL Setup
const databaseUrl = process.env.DATABASE_URL || '';
const isPostgres = databaseUrl.trim().length > 0;

let pool: pg.Pool | null = null;
if (isPostgres) {
  console.log('Connecting to PostgreSQL database using DATABASE_URL...');
  pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false } // Required for platforms like Render/Neon/etc.
  });
}

const JSON_FILE_PATH = path.join(process.cwd(), 'shame_data_backup.json');

// In-memory or file backing utils (Local JSON mode)
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
  if (db) {
    console.log('Using Firebase Firestore database as primary storage.');
    return;
  }

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
  if (db) {
    try {
      const q = collection(db, 'shame_cards');
      const snapshot = await getDocs(q);
      const cards: ShameCard[] = [];
      snapshot.forEach((docSnap) => {
        cards.push(docSnap.data() as ShameCard);
      });
      return cards;
    } catch (e) {
      handleFirestoreError(e, OperationType.LIST, 'shame_cards');
    }
  }

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
  if (db) {
    try {
      const docRef = doc(db, 'shame_cards', card.id);
      await setDoc(docRef, card);
      return;
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, `shame_cards/${card.id}`);
    }
  }

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
  if (db) {
    try {
      const docRef = doc(db, 'shame_cards', card.id);
      await setDoc(docRef, card);
      return;
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `shame_cards/${card.id}`);
    }
  }

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
  if (db) {
    try {
      const docRef = doc(db, 'shame_cards', id);
      await deleteDoc(docRef);
      return;
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `shame_cards/${id}`);
    }
  }

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
  if (db) {
    try {
      const docRef = doc(db, 'shame_theme', 'active_theme');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        return docSnap.data() as ThemeSettings;
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, 'shame_theme/active_theme');
    }
  }

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
  if (db) {
    try {
      const docRef = doc(db, 'shame_theme', 'active_theme');
      await setDoc(docRef, theme);
      return;
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'shame_theme/active_theme');
    }
  }

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
