export interface ShameComment {
  id: string;
  author: string;
  text: string;
  date: string;
  parentId?: string; // Optional parentId to support nesting/replies
  replyToAuthor?: string; // Optional: username we are replying to
}

export interface ShameCard {
  id: string;
  name: string;
  description: string;
  photoUrl: string; // Base64 or Unsplash URL or Preset key
  category: string;
  severity: 'minor' | 'moderate' | 'epic';
  date: string;
  tomatoes: number;
  facepalms: number;
  forgiven: number;
  comments?: ShameComment[];
}

export type ThemePreset = 'artistic' | 'crimson' | 'cyberpunk' | 'retro' | 'clean' | 'nordic';

export interface ThemeSettings {
  id: ThemePreset | 'custom';
  name: string;
  backgroundColor: string;
  cardColor: string;
  accentColor: string;
  textColor: string;
  textSecondaryColor: string;
  borderStyle: 'none' | 'solid' | 'dashed' | 'neon';
  borderRadius: string; // 'none' | 'sm' | 'md' | 'lg' | 'full'
  fontFamily: 'sans' | 'mono' | 'serif' | 'grotesk';
  gridColumns: '2' | '3' | '4';
  showBackgroundNoise: boolean;
  siteTitle: string;
  siteSubtitle: string;
  reactionCooldown?: number;
  maxReactionsLimit?: number;
  commentCooldown?: number;
}

export const PRESET_THEMES: Record<ThemePreset, ThemeSettings> = {
  artistic: {
    id: 'artistic',
    name: 'Artistic Flair (Стиль)',
    backgroundColor: '#0A0A0A',
    cardColor: '#111111',
    accentColor: '#FF3B30',
    textColor: '#F0F0F0',
    textSecondaryColor: '#9ca3af',
    borderStyle: 'solid',
    borderRadius: '0px',
    fontFamily: 'grotesk',
    gridColumns: '3',
    showBackgroundNoise: false,
    siteTitle: 'Доска Позора',
    siteSubtitle: 'by mad & terramata & социальное дно',
  },
  crimson: {
    id: 'crimson',
    name: 'Багровый Позор',
    backgroundColor: '#0a0a0c',
    cardColor: '#141416',
    accentColor: '#dc2626',
    textColor: '#f3f4f6',
    textSecondaryColor: '#9ca3af',
    borderStyle: 'solid',
    borderRadius: '12px',
    fontFamily: 'sans',
    gridColumns: '3',
    showBackgroundNoise: true,
    siteTitle: 'Официальный Стенд Позора',
    siteSubtitle: 'Герои должны быть известны в лицо. Наши проступки, факапы и вечные косяки.',
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Киберпанк 2077',
    backgroundColor: '#08010f',
    cardColor: '#120224',
    accentColor: '#f000ff',
    textColor: '#00ffcc',
    textSecondaryColor: '#ff007f',
    borderStyle: 'neon',
    borderRadius: '0px',
    fontFamily: 'mono',
    gridColumns: '3',
    showBackgroundNoise: true,
    siteTitle: 'NIGHT CITY: CRIME BOARD',
    siteSubtitle: 'Синдикат подвёл протокол безопасности. Нарушители матрицы зафиксированы.',
  },
  retro: {
    id: 'retro',
    name: 'Винтажная Газета',
    backgroundColor: '#f4f1ea',
    cardColor: '#eae5d8',
    accentColor: '#78350f',
    textColor: '#1c1917',
    textSecondaryColor: '#57534e',
    borderStyle: 'dashed',
    borderRadius: '4px',
    fontFamily: 'serif',
    gridColumns: '3',
    showBackgroundNoise: false,
    siteTitle: 'Ретро-Вестник Проступковъ',
    siteSubtitle: 'Общественное порицаніе нерадивыхъ гражданъ и сомнительныхъ личностей.',
  },
  clean: {
    id: 'clean',
    name: 'Идальный Белый (Офис)',
    backgroundColor: '#f8fafc',
    cardColor: '#ffffff',
    accentColor: '#4f46e5',
    textColor: '#0f172a',
    textSecondaryColor: '#475569',
    borderStyle: 'solid',
    borderRadius: '16px',
    fontFamily: 'sans',
    gridColumns: '3',
    showBackgroundNoise: false,
    siteTitle: 'Корпоративная Доска Проступков',
    siteSubtitle: 'Укрепляем культуру прозрачности и командного юмора. Не косячь сам — научи другого.',
  },
  nordic: {
    id: 'nordic',
    name: 'Холодный Нордик',
    backgroundColor: '#0f172a',
    cardColor: '#1e293b',
    accentColor: '#38bdf8',
    textColor: '#f8fafc',
    textSecondaryColor: '#94a3b8',
    borderStyle: 'none',
    borderRadius: '24px',
    fontFamily: 'sans',
    gridColumns: '3',
    showBackgroundNoise: false,
    siteTitle: 'Скандинавский Салон Ошибок',
    siteSubtitle: 'Минималистичный реестр событий, которые пошли слегка не по плану.',
  },
};
