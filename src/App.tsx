import React, { useState, useEffect, useRef } from 'react';
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
  Frown,
  Volume2,
  VolumeX,
  User,
  Music,
  Play,
  Pause,
  Volume1,
  Settings,
  Check,
  X,
  Link,
  Plus,
  Trash2,
  ExternalLink
} from 'lucide-react';
import { ShameCard, ThemeSettings, PRESET_THEMES, BGMTrack } from './types';
import { initialShameCards, SHAME_CATEGORIES } from './data/initialData';
import { ShameCardComponent } from './components/ShameCardComponent';
import { AdminPanelComponent } from './components/AdminPanelComponent';
import { getMuted, setMuted as saveMuted } from './utils/audioEffects';
import {
  initBGM,
  toggleBGM,
  setBGMVolume,
  getBGMVolume,
  isBGMPlayingState,
  syncBGMMuteState,
  getCustomBGMTracks,
  saveCustomBGMTracks,
  getActiveTrackId,
  setActiveTrackId,
  SHAME_DEFAULT_TRACKS
} from './utils/bgMusic';

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

  // User Nickname State (prompted before entering site, allows terramata/mad admin status)
  const [userNickname, setUserNickname] = useState<string>(() => {
    return localStorage.getItem('shame_user_nickname') || '';
  });
  const [showNicknameModal, setShowNicknameModal] = useState<boolean>(() => {
    return !localStorage.getItem('shame_user_nickname');
  });
  const [loginError, setLoginError] = useState<string>('');
  const [typedNick, setTypedNick] = useState<string>(() => {
    return localStorage.getItem('shame_user_nickname') || '';
  });
  const [typedPass, setTypedPass] = useState<string>('');

  // Navigation & Search State
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<ShameCard | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterSeverity, setFilterSeverity] = useState('All');
  const [sortBy, setSortBy] = useState<'tomatoes' | 'date_new' | 'date_old' | 'name'>('tomatoes');
  const [soundsMuted, setSoundsMuted] = useState(getMuted);

  // Background Music State
  const [isBGMPlaying, setIsBGMPlaying] = useState(isBGMPlayingState);
  const [bgmVol, setBgmVol] = useState(() => getBGMVolume() * 100);
  const [hasCustomMusic, setHasCustomMusic] = useState(false);
  const [customTracks, setCustomTracks] = useState<BGMTrack[]>(() => getCustomBGMTracks());
  const [activeTrackId, setActiveTrackIdState] = useState(() => getActiveTrackId());
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);

  const isSpecialAdmin = ['terramata', 'mad'].includes((userNickname || '').toLowerCase().trim());
  const isAuthAdmin = isSpecialAdmin || localStorage.getItem('shame_admin_auth') === 'true';

  useEffect(() => {
    initBGM();

    // Verify if custom file is available
    fetch('/music.mp3', { method: 'HEAD' })
      .then(res => setHasCustomMusic(res.ok))
      .catch(() => setHasCustomMusic(false));
  }, []);

  const toggleMute = () => {
    const newMuted = !soundsMuted;
    saveMuted(newMuted);
    setSoundsMuted(newMuted);
    syncBGMMuteState();
  };

  const handleToggleBGM = () => {
    toggleBGM();
    setIsBGMPlaying(isBGMPlayingState());
  };

  const handleBGMVolumeChange = (v: number) => {
    setBGMVolume(v / 100);
    setBgmVol(v);
  };

  const handleSelectTrack = (trackId: string) => {
    setActiveTrackId(trackId);
    setActiveTrackIdState(trackId);
    setIsBGMPlaying(isBGMPlayingState());
  };

  const handleAddTrack = (name: string, url: string) => {
    if (!url.trim()) return;
    const cleanUrl = url.trim();
    const trackName = name.trim() || `Трек ${customTracks.length + 1}`;
    const newTrack: BGMTrack = {
      id: `track_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`,
      name: trackName,
      url: cleanUrl
    };
    const updated = [...customTracks, newTrack];
    saveCustomBGMTracks(updated);
    setCustomTracks(updated);

    // Save to server theme settings
    const updatedTheme = { ...theme, bgmPlaylist: updated };
    handleUpdateTheme(updatedTheme);

    handleSelectTrack(newTrack.id);
  };

  const handleDeleteTrack = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customTracks.filter(t => t.id !== id);
    saveCustomBGMTracks(updated);
    setCustomTracks(updated);

    // Save to server theme settings
    const updatedTheme = { ...theme, bgmPlaylist: updated };
    handleUpdateTheme(updatedTheme);

    if (activeTrackId === id) {
      handleSelectTrack('procedural_synth');
    }
  };

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
          
          if (updated.bgmPlaylist) {
            import('./utils/bgMusic').then(({ saveCustomBGMTracks }) => {
              saveCustomBGMTracks(updated.bgmPlaylist || []);
            });
            setCustomTracks(updated.bgmPlaylist);
          }
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

  // Synchronize document body background with the active theme background
  useEffect(() => {
    if (theme && theme.backgroundColor) {
      document.body.style.backgroundColor = theme.backgroundColor;
    }
  }, [theme]);

  // Lock scrolling of the background body when the Admin Panel or modals are active
  useEffect(() => {
    if (isAdminOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isAdminOpen]);

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
    const isSpecialAdmin = ['terramata', 'mad'].includes((userNickname || '').toLowerCase().trim());
    const isAuthAdmin = isSpecialAdmin || localStorage.getItem('shame_admin_auth') === 'true';

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

      // Start new cooldown using theme parameters
      const cooldownSecs = theme.reactionCooldown ?? 30;
      const newCooldown = Date.now() + cooldownSecs * 1000;
      setCooldownEnd(newCooldown);
      localStorage.setItem('shame_cooldown_end', newCooldown.toString());
    }

    setCards((prevCards) => {
      let updatedCard: ShameCard | null = null;
      const maxLimit = theme.maxReactionsLimit ?? 100;
      const newCards = prevCards.map((card) => {
        if (card.id === id) {
          const updated = {
            ...card,
            [type]: Math.min(maxLimit, card[type] + 1),
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
            const retryAfterSec = data.retryAfter || 30;
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

  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Save/Update user nickname and verify password on backend
  const handleSaveNickname = async (nick: string, pass: string) => {
    const cleanedNick = nick.trim();
    if (!cleanedNick) return;

    setIsLoggingIn(true);
    setLoginError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: cleanedNick, password: pass }),
      });
      const data = await response.json();

      if (data.success) {
        localStorage.setItem('shame_user_nickname', cleanedNick);
        setUserNickname(cleanedNick);
        
        // If they logged in as terramata, mad, or typed 123dkdk as password, let them be admin on client-side
        const isSpecial = ['terramata', 'mad'].includes(cleanedNick.toLowerCase());
        if (isSpecial || pass.trim() === '123dkdk') {
          localStorage.setItem('shame_admin_auth', 'true');
        } else {
          localStorage.removeItem('shame_admin_auth');
        }

        setShowNicknameModal(false);
        setTypedPass('');
      } else {
        setLoginError(data.message || 'Ошибка авторизации. Проверьте введенные данные.');
      }
    } catch (err) {
      console.error('Login communication error:', err);
      setLoginError('Не удалось соединиться с сервером. Попробуйте войти позже.');
    } finally {
      setIsLoggingIn(false);
    }
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

  const handleClearAllComments = () => {
    setConfirmModal({
      isOpen: true,
      title: 'ОЧИСТКА ВСЕХ КОММЕНТАРИЕВ',
      message: 'Вы уверены, что хотите удалить абсолютно ВСЕ комментарии изо всех карточек нарушителей?',
      onConfirm: async () => {
        const updatedCards = cards.map((c) => ({
          ...c,
          comments: [],
        }));
        setCards(updatedCards);
        localStorage.setItem('shame_cards_data', JSON.stringify(updatedCards));

        // Submit to Backend
        try {
          await Promise.all(
            updatedCards.map((c) =>
              fetch(`/api/cards/${c.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(c),
              })
            )
          );
        } catch (err) {
          console.error('Error clearing comments on server:', err);
        }

        setConfirmModal(null);
      },
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

        <div className="flex items-center gap-2">
          {/* Sound Effects Toggle */}
          <button
            onClick={toggleMute}
            style={{
              borderColor: `${theme.accentColor}30`,
            }}
            className="flex items-center justify-center p-2 rounded-full border bg-zinc-950/60 hover:bg-zinc-900 text-zinc-400 hover:text-white hover:scale-105 active:scale-95 transition-all cursor-pointer select-none"
            title={soundsMuted ? "Включить звуковые эффекты" : "Выключить звуковые эффекты"}
            id="sound-mute-toggle"
          >
            {soundsMuted ? (
              <VolumeX size={14} className="text-zinc-500" />
            ) : (
              <Volume2 size={14} className="text-red-500" />
            )}
          </button>

          {userNickname && (
            <div 
              style={{ borderColor: `${theme.accentColor}25` }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full border bg-zinc-950/45 shrink-0"
              id="header-user-badge"
            >
              <User size={12} className="text-zinc-400" />
              <span className="text-zinc-400 hidden xs:inline">Ник:</span>
              <span className="font-bold text-zinc-100 flex items-center max-w-[100px] truncate">
                {userNickname}
                {['terramata', 'mad'].includes(userNickname.toLowerCase().trim()) && (
                  <span className="ml-1 text-[8px] tracking-wider font-extrabold bg-red-650/20 text-red-450 border border-red-500/20 px-1 py-0.5 rounded uppercase animate-pulse">ADMIN</span>
                )}
              </span>
              <button
                onClick={() => setShowNicknameModal(true)}
                className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors ml-1 font-semibold cursor-pointer border-none bg-transparent"
                title="Сменить никнейм"
              >
                (Сменить)
              </button>
            </div>
          )}

          <button
            onClick={() => setIsAdminOpen(true)}
            style={{
              borderColor: `${theme.accentColor}40`,
              boxShadow: `0 0 10px ${theme.accentColor}10`,
            }}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-full border bg-zinc-950/60 hover:bg-zinc-900 transition-all cursor-pointer text-white hover:scale-105 active:scale-95 select-none group shrink-0"
            id="trigger-admin-panel"
          >
            <Lock size={12} className="group-hover:rotate-12 transition-transform duration-300 text-red-500" />
            <span>Админ-Панель</span>
          </button>
        </div>
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

        {/* Real-time Cooldown Alert Banner */}
        {secondsLeft > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="mb-8 p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-xs shadow-lg relative overflow-hidden"
            style={{
              backgroundColor: `${theme.cardColor}c8`,
              borderColor: `${theme.accentColor}40`,
              color: theme.textColor,
            }}
          >
            <div className="flex items-center gap-3 z-10">
              <span className="relative flex h-3.5 w-3.5 select-none">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-500"></span>
              </span>
              <div>
                <span className="font-bold text-red-500 uppercase tracking-wider block sm:inline">Режим охлаждения:</span>
                <span className="ml-0 sm:ml-2 text-zinc-300">Вы сможете оставить следующую реакцию через <strong className="text-white text-sm bg-black/40 px-2 py-0.5 rounded border border-zinc-800 font-mono tracking-wider ml-1">{Math.floor(secondsLeft / 60)}:{(secondsLeft % 60).toString().padStart(2, '0')}</strong></span>
              </div>
            </div>
            <div className="flex items-center gap-3 z-10 self-end sm:self-auto">
              {theme.reactionCooldown !== 0 ? (
                <span className="text-[10px] text-zinc-500 hidden md:inline">Лимит: 1 реакция в {theme.reactionCooldown ?? 30} сек.</span>
              ) : (
                <span className="text-[10px] text-zinc-500 hidden md:inline">Ограничения по кулдауну отключены</span>
              )}
              <button
                onClick={() => {
                  setCooldownEnd(0);
                  localStorage.removeItem('shame_cooldown_end');
                }}
                className="px-3 py-1.5 bg-red-650 hover:bg-red-700 active:translate-y-px text-white font-bold rounded-lg transition-all cursor-pointer text-[10px] font-sans border border-red-500/20 shadow-md"
              >
                Сбросить кулдаун (Тест)
              </button>
            </div>
          </motion.div>
        )}

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
                  onUpdateCard={handleUpdateCard}
                  index={index}
                  cooldownSecondsLeft={secondsLeft}
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
            onClearAllComments={handleClearAllComments}
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

      {/* USER NICKNAME INITIAL GATE MODAL */}
      <AnimatePresence>
        {showNicknameModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            {/* Dark Backdrop with intense blur */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (userNickname) setShowNicknameModal(false);
              }}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl"
            />

            {/* Modal Box */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: 'spring', damping: 20, stiffness: 100 }}
              className="relative w-full max-w-sm bg-zinc-90 w-full bg-zinc-900 border border-zinc-800/80 rounded-2xl p-6 sm:p-8 shadow-2xl z-10 text-white font-sans overflow-hidden"
              id="nickname-prompt-container"
            >
              {/* Decorative accent board */}
              <div 
                className="absolute top-0 left-0 right-0 h-1.5"
                style={{ backgroundColor: theme.accentColor }}
              />

              <div className="text-center mb-6">
                <div 
                  style={{ backgroundColor: `${theme.accentColor}12`, borderColor: `${theme.accentColor}30` }}
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 border text-2xl"
                >
                  🎭
                </div>
                <h2 className="text-xl font-black tracking-tight uppercase">Кто пришел на Стенд?</h2>
                <p className="text-xs text-zinc-400 mt-2 font-mono leading-relaxed">
                  Укажите ваш никнейм для входа. Он будет отображаться под комментариями.
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (typedNick.trim()) {
                    handleSaveNickname(typedNick, typedPass);
                  }
                }}
                className="space-y-4"
              >
                <div className="space-y-3">
                  <div>
                    <label className="block text-[10px] text-zinc-500 font-mono uppercase font-black mb-1 text-left">Ваш никнейм</label>
                    <input
                      name="nickname"
                      type="text"
                      value={typedNick}
                      onChange={(e) => {
                        setTypedNick(e.target.value);
                        setLoginError('');
                      }}
                      required
                      disabled={isLoggingIn}
                      placeholder="Придумайте или введите никнейм..."
                      autoComplete="off"
                      maxLength={20}
                      className="w-full p-2.5 font-bold text-center bg-zinc-950 border border-zinc-800 rounded-xl focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-white text-base font-mono disabled:opacity-50"
                      autoFocus
                      id="nickname-prompt-input"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] text-zinc-500 font-mono uppercase font-black mb-1 text-left">
                      Личный пароль доступа
                    </label>
                    <input
                      name="password"
                      type="password"
                      value={typedPass}
                      onChange={(e) => {
                        setTypedPass(e.target.value);
                        setLoginError('');
                      }}
                      required
                      disabled={isLoggingIn}
                      placeholder="Пароль (новый или существующий)"
                      autoComplete="current-password"
                      className="w-full p-2.5 text-center bg-zinc-950 border border-zinc-800 rounded-xl focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-white text-sm font-mono disabled:opacity-50"
                      id="nickname-password-input"
                    />
                  </div>

                  {loginError && (
                    <div className="bg-red-950/40 border border-red-900/35 text-red-500 px-3 py-2.5 rounded-xl text-[11px] text-center font-mono whitespace-pre-line leading-relaxed">
                      ⚠️ {loginError}
                    </div>
                  )}
                  
                  {/* Informational hints */}
                  <div className="mt-4 bg-black/40 border border-zinc-850 p-3 rounded-lg text-[10px] text-zinc-400 space-y-1.5 font-mono leading-relaxed">
                    <div>• <strong className="text-red-400">Регистрация</strong>: Если никнейм свободен, введенный пароль будет надежно закреплен за ним. Никто другой не сможет войти под вашим именем.</div>
                    <div>• <strong className="text-red-400">Вход</strong>: Если этот никнейм вы уже регистрировали ранее, введите ваш пароль для входа.</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  {userNickname && (
                    <button
                      type="button"
                      disabled={isLoggingIn}
                      onClick={() => setShowNicknameModal(false)}
                      className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-300 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      Назад
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="flex-1 py-2.5 rounded-xl bg-red-650 hover:bg-red-700 text-xs font-bold text-white shadow-lg cursor-pointer transition-colors uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-1"
                    id="nickname-submit-button"
                  >
                    {isLoggingIn ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        Проверка...
                      </>
                    ) : (
                      'Войти'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BACKGROUND MUSIC COMPACT PLAYER FIXED CORNER PILL */}
      <div className="fixed bottom-6 right-6 z-40 select-none">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ borderColor: `${theme.accentColor}25` }}
          className="bg-zinc-950/95 border backdrop-blur-md rounded-2xl p-4 shadow-2xl flex flex-col gap-3 w-72 text-zinc-300 md:hover:border-zinc-700/60 transition-all duration-300"
          id="bgm-floating-compact-player"
        >
          {/* Main Player Row */}
          <div className="flex items-center gap-3">
            {/* Animated Equalizer Bars Node */}
            <div 
              onClick={handleToggleBGM}
              style={{ backgroundColor: `${theme.accentColor}10` }}
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 cursor-pointer border border-zinc-800/40 hover:scale-105 active:scale-95 transition-all text-xs"
              title={isBGMPlaying ? "Пауза" : "Играть фоновую музыку"}
            >
              {isBGMPlaying ? (
                <div className="flex items-end gap-0.5 h-3">
                  <span className="w-[2px] bg-red-500 animate-bounce" style={{ animationDuration: '0.8s', animationDelay: '0.1s', maxHeight: '12px' }} />
                  <span className="w-[2px] bg-red-500 animate-bounce" style={{ animationDuration: '1.2s', animationDelay: '0.3s', maxHeight: '12px' }} />
                  <span className="w-[2px] bg-red-500 animate-bounce" style={{ animationDuration: '0.9s', animationDelay: '0.0s', maxHeight: '12px' }} />
                  <span className="w-[2px] bg-red-500 animate-bounce" style={{ animationDuration: '1.1s', animationDelay: '0.5s', maxHeight: '12px' }} />
                </div>
              ) : (
                <Music size={14} className="text-zinc-500 animate-pulse" />
              )}
            </div>

            {/* Player details */}
            <div className="flex-1 min-w-0 flex flex-col text-left">
              <div className="text-[9px] uppercase tracking-wider font-extrabold opacity-70 font-mono flex items-center justify-between w-full">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: isBGMPlaying ? '#22c55e' : '#e4e4e7' }} />
                  Фоновый звук
                </span>
                <button 
                  onClick={() => setIsPlaylistOpen(!isPlaylistOpen)} 
                  className={`text-zinc-500 hover:text-white transition-colors bg-transparent border-none p-0 cursor-pointer flex items-center gap-1 ${isPlaylistOpen ? 'text-red-400' : ''}`}
                  title="Плейлист и свои треки"
                >
                  <Settings size={12} className={isPlaylistOpen ? 'animate-spin' : ''} />
                  <span className="text-[8px] font-sans font-normal underline">Плейлист</span>
                </button>
              </div>

              {/* Get active track name dynamically */}
              <span className="text-[10px] font-bold text-zinc-100 truncate mt-0.5" id="bgm-player-title">
                {isBGMPlaying ? (
                  (() => {
                    const defaultTrack = SHAME_DEFAULT_TRACKS.find(t => t.id === activeTrackId);
                    if (defaultTrack) {
                      if (activeTrackId === 'local_file' && !hasCustomMusic) {
                        return '🕒 local music.mp3 (не найден)';
                      }
                      return defaultTrack.name;
                    }
                    const customTrack = customTracks.find(t => t.id === activeTrackId);
                    return customTrack ? `🎵 ${customTrack.name}` : '🎹 Уютный Синт-Пад';
                  })()
                ) : 'Выключен'}
              </span>
              
              {/* Slide volume selector */}
              <div className="flex items-center gap-1.5 mt-1">
                <button 
                  onClick={handleToggleBGM}
                  className="text-[10px] text-zinc-400 hover:text-white transition-colors bg-transparent border-none p-0 cursor-pointer mr-0.5"
                  title={isBGMPlaying ? "Пауза" : "Играть"}
                >
                  {isBGMPlaying ? <Pause size={10} /> : <Play size={10} />}
                </button>
                <Volume1 size={10} className="text-zinc-500 shrink-0" />
                <input 
                  type="range"
                  min="0"
                  max="100"
                  value={bgmVol}
                  onChange={(e) => handleBGMVolumeChange(Number(e.target.value))}
                  style={{
                    background: `linear-gradient(to right, ${theme.accentColor} ${bgmVol}%, #27272a ${bgmVol}%)`,
                  }}
                  className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-500 focus:outline-none"
                  id="bgm-volume-slider"
                  title="Громкость фоновой музыки"
                />
              </div>
            </div>
          </div>

          {/* Playlist Panel (collapsible using AnimatePresence) */}
          <AnimatePresence>
            {isPlaylistOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden flex flex-col gap-2.5 border-t border-zinc-800/60 pt-2.5"
              >
                {/* Track List Header */}
                <div className="text-[9px] uppercase tracking-wider font-extrabold text-zinc-400 font-mono">
                  Список треков
                </div>

                {/* Scrollable Track list */}
                <div className="max-h-36 overflow-y-auto pr-1 flex flex-col gap-1 scrollbar-thin">
                  {/* Default Synth */}
                  <div 
                    onClick={() => handleSelectTrack('procedural_synth')}
                    className={`flex items-center justify-between p-1.5 rounded-lg text-[10px] cursor-pointer transition-colors ${
                      activeTrackId === 'procedural_synth' 
                        ? 'bg-zinc-850 text-white font-bold border border-zinc-850/60' 
                        : 'hover:bg-zinc-900/50 text-zinc-400'
                    }`}
                  >
                    <span className="truncate flex items-center gap-1">
                      {activeTrackId === 'procedural_synth' && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
                      🎹 Уютный Синт-Пад (Синтезатор)
                    </span>
                  </div>

                  {/* Local music.mp3 */}
                  <div 
                    onClick={() => handleSelectTrack('local_file')}
                    className={`flex items-center justify-between p-1.5 rounded-lg text-[10px] cursor-pointer transition-colors ${
                      activeTrackId === 'local_file' 
                        ? 'bg-zinc-850 text-white font-bold border border-zinc-850/60' 
                        : 'hover:bg-zinc-900/50 text-zinc-400'
                    }`}
                  >
                    <span className="truncate flex items-center gap-1">
                      {activeTrackId === 'local_file' && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
                      🎵 Локальный music.mp3 {!hasCustomMusic && <span className="text-[8px] text-zinc-500 font-normal opacity-70">(не загружен)</span>}
                    </span>
                  </div>

                  {/* Custom user tracks */}
                  {customTracks.map((trk) => (
                    <div 
                      key={trk.id}
                      onClick={() => handleSelectTrack(trk.id)}
                      className={`flex items-center justify-between p-1.5 rounded-lg text-[10px] cursor-pointer transition-colors group ${
                        activeTrackId === trk.id 
                          ? 'bg-zinc-850 text-white font-bold border border-zinc-850/60' 
                          : 'hover:bg-zinc-900/50 text-zinc-400'
                      }`}
                    >
                      <span className="truncate flex items-center gap-1 max-w-[80%]">
                        {activeTrackId === trk.id && <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />}
                        🎵 {trk.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(trk.url, '_blank');
                          }}
                          className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 p-0.5 bg-transparent border-none cursor-pointer transition-opacity"
                          title="Открыть ссылку"
                        >
                          <ExternalLink size={10} />
                        </button>
                        {isAuthAdmin && (
                          <button 
                            onClick={(e) => handleDeleteTrack(trk.id, e)}
                            className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 p-0.5 bg-transparent border-none cursor-pointer transition-opacity"
                            title="Удалить"
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {customTracks.length === 0 && (
                    <div className="text-[9px] text-zinc-650 text-center py-2 italic font-sans dark:text-zinc-500">
                      Нет своих дорожек.
                    </div>
                  )}
                </div>

                {/* Add new track form - only readable for admins */}
                {isAuthAdmin ? (
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const fd = new FormData(form);
                      const name = (fd.get('track_name') as string) || '';
                      const url = (fd.get('track_url') as string) || '';
                      if (url.trim()) {
                        handleAddTrack(name, url);
                        form.reset();
                      }
                    }}
                    className="flex flex-col gap-1.5 border-t border-zinc-900 pt-2"
                  >
                    <div className="text-[9px] uppercase tracking-wider font-extrabold text-zinc-400 font-mono flex items-center gap-1">
                      <Plus size={9} className="text-red-400" />
                      Добавить свою ссылку
                    </div>
                    <div className="flex gap-1.5">
                      <input 
                        type="text"
                        name="track_name"
                        placeholder="Название"
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[9px] text-white focus:outline-none focus:border-red-500"
                      />
                      <input 
                        type="text"
                        name="track_url"
                        placeholder="Ссылка Google Диск / MP3"
                        required
                        className="flex-[2] bg-zinc-900 border border-zinc-800 rounded px-1.5 py-0.5 text-[9px] text-white focus:outline-none focus:border-red-500"
                      />
                      <button 
                        type="submit"
                        className="px-2 rounded bg-red-650 hover:bg-red-700 text-white cursor-pointer hover:scale-105 active:scale-95 transition-all text-[11px] flex items-center justify-center font-bold"
                        title="Добавить трек"
                      >
                        +
                      </button>
                    </div>
                    <div className="text-[8px] text-zinc-500 leading-tight">
                      *Поддерживаются прямые MP3 ссылки и Google Drive ("Доступ по ссылке"). URL конвертируется на лету!
                    </div>
                  </form>
                ) : (
                  <div className="text-[8px] text-zinc-500 text-center border-t border-zinc-900/60 pt-2 italic leading-normal">
                    *Управлять плейлистом (добавлять песни/файлы) могут только администраторы через Telegram бота или форму на сайте.
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
