import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  Lock,
  Flame,
  Award,
  TrendingDown,
  Filter,
  CheckCircle,
  HelpCircle,
  Users,
  UtensilsCrossed,
  ShieldAlert,
  Frown
} from 'lucide-react';
import { ShameCard, ThemeSettings, PRESET_THEMES } from './types';
import { initialShameCards, SHAME_CATEGORIES } from './data/initialData';
import { ShameCardComponent } from './components/ShameCardComponent';
import { AdminPanelComponent } from './components/AdminPanelComponent';

export default function App() {
  // Theme State (loads initially from localStorage to avoid dark flicker, then updates from backend)
  const [theme, setTheme] = useState<ThemeSettings>(() => {
    const saved = localStorage.getItem('shame_active_theme');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.siteSubtitle === 'Архив забавных проступков и курьезных ошибок нашей команды') {
          parsed.siteSubtitle = 'by mad & terramata & социальное дно';
        }
        return parsed;
      } catch {}
    }
    return PRESET_THEMES.artistic;
  });

  // Cards State
  const [cards, setCards] = useState<ShameCard[]>(() => {
    const saved = localStorage.getItem('shame_cards_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {}
    }
    return initialShameCards;
  });

  // Navigation & Search State
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<ShameCard | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterSeverity, setFilterSeverity] = useState('All');
  const [sortBy, setSortBy] = useState<'tomatoes' | 'date_new' | 'date_old' | 'name'>('tomatoes');

  // Cooldown timer state (1 reaction/15m)
  const [cooldownEnd, setCooldownEnd] = useState<number>(() => {
    const saved = localStorage.getItem('shame_cooldown_end');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (parsed > Date.now()) {
        return parsed;
      }
    }
    return 0;
  });

  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((cooldownEnd - currentTime) / 1000));

  const hasUploadedLocalRef = useRef(false);

  // Define syncCards globally for App component so it can be called inside reaction and on rate limit failure
  const syncCards = () => {
    fetch('/api/cards')
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          const filtered = data;
          
          // If the server returns no cards, but we have some local cards saved in localStorage,
          // we automatically upload them to the server so they get backed up into the Firestore/Postgres DB!
          if (filtered.length === 0 && !hasUploadedLocalRef.current) {
            const localSaved = localStorage.getItem('shame_cards_data');
            if (localSaved) {
              try {
                const parsed = JSON.parse(localSaved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  console.log('Database is empty. Automatically backing up/uploading local cards to server...', parsed);
                  hasUploadedLocalRef.current = true;
                  // Send each card to the server
                  Promise.all(
                    parsed.map((card) =>
                      fetch('/api/cards', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(card),
                      })
                    )
                  )
                    .then(() => {
                      console.log('Successfully backed up local cards to Firebase database!');
                      syncCards(); // Refresh data from server
                    })
                    .catch((err) => console.error('Error recovering cards to database:', err));
                  return;
                }
              } catch (e) {
                console.error('Error parsing local cards for recovery:', e);
              }
            }
          }

          // Compare and only update state if actual reaction counts or length changed, prevents UI flicker
          setCards((prev) => {
            const prevJSON = JSON.stringify(prev);
            const filteredJSON = JSON.stringify(filtered);
            if (prevJSON !== filteredJSON) {
              localStorage.setItem('shame_cards_data', filteredJSON);
              return filtered;
            }
            return prev;
          });
        }
      })
      .catch((err) => {
        console.warn('API /api/cards sync loading error:', err);
      });
  };

  // Load data from DB on mount and keep sync
  useEffect(() => {
    fetch('/api/theme')
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => {
        if (data && data.id) {
          const updated = { ...data };
          if (updated.siteSubtitle === 'Архив забавных проступков и курьезных ошибок нашей команды') {
            updated.siteSubtitle = 'by mad & terramata & социальное дно';
          }
          setTheme(updated);
          localStorage.setItem('shame_active_theme', JSON.stringify(updated));
        } else {
          // Sync localStorage theme back to database if database is fresh/empty
          const saved = localStorage.getItem('shame_active_theme');
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              fetch('/api/theme', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(parsed),
              }).catch((err) => console.error('Error auto-syncing theme to DB', err));
            } catch {}
          }
        }
      })
      .catch((err) => {
        console.warn('API /api/theme loading error, keeping localStorage theme:', err);
      });

    // Initial fetch
    syncCards();

    // Set up 4-second polling interval
    const interval = setInterval(syncCards, 4000);
    return () => clearInterval(interval);
  }, []);

  // Theme custom save handler
  const handleUpdateTheme = (newTheme: ThemeSettings) => {
    setTheme(newTheme);
    localStorage.setItem('shame_active_theme', JSON.stringify(newTheme));
    fetch('/api/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTheme),
    }).catch((err) => console.error('Error saving theme', err));
  };

  // Reactions callback
  const handleReact = (id: string, type: 'tomatoes' | 'facepalms' | 'forgiven') => {
    const isAuthAdmin = localStorage.getItem('shame_admin_auth') === 'true';

    // Client-side block
    if (!isAuthAdmin) {
      const savedCooldown = localStorage.getItem('shame_cooldown_end');
      if (savedCooldown) {
        const cooldownTime = parseInt(savedCooldown, 10);
        if (cooldownTime > Date.now()) {
          // Locked, do not trigger
          return;
        }
      }

      // Start new cooldown (15 minutes)
      const newCooldown = Date.now() + 15 * 60 * 1000;
      setCooldownEnd(newCooldown);
      localStorage.setItem('shame_cooldown_end', newCooldown.toString());
    }

    setCards((prevCards) => {
      let updatedCard: ShameCard | null = null;
      const newCards = prevCards.map((card) => {
        if (card.id === id) {
          const updated = {
            ...card,
            [type]: Math.min(100, card[type] + 1),
          };
          updatedCard = updated;
          return updated;
        }
        return card;
      });

      if (updatedCard) {
        localStorage.setItem('shame_cards_data', JSON.stringify(newCards));

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          'X-Action-React': 'true'
        };

        if (isAuthAdmin) {
          headers['Authorization'] = '123dkdk';
        }

        fetch(`/api/cards/${id}`, {
          method: 'PUT',
          headers: headers,
          body: JSON.stringify(updatedCard),
        })
        .then(async (res) => {
          if (res.status === 429) {
            const data = await res.json();
            const retryAfterSec = data.retryAfter || (15 * 60);
            const serverCooldown = Date.now() + retryAfterSec * 1000;
            // Align client timer with server
            setCooldownEnd(serverCooldown);
            localStorage.setItem('shame_cooldown_end', serverCooldown.toString());
            // Sync with current database layout
            syncCards();
          } else if (!res.ok) {
            syncCards();
          }
        })
        .catch((err) => {
          console.error('Error updating reaction', err);
          syncCards();
        });
      }

      return newCards;
    });
  };

  // Add Card Callback (from Admin)
  const handleAddCard = (newCardData: Omit<ShameCard, 'id' | 'tomatoes' | 'facepalms' | 'forgiven'>) => {
    const newCard: ShameCard = {
      ...newCardData,
      id: Date.now().toString(),
      tomatoes: 0,
      facepalms: 0,
      forgiven: 0,
    };
    const updatedCards = [newCard, ...cards];
    setCards(updatedCards);
    localStorage.setItem('shame_cards_data', JSON.stringify(updatedCards));

    fetch('/api/cards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCard),
    }).catch((err) => console.error('Error adding card', err));
  };

  // Update Card Callback (from Admin)
  const handleUpdateCard = (updatedCard: ShameCard) => {
    const updatedCards = cards.map((c) => (c.id === updatedCard.id ? updatedCard : c));
    setCards(updatedCards);
    localStorage.setItem('shame_cards_data', JSON.stringify(updatedCards));

    fetch(`/api/cards/${updatedCard.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedCard),
    }).catch((err) => console.error('Error updating card', err));
  };

  // Custom Confirmation Dialog State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Delete Card Callback (from Admin)
  const handleDeleteCard = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'ИЗЪЯТИЕ С ДОСКИ ПОЗОРА',
      message: 'Вы действительно хотите изъять этого фигуранта с доски позора навсегда?',
      onConfirm: () => {
        const updatedCards = cards.filter((c) => c.id !== id);
        setCards(updatedCards);
        localStorage.setItem('shame_cards_data', JSON.stringify(updatedCards));

        if (editingCard?.id === id) {
          setEditingCard(null);
        }

        fetch(`/api/cards/${id}`, {
          method: 'DELETE',
        }).catch((err) => console.error('Error deleting card', err));

        setConfirmModal(null);
      }
    });
  };

  // Reset Data to Default
  const handleResetData = () => {
    setConfirmModal({
      isOpen: true,
      title: 'СБРОС ВСЕХ ДАННЫХ',
      message: 'Вы уверены, что хотите сбросить изменённый дизайн Стенда и очистить все записи до первоначального вида?',
      onConfirm: () => {
        const defaultTheme = PRESET_THEMES.artistic;
        setTheme(defaultTheme);
        setCards(initialShameCards);
        setEditingCard(null);
        localStorage.setItem('shame_active_theme', JSON.stringify(defaultTheme));
        localStorage.setItem('shame_cards_data', JSON.stringify(initialShameCards));

        // Reset on Server
        fetch('/api/theme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(defaultTheme),
        }).catch((err) => console.error('Error resetting theme in DB', err));

        fetch('/api/cards')
          .then((res) => res.json())
          .then(async (currentCards) => {
            if (Array.isArray(currentCards)) {
              for (const c of currentCards) {
                await fetch(`/api/cards/${c.id}`, { method: 'DELETE' }).catch(() => {});
              }
            }
            for (const card of initialShameCards) {
              await fetch('/api/cards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(card),
              }).catch(() => {});
            }
          })
          .catch((err) => console.error('Error resetting cards in database', err));

        setConfirmModal(null);
      }
    });
  };

  // Calculate stats to display on index dashboard
  const totalSinners = cards.length;
  const totalTomatoes = cards.reduce((sum, c) => sum + c.tomatoes, 0);
  const totalFacepalms = cards.reduce((sum, c) => sum + c.facepalms, 0);

  // Find the single absolute tomato target user ("Король позора" / King of Shame)
  const sortedByNotoriety = [...cards].sort((a, b) => b.tomatoes - a.tomatoes);
  const kingOfShame = sortedByNotoriety.length > 0 && sortedByNotoriety[0].tomatoes > 0 ? sortedByNotoriety[0] : null;

  // Get active font class name
  const getFontFamilyClass = (f: string) => {
    switch (f) {
      case 'mono':
        return 'font-mono';
      case 'serif':
        return "font-['Playfair_Display',_Georgia,_serif]";
      case 'grotesk':
        return "font-['Space_Grotesk',_sans-serif]";
      default:
        return 'font-sans';
    }
  };

  // Grid columns class based on theme configuration
  const getGridColumnsClass = (cols: string) => {
    switch (cols) {
      case '2':
        return 'grid-cols-1 md:grid-cols-2';
      case '4':
        return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
      default:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    }
  };

  // Filter & Search Logic
  const filteredCards = cards
    .filter((card) => {
      const matchSearch =
        card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        card.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchCategory = true;
      const matchSeverity = filterSeverity === 'All' || card.severity === filterSeverity;

      return matchSearch && matchCategory && matchSeverity;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'date_old':
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case 'date_new':
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case 'name':
          return a.name.localeCompare(b.name);
        default:
          return b.tomatoes - a.tomatoes; // tomatoes descending default
      }
    });

  return (
    <div
      style={{
        backgroundColor: theme.backgroundColor,
        color: theme.textColor,
        minHeight: '100vh',
      }}
      className={`relative min-h-screen transition-colors duration-500 pb-16 flex flex-col ${getFontFamilyClass(
        theme.fontFamily
      )}`}
      id="root-shame-board-app"
    >
      {/* Visual noise / overlay animation scanlines */}
      {theme.showBackgroundNoise && <div className="fixed inset-0 crt-scars pointer-events-none z-10 opacity-30" />}

      {/* Decorative colored glow ball */}
      <div
        className="absolute top-0 left-1/4 w-[30vw] h-[30vw] rounded-full blur-[120px] pointer-events-none opacity-20 transition-all duration-700"
        style={{ backgroundColor: theme.accentColor }}
      />
      <div
        className="absolute bottom-1/4 right-1/4 w-[35vw] h-[35vw] rounded-full blur-[140px] pointer-events-none opacity-10 transition-all duration-700"
        style={{ backgroundColor: theme.accentColor }}
      />

      {/* HEADER CONTROLS BAR (Admin Entry) */}
      <header className="border-b border-zinc-800/40 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-3.5 bg-black/25 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-3.5 h-3.5 rounded-full inline-block animate-ping duration-1000"
            style={{ backgroundColor: theme.accentColor }}
          />
          <span className="text-xs font-semibold tracking-widest uppercase opacity-75 font-mono">
            BOARD OF SHAME // {theme.id.toUpperCase()}
          </span>
        </div>

        <button
          onClick={() => setIsAdminOpen(true)}
          style={{
            borderColor: `${theme.accentColor}40`,
            boxShadow: `0 0 10px ${theme.accentColor}10`,
          }}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-full border bg-zinc-950/60 hover:bg-zinc-900 transition-all cursor-pointer text-white hover:scale-105 active:scale-95 select-none group"
          id="trigger-admin-panel"
        >
          <Lock size={12} className="group-hover:rotate-12 transition-transform duration-300 text-red-500" />
          <span>Админ-Панель</span>
        </button>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 flex-grow w-full z-20">
        {/* BANNER ZONE / TITLE */}
        <div className="pb-8 mb-10 border-b border-zinc-800/20 flex flex-col md:flex-row justify-between items-baseline gap-6 w-full text-left" id="banner-zone-title-container">
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="max-w-2xl"
          >
            <h1
              className="text-5xl sm:text-7xl font-black tracking-tighter leading-none uppercase"
              style={{
                textShadow: theme.borderStyle === 'neon' ? `0 0 25px ${theme.accentColor}60` : 'none',
              }}
              id="main-banner-title"
            >
              {(() => {
                const titleStr = theme.siteTitle || 'Доска Позора';
                const words = titleStr.split(' ');
                if (words.length > 1) {
                  return (
                    <>
                      {words[0]}
                      <br />
                      <span style={{ color: theme.accentColor }}>{words.slice(1).join(' ')}</span>
                    </>
                  );
                }
                return <span style={{ color: theme.accentColor }}>{titleStr}</span>;
              })()}
            </h1>
            <p 
              style={{ color: theme.textSecondaryColor }} 
              className="mt-4 text-xs font-mono tracking-widest uppercase opacity-70" 
              id="main-banner-subtitle"
            >
              {theme.siteSubtitle || 'Реестр весёлых косяков и факапов нашей команды'}
            </p>
          </motion.div>

          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-right flex flex-col items-start md:items-end gap-2 self-end"
          >
            <div
              style={{ borderColor: theme.accentColor, color: theme.accentColor }}
              className="inline-block px-3 py-1 border text-[10px] font-bold tracking-[0.2em] uppercase select-none"
            >
              High Priority Registry
            </div>
            <div className="text-[10px] font-mono opacity-40">
              REGISTRY SHAME // EST. 2026
            </div>
          </motion.div>
        </div>

        {/* METRICS WIDGETS SECTION (BENTO GRID STYLE) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {/* Card 1: Total Sinners */}
          <div
            style={{ backgroundColor: theme.cardColor, borderRadius: theme.borderRadius }}
            className="p-5 flex items-center justify-between border border-zinc-800/50 shadow-md backdrop-blur-sm"
          >
            <div className="space-y-1">
              <span className="text-xs text-zinc-400 font-semibold block uppercase tracking-wider font-mono">Фигуранты дела</span>
              <span className="text-3xl font-extrabold block">{totalSinners} чел.</span>
            </div>
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl">
              <Users size={20} />
            </div>
          </div>

          {/* Card 2: Total Tomatoes */}
          <div
            style={{ backgroundColor: theme.cardColor, borderRadius: theme.borderRadius }}
            className="p-5 flex items-center justify-between border border-zinc-800/50 shadow-md backdrop-blur-sm"
          >
            <div className="space-y-1">
              <span className="text-xs text-zinc-400 font-semibold block uppercase tracking-wider font-mono">Брошено томатов</span>
              <span className="text-3xl font-extrabold text-red-500 block">{totalTomatoes} шт.</span>
            </div>
            <div className="p-3 bg-red-500/10 text-red-500 rounded-xl">
              <span className="text-xl font-bold select-none">🍅</span>
            </div>
          </div>

          {/* Card 3: Total Facepalms */}
          <div
            style={{ backgroundColor: theme.cardColor, borderRadius: theme.borderRadius }}
            className="p-5 flex items-center justify-between border border-zinc-800/50 shadow-md backdrop-blur-sm"
          >
            <div className="space-y-1">
              <span className="text-xs text-zinc-400 font-semibold block uppercase tracking-wider font-mono">Всего фейспалмов</span>
              <span className="text-3xl font-extrabold text-amber-500 block">{totalFacepalms} шт.</span>
            </div>
            <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl animate-pulse">
              <Frown size={18} />
            </div>
          </div>

          {/* Card 4: King of Shame (Active target) */}
          <div
            style={{ backgroundColor: theme.cardColor, borderRadius: theme.borderRadius }}
            className="p-5 flex items-center justify-between border border-zinc-800/50 shadow-md backdrop-blur-sm min-w-0"
          >
            <div className="space-y-1 min-w-0 flex-grow">
              <span className="text-xs text-zinc-400 font-semibold block uppercase tracking-wider font-mono flex items-center gap-1">
                <Flame size={12} className="text-red-500 fill-red-500/20" /> Царь Позора
              </span>
              <span className="text-base font-bold text-emerald-400 truncate block">
                {kingOfShame ? kingOfShame.name : 'Нимб безгрешности'}
              </span>
              <span className="text-[10px] text-zinc-500 block font-mono truncate">
                {kingOfShame ? `${kingOfShame.tomatoes} томатов на лице` : 'Никто ещё не косячил'}
              </span>
            </div>
            <div className="p-2.5 bg-yellow-500/10 text-yellow-500 rounded-xl flex-shrink-0 flex items-center justify-center">
              <Award size={20} className={kingOfShame ? "animate-bounce" : "opacity-45"} />
            </div>
          </div>
        </div>

        {/* CONTROLS AREA (Search, filter, sorting) */}
        <div
          style={{ backgroundColor: theme.cardColor, borderRadius: theme.borderRadius }}
          className="p-4 mb-8 border border-zinc-800/50 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-xs select-none"
          id="controls-deck"
        >
          {/* SEARCH BAR INPUT */}
          <div className="relative flex-grow max-w-full md:max-w-md">
            <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по имени фигуранта или деталям греха..."
              className="w-full bg-black/30 border border-zinc-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 rounded-xl py-2 pl-9 pr-4 text-xs text-white"
              id="shame-search-input"
            />
          </div>

          {/* FILTERS PANEL */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Severity Filter */}
            <div className="flex items-center gap-1.5 bg-black/20 px-2.5 py-1.5 rounded-lg border border-zinc-800">
              <ShieldAlert size={12} className="text-zinc-500" />
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="bg-transparent text-xs text-zinc-300 focus:outline-none font-sans cursor-pointer"
                id="filter-severity-select"
              >
                <option value="All" className="bg-zinc-950">Тяжесть: Любая</option>
                <option value="minor" className="bg-zinc-950">👀 Легкий затуп</option>
                <option value="moderate" className="bg-zinc-950">⚡ Серьезный косяк</option>
                <option value="epic" className="bg-zinc-950">🔥 Эпик факап</option>
              </select>
            </div>

            {/* Sorting Selection */}
            <div className="flex items-center gap-1.5 bg-black/20 px-2.5 py-1.5 rounded-lg border border-zinc-800">
              <TrendingDown size={12} className="text-zinc-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-xs text-zinc-300 focus:outline-none font-sans cursor-pointer"
                id="sorting-select"
              >
                <option value="tomatoes" className="bg-zinc-950">Сначала лидеры позора (🍅)</option>
                <option value="date_new" className="bg-zinc-950">Сначала новенькие (Дата)</option>
                <option value="date_old" className="bg-zinc-950">Сначала старые грехи</option>
                <option value="name" className="bg-zinc-950">По имени (А-Я)</option>
              </select>
            </div>
          </div>
        </div>

        {/* CARDS FEED / LISTING */}
        <AnimatePresence mode="popLayout">
          {filteredCards.length === 0 ? (
            /* EMPTY NOTIFICATION */
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-20 px-4 max-w-md mx-auto"
              id="empty-shame-board"
            >
              <div className="text-5xl select-none mb-4">👼</div>
              <h3 className="text-lg font-bold mb-1">Ни одной провинности не зафиксировано</h3>
              <p style={{ color: theme.textSecondaryColor }} className="text-xs">
                Похоже, либо все стали безгрешными святыми, либо ваш фильтр поиска оказался слишком суров! Попробуйте сбросить настройки фильтрации.
              </p>
            </motion.div>
          ) : (
            /* SHAME GRID */
            <motion.div
              layout="position"
              className={`grid gap-6 ${getGridColumnsClass(theme.gridColumns)}`}
              id="shame-board-grid"
            >
              {filteredCards.map((card, index) => (
                <ShameCardComponent
                  key={card.id}
                  card={card}
                  theme={theme}
                  isAdmin={isAdminOpen} // allow instant in-card adjustments if admin is unlocked!
                  onReact={handleReact}
                  onEdit={(item) => {
                    setEditingCard(item);
                    setIsAdminOpen(true);
                  }}
                  onDelete={handleDeleteCard}
                  index={index}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* DISCLOSURE CARD (FOOTER NOTE) */}
      <footer 
        style={{ backgroundColor: theme.accentColor }} 
        className="text-black min-h-12 py-3.5 flex flex-col md:flex-row items-center px-6 md:px-8 justify-between mt-16 z-25 gap-2 select-none"
      >
        <div className="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-[10px] font-bold uppercase tracking-[0.1em] text-center md:text-left">
          <span>© 2026 CONNECTED TO GLOBAL.REGISTRY.SHAME</span>
          <span className="hidden md:inline opacity-30">|</span>
          <button
            onClick={() => setIsAdminOpen(true)}
            className="hover:underline cursor-pointer font-black text-black tracking-widest text-[10px]"
          >
            ВХОД ДЛЯ АДМИНОВ
          </button>
        </div>
        <span className="text-[10px] font-mono font-bold tracking-wider text-center">
          [ STATUS: ENFORCING SOCIAL ORDER ]
        </span>
      </footer>

      {/* ADMIN CONTROL PANEL MODAL (IF TRIGGERED) */}
      <AnimatePresence>
        {isAdminOpen && (
          <AdminPanelComponent
            theme={theme}
            cards={cards}
            onUpdateTheme={handleUpdateTheme}
            onAddCard={handleAddCard}
            onUpdateCard={handleUpdateCard}
            onDeleteCard={handleDeleteCard}
            onResetData={handleResetData}
            onClose={() => {
              setIsAdminOpen(false);
              setEditingCard(null);
            }}
            editingCard={editingCard}
            setEditingCard={setEditingCard}
          />
        )}
      </AnimatePresence>

      {/* CUSTOM CONFIRMATION MODAL */}
      <AnimatePresence>
        {confirmModal && confirmModal.isOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmModal(null)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md"
            />
            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-sm bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 shadow-2xl z-10 text-white font-sans"
            >
              <h3 className="text-sm font-black tracking-widest uppercase text-red-500 mb-2 font-mono">
                {confirmModal.title}
              </h3>
              <p className="text-xs text-zinc-400 tracking-wide leading-relaxed mb-6 font-sans">
                {confirmModal.message}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-xs font-bold text-zinc-300 cursor-pointer border border-zinc-800 transition-colors"
                >
                  Отмена
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-700 active:translate-y-px text-xs font-bold text-white shadow-lg cursor-pointer transition-colors"
                >
                  Подтвердить
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
