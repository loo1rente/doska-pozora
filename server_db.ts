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
let isPostgresConnected = false;
if (isPostgres) {
  console.log('Connecting to PostgreSQL database using DATABASE_URL...');
  pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false } // Required for platforms like Render/Neon/etc.
  });
}

const JSON_FILE_PATH = path.join(process.cwd(), 'shame_data_backup.json');

// In-memory or file backing utils (Local JSON mode)
function loadLocalData(): { cards: ShameCard[]; theme: ThemeSettings | null; users?: { nickname: string; passwordHash: string }[]; deletedIds?: string[] } {
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
  return { cards: initialShameCards, theme: null, users: [], deletedIds: [] };
}

function saveLocalData(cards: ShameCard[], theme: ThemeSettings | null, users?: { nickname: string; passwordHash: string }[], deletedIds?: string[]) {
  try {
    const cleanCards = cards.filter(c => c.id !== '2' && c.id !== '3' && c.id !== '4');
    let existingUsers: { nickname: string; passwordHash: string }[] = [];
    let existingDeletedIds: string[] = [];
    if (fs.existsSync(JSON_FILE_PATH)) {
      try {
        const fileContent = fs.readFileSync(JSON_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(fileContent);
        if (parsed) {
          if (Array.isArray(parsed.users)) {
            existingUsers = parsed.users;
          }
          if (Array.isArray(parsed.deletedIds)) {
            existingDeletedIds = parsed.deletedIds;
          }
        }
      } catch (e) {
        // Ignored
      }
    }
    const finalUsers = users || existingUsers;
    const finalDeletedIds = deletedIds || existingDeletedIds;
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify({ cards: cleanCards, theme, users: finalUsers, deletedIds: finalDeletedIds }, null, 2), 'utf-8');
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
      isPostgresConnected = true;
      
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
          forgiven INTEGER DEFAULT 0,
          comments TEXT DEFAULT '[]'
        )
      `);
      // Ensure column exists for schema updates
      await dbClient.query(`
        ALTER TABLE shame_cards ADD COLUMN IF NOT EXISTS comments TEXT DEFAULT '[]'
      `);
      await dbClient.query(`
        ALTER TABLE shame_cards ADD COLUMN IF NOT EXISTS tags TEXT DEFAULT '[]'
      `);
      await dbClient.query(`
        ALTER TABLE shame_cards ADD COLUMN IF NOT EXISTS history TEXT DEFAULT '[]'
      `);
      console.log('Table "shame_cards" verified/created with comments column.');

      // Create shame_users table for authenticating user names
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS shame_users (
          nickname TEXT PRIMARY KEY,
          password TEXT NOT NULL
        )
      `);
      console.log('Table "shame_users" verified/created.');

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

      // Create deleted_card_ids table to avoid resurrections
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS deleted_card_ids (
          id TEXT PRIMARY KEY,
          deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Table "deleted_card_ids" verified/created.');

      dbClient.release();
    } catch (err) {
      console.error('Failed to initialize PostgreSQL. Falling back to local file model.', err);
    }
  } else {
    // Local File Mode Setup check
    let data = loadLocalData();
    saveLocalData(data.cards, data.theme, data.users);
    console.log('Local File Database (shame_data_backup.json) initialized.');
  }
}

// Check if a card has been deleted to prevent client-side resurrecting/uploading of cached cards
export async function isCardDeleted(id: string): Promise<boolean> {
  if (db) {
    try {
      const docRef = doc(db, 'deleted_card_ids', id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        return true;
      }
    } catch (e) {
      console.error('Firestore check isCardDeleted error:', e);
    }
  }

  if (isPostgresConnected && pool) {
    try {
      const res = await pool.query('SELECT 1 FROM deleted_card_ids WHERE id = $1', [id]);
      if (res.rows.length > 0) {
        return true;
      }
    } catch (e) {
      console.error('Postgres check isCardDeleted error:', e);
    }
  }

  const localData = loadLocalData() as any;
  if (localData.deletedIds && localData.deletedIds.includes(id)) {
    return true;
  }
  return false;
}

// Track a deleted card's ID
export async function trackDeletedCardId(id: string): Promise<void> {
  if (db) {
    try {
      const docRef = doc(db, 'deleted_card_ids', id);
      await setDoc(docRef, { deletedAt: new Date().toISOString() });
    } catch (e) {
      console.error('Firestore trackDeletedCardId error:', e);
    }
  }

  if (isPostgresConnected && pool) {
    try {
      await pool.query('INSERT INTO deleted_card_ids (id) VALUES ($1) ON CONFLICT (id) DO NOTHING', [id]);
    } catch (e) {
      console.error('Postgres trackDeletedCardId error:', e);
    }
  }

  const localData = loadLocalData() as any;
  if (!localData.deletedIds) {
    localData.deletedIds = [];
  }
  if (!localData.deletedIds.includes(id)) {
    localData.deletedIds.push(id);
    saveLocalData(localData.cards, localData.theme, localData.users, localData.deletedIds);
  }
}

// Fetch all Shame Cards
export async function getAllCards(): Promise<ShameCard[]> {
  let dbCards: ShameCard[] = [];
  let dbSuccess = false;

  if (db) {
    try {
      const q = collection(db, 'shame_cards');
      const snapshot = await getDocs(q);
      snapshot.forEach((docSnap) => {
        dbCards.push(docSnap.data() as ShameCard);
      });
      dbSuccess = true;
    } catch (e) {
      console.error('Firestore list error, falling back to local files:', e);
    }
  }

  if (!dbSuccess && isPostgresConnected && pool) {
    try {
      const res = await pool.query('SELECT * FROM shame_cards');
      dbCards = res.rows.map(row => {
        let parsedComments = [];
        let parsedTags = [];
        let parsedHistory = [];
        try {
          if (row.comments) {
            parsedComments = typeof row.comments === 'string' ? JSON.parse(row.comments) : row.comments;
          }
        } catch (e) {
          console.error(`Failed to parse comments for row ${row.id}:`, e);
        }
        try {
          if (row.tags) {
            parsedTags = typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags;
          }
        } catch (e) {
          console.error(`Failed to parse tags for row ${row.id}:`, e);
        }
        try {
          if (row.history) {
            parsedHistory = typeof row.history === 'string' ? JSON.parse(row.history) : row.history;
          }
        } catch (e) {
          console.error(`Failed to parse history for row ${row.id}:`, e);
        }
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          photoUrl: row.photo_url,
          category: row.category,
          severity: row.severity,
          date: row.date,
          tomatoes: Number(row.tomatoes),
          facepalms: Number(row.facepalms),
          forgiven: Number(row.forgiven),
          comments: parsedComments,
          tags: parsedTags,
          history: parsedHistory
        };
      });
      dbSuccess = true;
    } catch (e) {
      console.error('Postgres list error, using local JSON fallback:', e);
    }
  }

  // Load from local storage backup file (always exists as safety net)
  const localData = loadLocalData();
  const localCards = localData.cards;

  let finalCards: ShameCard[] = [];

  if (dbSuccess) {
    // If database query succeeded, trust the database (Firestore/Postgres) as the single source of truth.
    // This prevents deleted cards from being resurrected from local cache/replicas.
    finalCards = dbCards;
  } else {
    // Fall back to local file backup if database is unreachable
    finalCards = localCards;
  }

  // Also write the fully synchronized list back to local FS so it is safely backed up
  saveLocalData(finalCards, localData.theme);

  return finalCards;
}

// Add card
export async function addCard(card: ShameCard): Promise<void> {
  if (await isCardDeleted(card.id)) {
    throw new Error(`CARD_DELETED: Card with ID ${card.id} has been deleted and cannot be resurrected.`);
  }

  let maxLimit = 100;
  try {
    const actTheme = await getActiveTheme();
    if (actTheme && typeof actTheme.maxReactionsLimit === 'number') {
      maxLimit = actTheme.maxReactionsLimit;
    }
  } catch (e) {
    console.warn('Failed to load dynamic limit for addCard:', e);
  }

  // Enforce Dynamic Max Limit or Fallback
  card.tomatoes = Math.min(maxLimit, Math.max(0, typeof card.tomatoes === 'number' ? card.tomatoes : 0));
  card.facepalms = Math.min(maxLimit, Math.max(0, typeof card.facepalms === 'number' ? card.facepalms : 0));
  card.forgiven = Math.min(maxLimit, Math.max(0, typeof card.forgiven === 'number' ? card.forgiven : 0));

  // 1. Write to Firestore
  if (db) {
    try {
      const docRef = doc(db, 'shame_cards', card.id);
      await setDoc(docRef, card);
    } catch (e) {
      console.error('Firestore write error in addCard:', e);
    }
  }

  // 2. Write to Postgres
  if (isPostgresConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO shame_cards (id, name, description, photo_url, category, severity, date, tomatoes, facepalms, forgiven, comments, tags, history)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE 
        SET name = EXCLUDED.name, description = EXCLUDED.description, photo_url = EXCLUDED.photo_url, 
            category = EXCLUDED.category, severity = EXCLUDED.severity, date = EXCLUDED.date, 
            tomatoes = EXCLUDED.tomatoes, facepalms = EXCLUDED.facepalms, forgiven = EXCLUDED.forgiven,
            comments = EXCLUDED.comments, tags = EXCLUDED.tags, history = EXCLUDED.history
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
        card.forgiven,
        JSON.stringify(card.comments || []),
        JSON.stringify(card.tags || []),
        JSON.stringify(card.history || [])
      ]);
    } catch (e) {
      console.error('Postgres write error in addCard:', e);
    }
  }

  // 3. Always write to Local File
  const data = loadLocalData();
  data.cards = data.cards.filter(c => c.id !== card.id);
  data.cards.unshift(card);
  saveLocalData(data.cards, data.theme);
}

// Update card
export async function updateCard(card: ShameCard): Promise<void> {
  if (await isCardDeleted(card.id)) {
    throw new Error(`CARD_DELETED: Card with ID ${card.id} has been deleted and cannot be updated.`);
  }

  let maxLimit = 100;
  try {
    const actTheme = await getActiveTheme();
    if (actTheme && typeof actTheme.maxReactionsLimit === 'number') {
      maxLimit = actTheme.maxReactionsLimit;
    }
  } catch (e) {
    console.warn('Failed to load dynamic limit for updateCard:', e);
  }

  // Enforce Dynamic Max Limit or Fallback
  card.tomatoes = Math.min(maxLimit, Math.max(0, typeof card.tomatoes === 'number' ? card.tomatoes : 0));
  card.facepalms = Math.min(maxLimit, Math.max(0, typeof card.facepalms === 'number' ? card.facepalms : 0));
  card.forgiven = Math.min(maxLimit, Math.max(0, typeof card.forgiven === 'number' ? card.forgiven : 0));

  // 1. Write to Firestore
  if (db) {
    try {
      const docRef = doc(db, 'shame_cards', card.id);
      await setDoc(docRef, card);
    } catch (e) {
      console.error('Firestore write error in updateCard:', e);
    }
  }

  // 2. Write to Postgres
  if (isPostgresConnected && pool) {
    try {
      await pool.query(`
        UPDATE shame_cards
        SET name = $2, description = $3, photo_url = $4, category = $5, severity = $6, date = $7, tomatoes = $8, facepalms = $9, forgiven = $10, comments = $11, tags = $12, history = $13
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
        card.forgiven,
        JSON.stringify(card.comments || []),
        JSON.stringify(card.tags || []),
        JSON.stringify(card.history || [])
      ]);
    } catch (e) {
      console.error('Postgres write error in updateCard:', e);
    }
  }

  // 3. Always write to Local File
  const data = loadLocalData();
  data.cards = data.cards.map(c => c.id === card.id ? card : c);
  saveLocalData(data.cards, data.theme);
}

// Delete card
export async function deleteCard(id: string): Promise<void> {
  // Track that this ID is deleted to prevent resurrecting/uploading from cached clients
  await trackDeletedCardId(id);

  // 1. Delete from Firestore
  if (db) {
    try {
      const docRef = doc(db, 'shame_cards', id);
      await deleteDoc(docRef);
    } catch (e) {
      console.error('Firestore delete error in deleteCard:', e);
    }
  }

  // 2. Delete from Postgres
  if (isPostgresConnected && pool) {
    try {
      await pool.query('DELETE FROM shame_cards WHERE id = $1', [id]);
    } catch (e) {
      console.error('Postgres delete error in deleteCard:', e);
    }
  }

  // 3. Always delete from Local File
  const data = loadLocalData();
  data.cards = data.cards.filter(c => c.id !== id);
  saveLocalData(data.cards, data.theme);
}

// Get Active Theme
export async function getActiveTheme(): Promise<ThemeSettings | null> {
  let dbTheme: ThemeSettings | null = null;
  let dbSuccess = false;

  if (db) {
    try {
      const docRef = doc(db, 'shame_theme', 'active_theme');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        dbTheme = docSnap.data() as ThemeSettings;
        dbSuccess = true;
      }
    } catch (e) {
      console.error('Firestore error in getActiveTheme:', e);
    }
  }

  if (!dbSuccess && isPostgresConnected && pool) {
    try {
      const res = await pool.query('SELECT settings FROM shame_theme WHERE id = $1', ['active_theme']);
      if (res.rows.length > 0) {
        dbTheme = res.rows[0].settings as ThemeSettings;
        dbSuccess = true;
      }
    } catch (e) {
      console.error('Postgres error in getActiveTheme:', e);
    }
  }

  const localData = loadLocalData();
  if (dbTheme) {
    if (JSON.stringify(localData.theme) !== JSON.stringify(dbTheme)) {
      saveLocalData(localData.cards, dbTheme);
    }
    return dbTheme;
  }

  return localData.theme;
}

// Save Theme
export async function saveActiveTheme(theme: ThemeSettings): Promise<void> {
  if (db) {
    try {
      const docRef = doc(db, 'shame_theme', 'active_theme');
      await setDoc(docRef, theme);
    } catch (e) {
      console.error('Firestore error in saveActiveTheme:', e);
    }
  }

  if (isPostgresConnected && pool) {
    try {
      await pool.query(`
        INSERT INTO shame_theme (id, settings)
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET settings = EXCLUDED.settings
      `, ['active_theme', JSON.stringify(theme)]);
    } catch (e) {
      console.error('Postgres error in saveActiveTheme:', e);
    }
  }

  const data = loadLocalData();
  data.theme = theme;
  saveLocalData(data.cards, data.theme);
}

// Authenticate / Register a user with a secure password
export async function authenticateUser(nickname: string, passwordPlain: string): Promise<{ success: boolean; isNewUser: boolean; message: string }> {
  const normNick = nickname.trim().toLowerCase();
  if (!normNick) {
    return { success: false, isNewUser: false, message: "Никнейм не может быть пустым" };
  }

  // 1. Попробуем найти в Firestore
  let foundUser: { nickname: string; passwordHash: string } | null = null;
  let dbSuccess = false;

  if (db) {
    try {
      const docRef = doc(db, 'shame_users', normNick);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        foundUser = docSnap.data() as { nickname: string; passwordHash: string };
      }
      dbSuccess = true;
    } catch (e) {
      console.error('Firestore get error in authenticateUser:', e);
    }
  }

  // 2. Иначе попробуем в Postgres
  if (!dbSuccess && isPostgresConnected && pool) {
    try {
      const res = await pool.query('SELECT password FROM shame_users WHERE nickname = $1', [normNick]);
      if (res.rows.length > 0) {
        foundUser = {
          nickname: normNick,
          passwordHash: res.rows[0].password
        };
      }
      dbSuccess = true;
    } catch (e) {
      console.error('Postgres error in authenticateUser:', e);
    }
  }

  // 3. Работа с локальным JSON резервного копирования
  const localData = loadLocalData() as any;
  if (!localData.users) {
    localData.users = [];
  }
  const localUser = localData.users.find((u: any) => u.nickname.toLowerCase() === normNick);

  if (!foundUser && localUser) {
    foundUser = localUser;
  }

  // Если пользователя не существует, это РЕГИСТРАЦИЯ
  if (!foundUser) {
    const passTrimmed = passwordPlain.trim();
    if (!passTrimmed) {
      return { 
        success: false, 
        isNewUser: true, 
        message: "Этот никнейм свободен! Пожалуйста, задайте для него пароль при регистрации." 
      };
    }

    const newUser = {
      nickname: normNick,
      passwordHash: passTrimmed
    };

    // Сохранить в Firestore
    if (db) {
      try {
        const docRef = doc(db, 'shame_users', normNick);
        await setDoc(docRef, newUser);
      } catch (e) {
        console.error('Firestore save error in authenticateUser:', e);
      }
    }

    // Сохранить в Postgres
    if (isPostgresConnected && pool) {
      try {
        await pool.query(`
          INSERT INTO shame_users (nickname, password)
          VALUES ($1, $2)
          ON CONFLICT (nickname) DO NOTHING
        `, [newUser.nickname, newUser.passwordHash]);
      } catch (e) {
        console.error('Postgres insert error in authenticateUser:', e);
      }
    }

    // Сохранить в локальный файл
    localData.users.push(newUser);
    saveLocalData(localData.cards, localData.theme, localData.users);

    return { 
      success: true, 
      isNewUser: true, 
      message: "Никнейм успешно зарегистрирован и закреплен за вами!" 
    };
  }

  // Если пользователь существует, проверяем пароль
  if (foundUser.passwordHash === passwordPlain.trim()) {
    // Синхронизируем локально если нужно
    if (!localUser) {
      localData.users.push(foundUser);
      saveLocalData(localData.cards, localData.theme, localData.users);
    }
    return { 
      success: true, 
      isNewUser: false, 
      message: "Вход успешно выполнен!" 
    };
  } else {
    return { 
      success: false, 
      isNewUser: false, 
      message: "Этот никнейм уже зарегистрирован. Пожалуйста, введите правильный пароль от вашего никнейма, чтобы войти!" 
    };
  }
}
