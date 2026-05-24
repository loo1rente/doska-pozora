import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Settings,
  UserPlus,
  Tv,
  LogOut,
  RefreshCw,
  Sparkles,
  Upload,
  Image as ImageIcon,
  KeyRound,
  Grid,
  Palette,
  FileEdit,
  Save,
  Check,
  PlusCircle,
  X,
  Shuffle,
  Trash2
} from 'lucide-react';
import { ShameCard, ThemeSettings, ThemePreset, PRESET_THEMES } from '../types';
import { SHAME_CATEGORIES, PRESET_AVATARS } from '../data/initialData';

interface AdminPanelProps {
  theme: ThemeSettings;
  cards: ShameCard[];
  onUpdateTheme: (newTheme: ThemeSettings) => void;
  onAddCard: (card: Omit<ShameCard, 'id' | 'tomatoes' | 'facepalms' | 'forgiven'>) => void;
  onUpdateCard: (card: ShameCard) => void;
  onDeleteCard: (id: string) => void;
  onResetData: () => void;
  onClearAllComments: () => void;
  onClose: () => void;
  editingCard: ShameCard | null;
  setEditingCard: (card: ShameCard | null) => void;
}

export const AdminPanelComponent: React.FC<AdminPanelProps> = ({
  theme,
  cards,
  onUpdateTheme,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onResetData,
  onClearAllComments,
  onClose,
  editingCard,
  setEditingCard,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    () => {
      const u = typeof window !== 'undefined' ? localStorage.getItem('shame_user_nickname') || '' : '';
      const isSpecial = ['terramata', 'mad'].includes(u.toLowerCase().trim());
      return isSpecial || (typeof window !== 'undefined' && localStorage.getItem('shame_admin_auth') === 'true');
    }
  );

  React.useEffect(() => {
    const u = localStorage.getItem('shame_user_nickname') || '';
    const isSpecial = ['terramata', 'mad'].includes(u.toLowerCase().trim());
    if (isSpecial) {
      setIsAuthenticated(true);
    }
  }, []);
  const [password, setPassword] = useState('');
  const [preshowPassword, setPreshowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState<'design' | 'cards'>('design');

  // Card Form Fields
  const [cardName, setCardName] = useState(editingCard ? editingCard.name : '');
  const [cardDesc, setCardDesc] = useState(editingCard ? editingCard.description : '');
  const [cardCategory, setCardCategory] = useState(editingCard ? editingCard.category : '');
  const [cardSeverity, setCardSeverity] = useState<'minor' | 'moderate' | 'epic'>(
    editingCard ? editingCard.severity : 'minor'
  );
  const [cardPhotoUrl, setCardPhotoUrl] = useState(editingCard ? editingCard.photoUrl : PRESET_AVATARS[0].url);
  const [cardTags, setCardTags] = useState(editingCard && editingCard.tags ? editingCard.tags.join(', ') : '');
  const [customCategory, setCustomCategory] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingCard) {
      setCardName(editingCard.name);
      setCardDesc(editingCard.description);
      setCardCategory(editingCard.category || '');
      setCardSeverity(editingCard.severity);
      setCardPhotoUrl(editingCard.photoUrl);
      setCardTags(editingCard.tags ? editingCard.tags.join(', ') : '');
      setActiveTab('cards');
    } else {
      clearCardForm();
    }
  }, [editingCard]);

  const clearCardForm = () => {
    setCardName('');
    setCardDesc('');
    setCardCategory('');
    setCardSeverity('minor');
    setCardPhotoUrl(PRESET_AVATARS[0].url);
    setCardTags('');
    setCustomCategory('');
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === '123dkdk') {
      setIsAuthenticated(true);
      localStorage.setItem('shame_admin_auth', 'true');
      setAuthError('');
    } else {
      setAuthError('Неверный пароль доступа! Подсказка: он указан в задании.');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('shame_admin_auth');
    setPassword('');
  };

  const compressAndSetPhoto = (file: File) => {
    setIsUploading(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 450;
        const scaleSize = MAX_WIDTH / img.width;

        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          // 70% JPEG compression fits beautifully into localStorage
          const base64 = canvas.toDataURL('image/jpeg', 0.7);
          setCardPhotoUrl(base64);
          setIsUploading(false);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      compressAndSetPhoto(e.target.files[0]);
    }
  };

  const handlePresetSelect = (presetKey: ThemePreset) => {
    onUpdateTheme(PRESET_THEMES[presetKey]);
  };

  const handleCustomThemeChange = (key: keyof ThemeSettings, value: any) => {
    onUpdateTheme({
      ...theme,
      id: 'custom',
      [key]: value,
    });
  };

  const handleSaveCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardName.trim() || !cardDesc.trim()) {
      alert('Заполните Имя фигуранта и описание проступка!');
      return;
    }

    const finalCategory = '';
    const tagArray = cardTags.split(',').map(t => t.trim()).filter(Boolean);

    if (editingCard) {
      const changes: string[] = [];
      if (editingCard.name !== cardName) changes.push(`Имя: было "${editingCard.name}" стало "${cardName}"`);
      if (editingCard.description !== cardDesc) changes.push(`Описание изменено`);
      if (editingCard.severity !== cardSeverity) {
        const sevMap = { minor: "легкая", moderate: "средняя", epic: "эпическая" };
        changes.push(`Тяжесть: была "${sevMap[editingCard.severity]}" стала "${sevMap[cardSeverity]}"`);
      }
      if (editingCard.photoUrl !== cardPhotoUrl) changes.push(`Обновлено фото`);
      
      const oldTags = editingCard.tags || [];
      if (JSON.stringify(oldTags) !== JSON.stringify(tagArray)) {
        changes.push(`Теги изменились: было [${oldTags.join(', ')}] стало [${tagArray.join(', ')}]`);
      }

      const updatedHistory = [...(editingCard.history || [])];
      if (changes.length > 0) {
        updatedHistory.push({
          id: `hist_${Date.now()}`,
          editor: localStorage.getItem('shame_user_nickname') || 'Администратор',
          action: 'Редактирование карточки',
          date: new Date().toISOString(),
          details: changes.join('; ')
        });
      }

      onUpdateCard({
        ...editingCard,
        name: cardName,
        description: cardDesc,
        category: finalCategory,
        severity: cardSeverity,
        photoUrl: cardPhotoUrl,
        tags: tagArray,
        history: updatedHistory,
      });
      setEditingCard(null);
    } else {
      const initialHistory = [{
        id: `hist_${Date.now()}`,
        editor: localStorage.getItem('shame_user_nickname') || 'Администратор',
        action: 'Создание карточки улик',
        date: new Date().toISOString(),
        details: `Создано через Веб-интерфейс. Теги: ${tagArray.length > 0 ? tagArray.join(', ') : 'нет'}`
      }];

      onAddCard({
        name: cardName,
        description: cardDesc,
        category: finalCategory,
        severity: cardSeverity,
        photoUrl: cardPhotoUrl,
        date: new Date().toISOString().split('T')[0],
        tags: tagArray,
        history: initialHistory,
      });
    }
    clearCardForm();
  };

  const generateRandomOffense = () => {
    const names = [
      'Виктор Слизняков',
      'Евгения Сладкоежкина',
      'Павел Медленный',
      'Марина Геймерова',
      'Егор Безкодович',
    ];
    const offenses = [
      {
        desc: 'Выпил подряд три стакана молочного капучино из корпоративного кофе-аппарата, израсходовав весь недельный лимит молока для отдела дизайна.',
        cat: '☕ Чайный Вредитель',
        sev: 'minor' as const,
        avatar: PRESET_AVATARS[4].url,
      },
      {
        desc: 'Решил поиграть в CS:GO на рабочем месте в обеденный перерыв, но случайно вывел стрим со своего экрана на главный презентационный проектор холла компании во время визита акционеров.',
        cat: '🎯 Своя Категория',
        sev: 'epic' as const,
        avatar: PRESET_AVATARS[5].url,
      },
      {
        desc: 'Купил на представительские расходы компании робот-пылесос, назвал его "Петрович" и заставил разносить печеньки по кабинетам, превысив лимит мелких канцелярий на 400%.',
        cat: '💸 Финансовый Транжира',
        sev: 'moderate' as const,
        avatar: PRESET_AVATARS[0].url,
      },
    ];

    const randomName = names[Math.floor(Math.random() * names.length)];
    const randomOffense = offenses[Math.floor(Math.random() * offenses.length)];

    setCardName(randomName);
    setCardDesc(randomOffense.desc);
    setCardCategory(randomOffense.cat);
    setCardSeverity(randomOffense.sev);
    setCardPhotoUrl(randomOffense.avatar);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6" id="admin-panel-overlay">
      <AnimatePresence mode="wait">
        {!isAuthenticated ? (
          /* PASSWORD FORM SCREEN */
          <motion.div
            key="login"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-2xl p-6 sm:p-8 shadow-2xl relative"
            id="password-form-container"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1 text-zinc-500 hover:text-white transition-colors cursor-pointer"
              id="close-login-btn"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                <KeyRound size={28} className="text-red-500 animate-pulse" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight">Вход в Админ-панель</h2>
              <p className="text-xs text-zinc-400 mt-2">
                Для изменения дизайна и управления прегрешениями введите пароль.
              </p>
            </div>

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-zinc-400 mb-1.5">
                  Пароль доступа
                </label>
                <div className="relative">
                  <input
                    type={preshowPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль..."
                    className="w-full p-3 bg-zinc-950 border border-zinc-800 rounded-xl focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500 text-white font-mono text-center tracking-widest text-lg"
                    autoFocus
                    id="admin-password-input"
                  />
                  <button
                    type="button"
                    onClick={() => setPreshowPassword(!preshowPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500 hover:text-zinc-300"
                  >
                    {preshowPassword ? 'Скрыть' : 'Показать'}
                  </button>
                </div>
                {authError && (
                  <p className="text-xs text-red-500 mt-2 text-center font-medium bg-red-500/5 py-1 px-2 rounded border border-red-500/10" id="auth-error-msg">
                    ⚠️ {authError}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-red-600 hover:bg-red-700 active:translate-y-px transition-all rounded-xl font-bold tracking-wider text-sm shadow-lg text-white cursor-pointer"
                id="submit-password-btn"
              >
                Разблокировать Панель
              </button>
            </form>
          </motion.div>
        ) : (
          /* MAIN ADMIN CONTROL BOARD SCREEN */
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="w-full max-w-5xl bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col h-[90vh] md:h-[80vh] overflow-hidden"
            id="admin-board-panel"
          >
            {/* Panel Top Title Block */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-zinc-800 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-600/15 rounded-xl border border-red-500/30 text-red-500">
                  <Settings size={22} className="animate-spin-slow" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                    Админка Доски Позора <span className="text-xs bg-red-500/20 text-red-400 py-0.5 px-2 rounded-full uppercase tracking-widest font-bold">Live</span>
                  </h2>
                  <p className="text-xs text-zinc-400">Настраивайте дизайн сайта онлайн и наказывайте за провинности.</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={onClearAllComments}
                  className="px-3 py-1.5 text-xs bg-red-950 hover:bg-red-900 rounded-lg text-red-450 border border-red-500/20 flex items-center gap-1.5 transition-colors cursor-pointer font-semibold"
                  title="Удалить абсолютно все комментарии из карточек"
                  id="admin-clear-comments-btn"
                >
                  <Trash2 size={13} />
                  Очистить все комментарии
                </button>
                <button
                  onClick={onResetData}
                  className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg text-amber-500 flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Откатить все карточки и темы к заводскому позору"
                  id="reset-data-btn"
                >
                  <RefreshCw size={13} />
                  Сброс по дефолту
                </button>
                <button
                  onClick={handleLogout}
                  className="px-3 py-1.5 text-xs bg-red-950/60 hover:bg-red-900/60 border border-red-900/40 rounded-lg text-red-400 flex items-center gap-1.5 transition-colors cursor-pointer"
                  id="logout-admin-btn"
                >
                  <LogOut size={13} />
                  Выйти
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-1.5 text-xs bg-zinc-100 hover:bg-white text-zinc-950 font-bold rounded-lg transition-colors cursor-pointer"
                  id="back-to-site-btn"
                >
                  Вернуться на сайт
                </button>
              </div>
            </div>

            {/* TAB SELECTOR */}
            <div className="flex gap-2 mt-4 p-1 bg-zinc-950 rounded-xl border border-zinc-800/60 flex-shrink-0">
              <button
                onClick={() => setActiveTab('design')}
                className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'design' ? 'bg-zinc-800 text-red-400 shadow-md' : 'text-zinc-400 hover:bg-zinc-900/50'
                }`}
                id="tab-design-btn"
              >
                <Palette size={16} />
                🎨 Дизайн и Оформление
              </button>
              <button
                onClick={() => setActiveTab('cards')}
                className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'cards' ? 'bg-zinc-800 text-red-400 shadow-md' : 'text-zinc-400 hover:bg-zinc-900/50'
                }`}
                id="tab-cards-btn"
              >
                <UserPlus size={16} />
                🦹 Фигуранты Доски ({cards.length})
              </button>
            </div>

            {/* TAB PANELS AREA */}
            <div className="flex-grow overflow-y-auto mt-6 pr-1 space-y-6">
              {activeTab === 'design' ? (
                /* TAB 1: DESIGN CONFIGURATION */
                <div className="space-y-6" id="panel-design-tab">
                  {/* Preset Themes List */}
                  <div className="bg-zinc-950 p-5 rounded-2xl border border-zinc-800">
                    <h3 className="text-sm font-semibold tracking-wide text-zinc-400 uppercase mb-4 flex items-center gap-2">
                      <Sparkles size={14} className="text-amber-400" /> Готовые Экспресс-Темы оформления
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                      {(Object.keys(PRESET_THEMES) as ThemePreset[]).map((key) => {
                        const p = PRESET_THEMES[key];
                        const isActive = theme.id === key;
                        return (
                          <button
                            key={key}
                            onClick={() => handlePresetSelect(key)}
                            style={{ borderColor: isActive ? theme.accentColor : '#3f3f46' }}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              isActive ? 'bg-zinc-900' : 'bg-zinc-950/60 hover:bg-zinc-900/40'
                            } cursor-pointer group`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span
                                className="w-5 h-5 rounded-full border border-zinc-700 flex-shrink-0"
                                style={{ backgroundColor: p.accentColor }}
                              />
                              {isActive && <Check size={14} className="text-emerald-400" />}
                            </div>
                            <p className="text-xs font-bold font-sans tracking-wide leading-tight text-white group-hover:text-red-400 transition-colors">
                              {p.name}
                            </p>
                            <p className="text-[9px] text-zinc-500 font-mono mt-0.5">{p.fontFamily}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Manual Fine-tuning Layout */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Colors & Shapes */}
                    <div className="bg-zinc-950/20 p-5 rounded-2xl border border-zinc-800 space-y-4">
                      <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2 border-b border-zinc-800 pb-2">
                        <span>🎨 Цветовая схема и контуры</span>
                      </h4>

                      {/* Accent Color picker */}
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">
                          Акцентный цвет (Кнопки, выделенки)
                        </label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={theme.accentColor}
                            onChange={(e) => handleCustomThemeChange('accentColor', e.target.value)}
                            className="bg-zinc-900 h-9 w-14 rounded cursor-pointer border border-zinc-700"
                          />
                          <input
                            type="text"
                            value={theme.accentColor}
                            onChange={(e) => handleCustomThemeChange('accentColor', e.target.value)}
                            className="bg-zinc-900 text-xs px-3 py-2 rounded-lg border border-zinc-800 font-mono flex-grow focus:outline-none focus:border-zinc-600"
                          />
                        </div>
                      </div>

                      {/* Background Color picker */}
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">Цвет фона страницы</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={theme.backgroundColor}
                            onChange={(e) => handleCustomThemeChange('backgroundColor', e.target.value)}
                            className="bg-zinc-900 h-9 w-14 rounded cursor-pointer border border-zinc-700"
                          />
                          <input
                            type="text"
                            value={theme.backgroundColor}
                            onChange={(e) => handleCustomThemeChange('backgroundColor', e.target.value)}
                            className="bg-zinc-900 text-xs px-3 py-2 rounded-lg border border-zinc-800 font-mono flex-grow focus:outline-none focus:border-zinc-600"
                          />
                        </div>
                      </div>

                      {/* Card Color picker */}
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">Цвет карточки (Стенда)</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={theme.cardColor}
                            onChange={(e) => handleCustomThemeChange('cardColor', e.target.value)}
                            className="bg-zinc-900 h-9 w-14 rounded cursor-pointer border border-zinc-700"
                          />
                          <input
                            type="text"
                            value={theme.cardColor}
                            onChange={(e) => handleCustomThemeChange('cardColor', e.target.value)}
                            className="bg-zinc-900 text-xs px-3 py-2 rounded-lg border border-zinc-800 font-mono flex-grow focus:outline-none focus:border-zinc-600"
                          />
                        </div>
                      </div>

                      {/* Text Color picker */}
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">Основной текст</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={theme.textColor}
                            onChange={(e) => handleCustomThemeChange('textColor', e.target.value)}
                            className="bg-zinc-900 h-9 w-14 rounded cursor-pointer border border-zinc-700"
                          />
                          <input
                            type="text"
                            value={theme.textColor}
                            onChange={(e) => handleCustomThemeChange('textColor', e.target.value)}
                            className="bg-zinc-900 text-xs px-3 py-2 rounded-lg border border-zinc-800 font-mono flex-grow focus:outline-none focus:border-zinc-600"
                          />
                        </div>
                      </div>

                      {/* Border Styles */}
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">Рамка карточки</label>
                        <div className="grid grid-cols-4 gap-1">
                          {(['none', 'solid', 'dashed', 'neon'] as const).map((b) => (
                            <button
                              key={b}
                              onClick={() => handleCustomThemeChange('borderStyle', b)}
                              className={`py-1.5 text-[11px] font-bold rounded capitalize cursor-pointer ${
                                theme.borderStyle === b
                                  ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800'
                              }`}
                            >
                              {b === 'none' ? 'Нет' : b === 'solid' ? 'Линия' : b === 'dashed' ? 'Dashed' : 'Neon!'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Rounded edges */}
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">Округление углов</label>
                        <div className="grid grid-cols-5 gap-1">
                          {[
                            { value: '0px', label: 'Остро' },
                            { value: '4px', label: 'Угон' },
                            { value: '12px', label: 'Карт' },
                            { value: '24px', label: 'Кругл' },
                            { value: '999px', label: 'Овал' },
                          ].map((item) => (
                            <button
                              key={item.value}
                              onClick={() => handleCustomThemeChange('borderRadius', item.value)}
                              className={`py-1.5 text-[10px] font-bold rounded cursor-pointer ${
                                theme.borderRadius === item.value
                                  ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Branding, Text & Layout */}
                    <div className="bg-zinc-950/20 p-5 rounded-2xl border border-zinc-800 space-y-4">
                      <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2 border-b border-zinc-800 pb-2">
                        <span>📺 Текст заголовков и Шрифты</span>
                      </h4>

                      {/* Header Title */}
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">Главный заголовок сайта</label>
                        <input
                          type="text"
                          value={theme.siteTitle}
                          onChange={(e) => handleCustomThemeChange('siteTitle', e.target.value)}
                          className="w-full bg-zinc-900 text-xs px-3 py-2 rounded-lg border border-zinc-850 text-white focus:outline-none focus:border-zinc-700"
                        />
                      </div>

                      {/* Header Subtitle */}
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">Подзаголовок сайта (Описание)</label>
                        <textarea
                          rows={2}
                          value={theme.siteSubtitle}
                          onChange={(e) => handleCustomThemeChange('siteSubtitle', e.target.value)}
                          className="w-full bg-zinc-900 text-xs px-3 py-2 rounded-lg border border-zinc-850 text-white focus:outline-none focus:border-zinc-700 resize-none"
                        />
                      </div>

                      {/* Font Family Selection */}
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">Шрифт интерфейса</label>
                        <div className="grid grid-cols-4 gap-1">
                          {[
                            { value: 'sans', label: 'Inter' },
                            { value: 'mono', label: 'Code Mono' },
                            { value: 'serif', label: 'Editorial' },
                            { value: 'grotesk', label: 'Grotesk' },
                          ].map((f) => (
                            <button
                              key={f.value}
                              onClick={() => handleCustomThemeChange('fontFamily', f.value)}
                              className={`py-1.5 text-[11px] font-bold rounded cursor-pointer ${
                                theme.fontFamily === f.value
                                  ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800'
                              }`}
                            >
                              {f.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Grid layout */}
                      <div>
                        <label className="text-xs text-zinc-400 block mb-1">Сетка галереи (Колонки)</label>
                        <div className="grid grid-cols-3 gap-1">
                          {[
                            { value: '2', label: '2 колонки' },
                            { value: '3', label: '3 колонки' },
                            { value: '4', label: '4 колонки' },
                          ].map((grid) => (
                            <button
                              key={grid.value}
                              onClick={() => handleCustomThemeChange('gridColumns', grid.value)}
                              className={`py-1.5 text-[11px] font-bold rounded cursor-pointer ${
                                theme.gridColumns === grid.value
                                  ? 'bg-red-600/20 text-red-400 border border-red-500/30'
                                  : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 border border-zinc-800'
                              }`}
                            >
                              {grid.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Noise Background toggle */}
                      <div className="flex items-center justify-between p-2.5 bg-zinc-900/50 rounded-xl border border-zinc-850">
                        <div>
                          <span className="text-xs font-bold text-white block">Искажения фона (Катодный шум)</span>
                          <span className="text-[10px] text-zinc-500 block">Мерцающие линии на заднем плане</span>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={theme.showBackgroundNoise}
                            onChange={(e) => handleCustomThemeChange('showBackgroundNoise', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600 peer-checked:after:bg-white" />
                        </label>
                      </div>
                    </div>

                    {/* Cooldown & Reaction Limits Section */}
                    <div className="bg-zinc-950/20 p-5 rounded-2xl border border-zinc-800 space-y-4 md:col-span-2">
                      <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2 border-b border-zinc-800 pb-2">
                        <span>⏱️ Лимиты позора и анти-спам (Кулдауны)</span>
                      </h4>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Cooldown Settings */}
                        <div className="space-y-2">
                          <label className="text-xs text-zinc-400 block font-semibold">
                            Время задержки (кулдаун) перед следующей оценкой:
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="0"
                              max="86400"
                              value={theme.reactionCooldown ?? 30}
                              onChange={(e) => handleCustomThemeChange('reactionCooldown', Math.max(0, parseInt(e.target.value) || 0))}
                              placeholder="30"
                              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white text-xs w-28 focus:outline-none focus:border-red-500 font-mono text-center animate-none"
                              id="admin-cooldown-input"
                            />
                            <span className="text-xs text-zinc-500 self-center font-mono">секунд(ы)</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {[
                              { label: 'Выкл (0с)', value: 0 },
                              { label: '5 сек', value: 5 },
                              { label: '15 сек', value: 15 },
                              { label: '30 сек', value: 30 },
                              { label: '1 мин', value: 60 },
                              { label: '15 мин', value: 900 }
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => handleCustomThemeChange('reactionCooldown', option.value)}
                                className={`px-2 py-1 text-[10px] font-bold rounded cursor-pointer transition-all ${
                                  (theme.reactionCooldown ?? 30) === option.value
                                    ? 'bg-red-650 text-white border border-red-500'
                                    : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-850 border border-zinc-800'
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-zinc-500 italic mt-1 leading-normal">
                            Защищает стенд от спамеров и ботов. Вы сможете оставить следующую реакцию только после завершения таймера.
                          </p>
                        </div>

                        {/* Comment Cooldown Settings */}
                        <div className="space-y-2">
                          <label className="text-xs text-zinc-400 block font-semibold">
                            Время задержки (кулдаун) для комментариев:
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="0"
                              max="86400"
                              value={theme.commentCooldown ?? 15}
                              onChange={(e) => handleCustomThemeChange('commentCooldown', Math.max(0, parseInt(e.target.value) || 0))}
                              placeholder="15"
                              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white text-xs w-28 focus:outline-none focus:border-red-500 font-mono text-center animate-none"
                              id="admin-comment-cooldown-input"
                            />
                            <span className="text-xs text-zinc-500 self-center font-mono">секунд(ы)</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {[
                              { label: 'Выкл (0с)', value: 0 },
                              { label: '5 сек', value: 5 },
                              { label: '10 сек', value: 10 },
                              { label: '15 сек', value: 15 },
                              { label: '30 сек', value: 30 },
                              { label: '1 мин', value: 60 }
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => handleCustomThemeChange('commentCooldown', option.value)}
                                className={`px-2 py-1 text-[10px] font-bold rounded cursor-pointer transition-all ${
                                  (theme.commentCooldown ?? 15) === option.value
                                    ? 'bg-red-650 text-white border border-red-500'
                                    : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-850 border border-zinc-800'
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-zinc-500 italic mt-1 leading-normal">
                            Лимитирует частоту публикации новых комментариев и ответов на доске.
                          </p>
                        </div>

                        {/* Reaction Limits */}
                        <div className="space-y-2">
                          <label className="text-xs text-zinc-400 block font-semibold">
                            Максимальный лимит реакций каждого вида на фигуранта:
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="1"
                              max="999999"
                              value={theme.maxReactionsLimit ?? 100}
                              onChange={(e) => handleCustomThemeChange('maxReactionsLimit', Math.max(1, parseInt(e.target.value) || 100))}
                              placeholder="100"
                              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white text-xs w-28 focus:outline-none focus:border-red-500 font-mono text-center animate-none"
                              id="admin-reaction-limit-input"
                            />
                            <span className="text-xs text-zinc-500 self-center font-mono font-bold">реакций</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {[
                              { label: 'Ограниченный (50)', value: 50 },
                              { label: 'Стандарт (100)', value: 100 },
                              { label: 'Кураж (500)', value: 500 },
                              { label: 'Много (1000)', value: 1000 },
                              { label: 'Безумие (9999)', value: 9999 }
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => handleCustomThemeChange('maxReactionsLimit', option.value)}
                                className={`px-2 py-1 text-[10px] font-bold rounded cursor-pointer transition-all ${
                                  (theme.maxReactionsLimit ?? 100) === option.value
                                    ? 'bg-red-650 text-white border border-red-500'
                                    : 'bg-zinc-900 text-zinc-400 hover:text-white hover:bg-zinc-850 border border-zinc-800'
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-zinc-500 italic mt-1 leading-normal">
                            Устанавливает потолок для метания томатов, фейспалмов и пинков. По достижении этого количества счётчик замораживается.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* TAB 2: SUSPECTS & SHAME CARDS */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" id="panel-cards-tab">
                  {/* Form Side */}
                  <form
                    onSubmit={handleSaveCard}
                    className="lg:col-span-6 bg-zinc-950 p-5 rounded-2xl border border-zinc-800 space-y-4 h-fit"
                    id="shame-card-form"
                  >
                    <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                      <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                        <FileEdit size={16} className="text-red-500" />
                        <span>{editingCard ? 'Редактировать запись' : 'Добавить Нового Косячника'}</span>
                      </h3>
                      {!editingCard && (
                        <button
                          type="button"
                          onClick={generateRandomOffense}
                          className="px-2 py-1 text-[10px] bg-amber-600/20 text-amber-400 border border-amber-500/20 hover:bg-amber-600/30 rounded flex items-center gap-1 transition-all cursor-pointer font-bold"
                        >
                          <Shuffle size={10} />
                          Случайный затуп
                        </button>
                      )}
                    </div>

                    {/* Name */}
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Имя Фамилия фигуранта *</label>
                      <input
                        type="text"
                        value={cardName}
                        onChange={(e) => setCardName(e.target.value)}
                        placeholder="Например: Аркадий Косяков"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-red-500"
                        required
                        id="shame-card-name"
                      />
                    </div>

                    {/* Sin Description */}
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">В чём провинился? (Описание деяния) *</label>
                      <textarea
                        rows={3}
                        value={cardDesc}
                        onChange={(e) => setCardDesc(e.target.value)}
                        placeholder="Какое косячество или факап совершил этот гражданин во всех забавных красках..."
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-red-500"
                        required
                        id="shame-card-desc"
                      />
                    </div>

                    {/* Severity Selection (Full width, category removed) */}
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Тяжесть провинения</label>
                      <select
                        value={cardSeverity}
                        onChange={(e) => setCardSeverity(e.target.value as any)}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-red-500 capitalize"
                        id="shame-card-severity-select"
                      >
                        <option value="minor">👀 Мелкая оплошность</option>
                        <option value="moderate">⚡ Серьезный косяк</option>
                        <option value="epic">🔥 Эпический факап</option>
                      </select>
                    </div>

                    {/* Tags input */}
                    <div>
                      <label className="text-xs text-zinc-400 block mb-1">Теги (через запятую)</label>
                      <input
                        type="text"
                        value={cardTags}
                        onChange={(e) => setCardTags(e.target.value)}
                        placeholder="опоздание, баг, деплой, ололо"
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-red-500"
                        id="shame-card-tags-input"
                      />
                    </div>

                    {/* Image Selector & Upload Section */}
                    <div>
                      <label className="text-xs text-zinc-400 block mb-2">Фотография фигуранта</label>

                      {/* Display current photo outline */}
                      <div className="flex gap-4 items-center mb-3 p-3 bg-zinc-900/50 rounded-xl border border-zinc-800">
                        <img
                          src={cardPhotoUrl || PRESET_AVATARS[0].url}
                          alt="preview"
                          className="w-16 h-16 rounded object-cover flex-shrink-0 border border-zinc-700 shadow-md"
                          referrerPolicy="no-referrer"
                        />
                        <div className="text-xs space-y-1">
                          <p className="font-semibold text-white">Выбранное фото</p>
                          <p className="text-zinc-500 text-[10px] truncate max-w-[200px]">
                            {cardPhotoUrl.startsWith('data:') ? 'Собственная фотография (Base64)' : 'Готовый фото-пресет или Ссылка'}
                          </p>
                          {cardPhotoUrl.startsWith('data:') && (
                            <button
                              type="button"
                              onClick={() => setCardPhotoUrl(PRESET_AVATARS[0].url)}
                              className="text-red-400 hover:underline hover:text-red-300 font-bold text-[10px] cursor-pointer"
                            >
                              Сбросить к пресету
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        {/* Custom Upload */}
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="cursor-pointer border border-dashed border-zinc-700/60 hover:border-red-500/60 hover:bg-zinc-900 bg-zinc-950 p-3 rounded-xl flex flex-col items-center justify-center text-center transition-all group"
                        >
                          <Upload size={18} className="text-zinc-400 group-hover:text-red-400 group-hover:scale-110 transition-transform mb-1" />
                          <span className="text-[10px] font-bold text-zinc-300 group-hover:text-red-400">Загрузить своё фото</span>
                          <span className="text-[9px] text-zinc-500 font-mono mt-0.5">(PNG, JPG c сжатием)</span>
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept="image/*"
                            className="hidden"
                          />
                        </div>

                        {/* Custom URL Option */}
                        <div className="bg-zinc-950 border border-zinc-800 p-3 rounded-xl flex flex-col justify-center space-y-1">
                          <span className="text-[10px] font-bold text-zinc-300 flex items-center gap-1">
                            <ImageIcon size={10} /> Ссылка на изображение
                          </span>
                          <input
                            type="text"
                            value={cardPhotoUrl.startsWith('data:') ? '' : cardPhotoUrl}
                            onChange={(e) => setCardPhotoUrl(e.target.value || PRESET_AVATARS[0].url)}
                            placeholder="https://images.unsplash.com..."
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-[10px] text-white focus:outline-none focus:border-red-500 font-mono"
                          />
                        </div>
                      </div>

                      {/* Preset funny Avatars quick Selector */}
                      <div>
                        <span className="text-[10px] text-zinc-400 block mb-1.5 uppercase tracking-wide">Или выберите мем из библиотеки улик:</span>
                        <div className="grid grid-cols-6 gap-2">
                          {PRESET_AVATARS.map((avatar) => (
                            <button
                              key={avatar.id}
                              type="button"
                              onClick={() => setCardPhotoUrl(avatar.url)}
                              className={`relative rounded-lg overflow-hidden border aspect-square cursor-pointer transition-all ${
                                cardPhotoUrl === avatar.url ? 'border-red-500 ring-1 ring-red-500 scale-105' : 'border-zinc-800 hover:border-zinc-650 opacity-70 hover:opacity-100'
                              }`}
                              title={avatar.name}
                            >
                              <img src={avatar.url} alt={avatar.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              <div className="absolute inset-0 bg-black/30 hover:bg-transparent transition-colors" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Submit and Controls */}
                    <div className="flex gap-2 pt-2 border-t border-zinc-800">
                      {editingCard && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCard(null);
                            clearCardForm();
                          }}
                          className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-bold text-zinc-300 cursor-pointer"
                        >
                          Отменить редактирование
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isUploading}
                        className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-xs font-bold tracking-wide shadow-md flex items-center justify-center gap-1.5 text-white cursor-pointer disabled:opacity-50"
                        id="shame-card-submit-btn"
                      >
                        <Save size={14} />
                        <span>{editingCard ? 'Сохранить изменения' : 'Внести на Стенд Позора'}</span>
                      </button>
                    </div>
                  </form>

                  {/* List Side */}
                  <div className="lg:col-span-6 flex flex-col h-full bg-zinc-950 p-5 rounded-2xl border border-zinc-800 overflow-hidden">
                    <h3 className="text-sm font-bold text-white mb-3 border-b border-zinc-800 pb-2 flex items-center gap-1.5 flex-shrink-0">
                      <Grid size={15} className="text-red-500" />
                      <span>База зарегистрированных лиц ({cards.length})</span>
                    </h3>

                    {/* Quick culprits list */}
                    <div className="flex-grow overflow-y-auto space-y-2 pr-1 h-[400px] lg:h-[500px]">
                      {cards.length === 0 ? (
                        <div className="text-center py-10 text-zinc-500 text-xs font-medium">
                          Стенд позора пуст! Наступила всеобщая нирвана.
                        </div>
                      ) : (
                        cards.map((item) => (
                          <div
                            key={item.id}
                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                              editingCard?.id === item.id
                                ? 'bg-red-500/10 border-red-500/50'
                                : 'bg-zinc-900/60 border-zinc-850 hover:bg-zinc-900 hover:border-zinc-800'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <img
                                src={item.photoUrl}
                                alt={item.name}
                                className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border border-zinc-700"
                                referrerPolicy="no-referrer"
                              />
                              <div className="min-w-0">
                                <h4 className="text-xs font-bold text-white truncate max-w-[150px] sm:max-w-[200px]">
                                  {item.name}
                                </h4>
                                <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">
                                  {item.description}
                                </p>
                              </div>
                            </div>

                            <div className="flex gap-1 flex-shrink-0">
                              <button
                                onClick={() => setEditingCard(item)}
                                className="p-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-700 text-amber-400 transition-all cursor-pointer"
                                title="Редактировать воришку"
                              >
                                <FileEdit size={12} />
                              </button>
                              <button
                                onClick={() => onDeleteCard(item.id)}
                                className="p-1.5 rounded-lg bg-zinc-850 hover:bg-red-900/40 hover:text-red-400 text-zinc-500 transition-all cursor-pointer"
                                title="Изъять запись окончательно"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
