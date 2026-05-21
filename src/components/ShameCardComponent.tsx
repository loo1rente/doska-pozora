import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Edit3, Calendar, ShieldAlert, Award, GlassWater, Flame } from 'lucide-react';
import { ShameCard, ThemeSettings } from '../types';

interface ShameCardComponentProps {
  card: ShameCard;
  theme: ThemeSettings;
  isAdmin: boolean;
  onReact: (id: string, type: 'tomatoes' | 'facepalms' | 'forgiven') => void;
  onEdit: (card: ShameCard) => void;
  onDelete: (id: string) => void;
  index: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  emoji: string;
  angle: number;
  scale: number;
}

export const ShameCardComponent: React.FC<ShameCardComponentProps> = ({
  card,
  theme,
  isAdmin,
  onReact,
  onEdit,
  onDelete,
  index,
}) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [splats, setSplats] = useState<{ id: number; x: number; y: number }[]>([]);
  const [particleIdCounter, setParticleIdCounter] = useState(0);

  const spawnParticles = (e: React.MouseEvent<HTMLButtonElement>, emoji: string, type: 'tomatoes' | 'facepalms' | 'forgiven') => {
    // Perform real state increment
    onReact(card.id, type);

    const rect = e.currentTarget.getBoundingClientRect();
    // Coordinates relative to the window or button
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const newParticles: Particle[] = [];
    let count = 5;

    if (type === 'tomatoes') {
      count = 8;
      // Also spawn splat on photo container
      const splatId = Date.now();
      const photoSplatX = 30 + Math.random() * 40; // centered splat percentages
      const photoSplatY = 30 + Math.random() * 40;
      setSplats((prev) => [...prev, { id: splatId, x: photoSplatX, y: photoSplatY }]);
      setTimeout(() => {
        setSplats((prev) => prev.filter((s) => s.id !== splatId));
      }, 2500);
    }

    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 4 - (Math.random() * Math.PI) / 2; // arc upward
      newParticles.push({
        id: particleIdCounter + i,
        x: clickX,
        y: clickY,
        emoji,
        angle,
        scale: 0.8 + Math.random() * 0.7,
      });
    }

    setParticleIdCounter((prev) => prev + count);
    setParticles((prev) => [...prev, ...newParticles]);

    // Cleanup particles
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !newParticles.some((np) => np.id === p.id)));
    }, 1200);
  };

  const getSeverityAccent = (severity: string) => {
    switch (severity) {
      case 'epic':
        return {
          bg: 'bg-red-500/10 text-red-500 border border-red-500/30',
          label: '🔥 Эпический факап',
          icon: ShieldAlert,
        };
      case 'moderate':
        return {
          bg: 'bg-amber-500/10 text-amber-500 border border-amber-500/30',
          label: '⚡ Серьезный косяк',
          icon: Flame,
        };
      default:
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
          label: '👀 Мелкая оплошность',
          icon: GlassWater,
        };
    }
  };

  const severityInfo = getSeverityAccent(card.severity);
  const SeverityIcon = severityInfo.icon;

  // Build reactive styling styles
  const getBorderStyle = () => {
    switch (theme.borderStyle) {
      case 'dashed':
        return { border: `2px dashed ${theme.accentColor}40` };
      case 'solid':
        return { border: `1px solid ${theme.accentColor}30` };
      case 'neon':
        return {
          border: `2px solid ${theme.accentColor}`,
          boxShadow: `0 0 15px ${theme.accentColor}40, inset 0 0 10px ${theme.accentColor}15`,
        };
      default:
        return { border: 'none' };
    }
  };

  const getFontClass = () => {
    switch (theme.fontFamily) {
      case 'mono':
        return 'font-mono';
      case 'serif':
        return 'font-serif';
      case 'grotesk':
        return 'font-sans tracking-wide';
      default:
        return 'font-sans';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
      return new Date(dateStr).toLocaleDateString('ru-RU', options);
    } catch {
      return dateStr;
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      style={{
        backgroundColor: theme.cardColor,
        borderRadius: theme.borderRadius,
        color: theme.textColor,
        ...getBorderStyle(),
      }}
      className={`relative overflow-hidden transition-all duration-300 shadow-xl flex flex-col h-full ${getFontClass()}`}
      id={`shame-card-${card.id}`}
    >
      {/* Background card index number for Artistic style */}
      <div className="absolute top-0 right-0 p-3 text-7xl font-sans font-black select-none pointer-events-none z-0 opacity-10">
        {(index + 1).toString().padStart(2, '0')}
      </div>

      {/* Decorative Severity Banner top border for solid themes */}
      {theme.borderStyle !== 'neon' && (
        <div
          style={{
            backgroundColor:
              card.severity === 'epic'
                ? '#ef4444'
                : card.severity === 'moderate'
                ? '#f59e0b'
                : '#10b981',
          }}
          className="h-1 w-full"
        />
      )}

      {/* Admin Panel Actions */}
      {isAdmin && (
        <div className="absolute top-3 right-3 z-30 flex gap-2">
          <button
            onClick={() => onEdit(card)}
            className="p-1.5 rounded-lg bg-black/60 hover:bg-black/90 text-amber-400 transition-colors border border-amber-500/20"
            title="Редактировать запись"
            id={`btn-edit-${card.id}`}
          >
            <Edit3 size={15} />
          </button>
          <button
            onClick={() => onDelete(card.id)}
            className="p-1.5 rounded-lg bg-black/60 hover:bg-red-950 text-red-500 transition-colors border border-red-500/20"
            title="Удалить запись"
            id={`btn-delete-${card.id}`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}

      {/* Hero Visual Area: Image & Splats */}
      <div className="relative h-56 bg-slate-900/60 overflow-hidden select-none flex-shrink-0 group">
        <img
          src={card.photoUrl}
          alt={card.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          referrerPolicy="no-referrer"
          id={`card-img-${card.id}`}
        />
        {/* Shadow Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

        {/* Severity Badge */}
        <div className="absolute top-3 left-3 z-10">
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider backdrop-blur-md shadow-md flex items-center gap-1.5 ${severityInfo.bg}`}
          >
            <SeverityIcon size={12} className="flex-shrink-0" />
            <span>{severityInfo.label}</span>
          </span>
        </div>

        {/* Splash Tomato Splats */}
        <AnimatePresence>
          {splats.map((splat) => (
            <motion.div
              key={splat.id}
              initial={{ scale: 0, opacity: 0, rotate: Math.random() * 360 }}
              animate={{ scale: [0, 1.2, 1], opacity: [0, 0.9, 0.8] }}
              exit={{ opacity: 0, transition: { duration: 1 } }}
              style={{
                position: 'absolute',
                left: `${splat.x}%`,
                top: `${splat.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="pointer-events-none z-20"
            >
              {/* Juicy Red Paint Splash effect */}
              <div className="relative">
                <div className="absolute w-12 h-12 bg-red-600 rounded-full blur-xs opacity-75" style={{ transform: 'scale(1.2)' }} />
                <div className="absolute w-8 h-8 bg-red-500 rounded-full opacity-90 -translate-x-2 translate-y-1" />
                <div className="absolute w-10 h-6 bg-red-700 rounded-full opacity-80 translate-x-1 -translate-y-2" />
                <div className="absolute w-2 h-2 bg-red-400 rounded-full top-1 left-2" />
                <div className="absolute text-[18px] select-none -translate-x-1/2 -translate-y-1/2">🍅</div>
                <div className="absolute -top-4 -left-4 text-xs font-bold text-red-500 drop-shadow-md select-none rotate-12">SPLAT!</div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Content Area */}
      <div className="p-5 flex-grow flex flex-col justify-between">
        <div className="mb-4">
          <h3 className="text-xl font-bold tracking-tight mb-2 flex items-center justify-between">
            <span className="line-clamp-1">{card.name}</span>
          </h3>

          <p
            style={{ color: theme.textSecondaryColor }}
            className="text-sm leading-relaxed mb-4 whitespace-pre-wrap line-clamp-4 min-h-[5rem]"
          >
            {card.description}
          </p>
        </div>

        {/* Date and interactive buttons */}
        <div className="mt-auto pt-4 border-t border-zinc-700/20">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-4 font-mono">
            <Calendar size={13} />
            <span>Зафиксировано: {formatDate(card.date)}</span>
          </div>

          {/* Engagement panel */}
          <div className="grid grid-cols-3 gap-2 relative">
            {/* Flying action particles container */}
            <div className="absolute inset-0 pointer-events-none overflow-visible z-50">
              <AnimatePresence>
                {particles.map((p) => (
                  <motion.div
                    key={p.id}
                    initial={{ x: p.x, y: p.y, opacity: 1, scale: 0.5 }}
                    animate={{
                      x: p.x + Math.cos(p.angle) * (100 + Math.random() * 80),
                      y: p.y + Math.sin(p.angle) * (100 + Math.random() * 80) + 120, // gravity drop
                      opacity: [1, 1, 0],
                      scale: [p.scale, p.scale * 1.5, 0],
                    }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.1, ease: 'easeOut' }}
                    className="absolute text-xl"
                  >
                    {p.emoji}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* Reaction Buttons */}
            <button
              onClick={(e) => spawnParticles(e, '🍅', 'tomatoes')}
              style={{
                borderColor: `${theme.accentColor}30`,
              }}
              className="relative p-2.5 rounded-xl border bg-black/10 hover:bg-red-500/10 hover:scale-105 active:scale-95 transition-all text-center flex flex-col items-center justify-center cursor-pointer group"
              id={`btn-react-tomato-${card.id}`}
            >
              <span className="text-lg mb-1 group-hover:rotate-12 transition-transform duration-200">🍅</span>
              <span className="text-xs uppercase font-semibold text-red-500 tracking-wider">Кинуть</span>
              <span className="text-sm font-bold mt-1 text-red-400 font-mono">{card.tomatoes}</span>
            </button>

            <button
              onClick={(e) => spawnParticles(e, '🤦', 'facepalms')}
              style={{
                borderColor: `${theme.accentColor}30`,
              }}
              className="relative p-2.5 rounded-xl border bg-black/10 hover:bg-amber-600/10 hover:scale-105 active:scale-95 transition-all text-center flex flex-col items-center justify-center cursor-pointer group"
              id={`btn-react-facepalm-${card.id}`}
            >
              <span className="text-lg mb-1 group-hover:rotate-12 transition-transform duration-200">🤦</span>
              <span className="text-xs uppercase font-semibold text-amber-500 tracking-wider">Мдааа</span>
              <span className="text-sm font-bold mt-1 text-amber-400 font-mono">{card.facepalms}</span>
            </button>

            <button
              onClick={(e) => spawnParticles(e, '😇', 'forgiven')}
              style={{
                borderColor: `${theme.accentColor}30`,
              }}
              className="relative p-2.5 rounded-xl border bg-black/10 hover:bg-emerald-500/10 hover:scale-105 active:scale-95 transition-all text-center flex flex-col items-center justify-center cursor-pointer group"
              id={`btn-react-forgive-${card.id}`}
            >
              <span className="text-lg mb-1 group-hover:scale-110 transition-transform duration-200">🙏</span>
              <span className="text-xs uppercase font-semibold text-emerald-500 tracking-wider">Простить</span>
              <span className="text-sm font-bold mt-1 text-emerald-400 font-mono">{card.forgiven}</span>
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
