import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trash2, Edit3, Calendar, ShieldAlert, Award, GlassWater, Flame } from 'lucide-react';
import { ShameCard, ThemeSettings } from '../types';
import { playTomatoSound, playFacepalmSound, playKickSound } from '../utils/audioEffects';

interface ShameCardComponentProps {
  card: ShameCard;
  theme: ThemeSettings;
  isAdmin: boolean;
  onReact: (id: string, type: 'tomatoes' | 'facepalms' | 'forgiven') => void;
  onEdit: (card: ShameCard) => void;
  onDelete: (id: string) => void;
  onUpdateCard: (card: ShameCard) => void;
  index: number;
  cooldownSecondsLeft: number;
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
  onUpdateCard,
  index,
  cooldownSecondsLeft,
}) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [splats, setSplats] = useState<{ id: number; x: number; y: number }[]>([]);
  const [particleIdCounter, setParticleIdCounter] = useState(0);
  const [isKicking, setIsKicking] = useState(false);
  const [kickId, setKickId] = useState(0);

  // Collapsible CommentsTray and Nested Reply States
  const [showComments, setShowComments] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const getCommentCooldownTimeLeft = () => {
    const cooldownSecs = theme.commentCooldown ?? 15; // default 15s
    if (cooldownSecs <= 0) return 0;
    const lastTimeStr = localStorage.getItem('shame_last_comment_time');
    if (!lastTimeStr) return 0;
    const lastTime = parseInt(lastTimeStr, 10);
    if (isNaN(lastTime)) return 0;
    const elapsed = Date.now() - lastTime;
    const remaining = Math.ceil((cooldownSecs * 1000 - elapsed) / 1000);
    return remaining > 0 ? remaining : 0;
  };

  const [commentCooldownLeft, setCommentCooldownLeft] = useState(getCommentCooldownTimeLeft());

  React.useEffect(() => {
    const timer = setInterval(() => {
      const remainingVal = getCommentCooldownTimeLeft();
      setCommentCooldownLeft(remainingVal);
    }, 1000);
    return () => clearInterval(timer);
  }, [theme.commentCooldown]);

  const handleAddComment = (text: string, parentId?: string, replyToAuthor?: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    const nickname = localStorage.getItem('shame_user_nickname') || 'Фигурант';
    const isSpecial = ['terramata', 'mad'].includes(nickname.toLowerCase().trim());

    // Check cooldown
    const leftTime = getCommentCooldownTimeLeft();
    if (leftTime > 0 && !isSpecial) {
      setCommentError(`Подождите ещё ${leftTime} сек. перед комментированием!`);
      return;
    }

    const newComment = {
      id: Date.now().toString(),
      author: nickname,
      text: trimmed,
      date: new Date().toISOString(),
      parentId,
      replyToAuthor,
    };

    const updatedComments = [...(card.comments || []), newComment];
    onUpdateCard({
      ...card,
      comments: updatedComments,
    });

    // Record last comment time
    if (!isSpecial) {
      localStorage.setItem('shame_last_comment_time', Date.now().toString());
      setCommentCooldownLeft(theme.commentCooldown ?? 15);
    }
    setCommentError(null);
  };

  const canManageComment = (author: string) => {
    const nickname = (localStorage.getItem('shame_user_nickname') || 'Фигурант').toLowerCase().trim();
    const isAdmin = ['terramata', 'mad'].includes(nickname);
    return isAdmin || nickname === author.toLowerCase().trim();
  };

  const handleStartEdit = (commentId: string, text: string) => {
    const comment = card.comments?.find(c => c.id === commentId);
    if (!comment || !canManageComment(comment.author)) return;
    setEditingCommentId(commentId);
    setEditingText(text);
  };

  const handleSaveEdit = (commentId: string) => {
    const comment = card.comments?.find(c => c.id === commentId);
    if (!comment || !canManageComment(comment.author)) return;
    const trimmed = editingText.trim();
    if (!trimmed || !card.comments) return;
    const updatedComments = card.comments.map(c => {
      if (c.id === commentId) {
        return { ...c, text: trimmed };
      }
      return c;
    });
    onUpdateCard({
      ...card,
      comments: updatedComments,
    });
    setEditingCommentId(null);
    setEditingText('');
  };

  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditingText('');
  };

  const handleDeleteComment = (commentId: string) => {
    const comment = card.comments?.find(c => c.id === commentId);
    if (!comment || !canManageComment(comment.author)) return;
    if (!card.comments) return;
    // Filter out the deleted comment and its sub-replies
    const updatedComments = card.comments.filter(c => c.id !== commentId && c.parentId !== commentId);
    onUpdateCard({
      ...card,
      comments: updatedComments,
    });
  };

  const formatSecs = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const spawnParticles = (e: React.MouseEvent<HTMLButtonElement>, emoji: string, type: 'tomatoes' | 'facepalms' | 'forgiven') => {
    if (cooldownSecondsLeft > 0) return;

    // Perform real state increment
    onReact(card.id, type);

    const rect = e.currentTarget.getBoundingClientRect();
    // Coordinates relative to the window or button
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const newParticles: Particle[] = [];
    let count = 5;

    if (type === 'tomatoes') {
      playTomatoSound();
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

    if (type === 'facepalms') {
      playFacepalmSound();
    }

    if (type === 'forgiven') {
      playKickSound();
      // Trigger leg kick physical displacement state and id
      setIsKicking(true);
      setKickId((prev) => prev + 1);
      setTimeout(() => {
        setIsKicking(false);
      }, 800);
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
      transition={{ duration: 0.3 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={isKicking ? {} : { y: -4, transition: { duration: 0.2 } }}
      style={{
        backgroundColor: theme.cardColor,
        borderRadius: theme.borderRadius,
        color: theme.textColor,
        ...getBorderStyle(),
      }}
      className={`relative overflow-hidden shadow-xl flex flex-col h-full ${getFontClass()}`}
      id={`shame-card-${card.id}`}
    >
      <motion.div
        className="w-full h-full flex flex-col relative"
        animate={
          isKicking
            ? {
                x: [0, -25, 20, -15, 10, -4, 0],
                y: [0, -10, 8, -5, 3, 0],
                rotate: [0, -6, 5, -3, 2, 0],
                scale: [1, 1.03, 0.99, 1.01, 1],
              }
            : { x: 0, y: 0, rotate: 0, scale: 1 }
        }
        transition={
          isKicking
            ? { duration: 0.6, ease: "easeOut" }
            : { duration: 0.3 }
        }
      >
      {/* Physical giant leg kick comic animation overlay */}
      <AnimatePresence>
        {isKicking && (
          <>
            <motion.div
              key={`leg-${kickId}`}
              initial={{ x: -180, y: 180, rotate: -45, opacity: 0, scale: 0.5 }}
              animate={{
                x: [-180, 50, -180],
                y: [180, -50, 180],
                rotate: [-45, 18, -45],
                opacity: [0, 1, 1, 0],
                scale: [0.5, 2.3, 0.5],
              }}
              transition={{
                duration: 0.55,
                times: [0, 0.35, 1],
                ease: "easeInOut",
              }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-40 select-none text-[160px]"
            >
              🦵
            </motion.div>
            <motion.div
              key={`impact-${kickId}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 2.0, 0],
                opacity: [0, 1, 0],
              }}
              transition={{
                duration: 0.4,
                delay: 0.16,
              }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none z-50 select-none text-8xl"
            >
              💥
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
      <div className="relative h-56 bg-slate-950 overflow-hidden select-none flex-shrink-0 group">
        {/* Ambient blurred backdrop glow */}
        <img
          src={card.photoUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover blur-xl opacity-40 scale-110 pointer-events-none transition-transform duration-500 group-hover:scale-115"
          referrerPolicy="no-referrer"
        />

        {/* Main crisp full-visibility image */}
        <img
          src={card.photoUrl}
          alt={card.name}
          className="relative w-full h-full object-contain transition-transform duration-500 group-hover:scale-102 z-10"
          referrerPolicy="no-referrer"
          id={`card-img-${card.id}`}
        />
        {/* Shadow Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none z-10" />

        {/* Severity Badge */}
        <div className="absolute top-3 left-3 z-20">
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
              disabled={cooldownSecondsLeft > 0}
              style={{
                borderColor: `${theme.accentColor}30`,
              }}
              className={`relative p-2.5 rounded-xl border bg-black/10 transition-all text-center flex flex-col items-center justify-center group ${
                cooldownSecondsLeft > 0
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:bg-red-500/10 hover:scale-105 active:scale-95 cursor-pointer'
              }`}
              id={`btn-react-tomato-${card.id}`}
            >
              <span className="text-lg mb-1 group-hover:rotate-12 transition-transform duration-200">🍅</span>
              <span className={`text-xs uppercase font-semibold tracking-wider ${cooldownSecondsLeft > 0 ? 'text-zinc-500 font-mono text-[10px]' : 'text-red-500'}`}>
                {cooldownSecondsLeft > 0 ? formatSecs(cooldownSecondsLeft) : 'Кинуть'}
              </span>
              <span className="text-sm font-bold mt-1 text-red-400 font-mono">{card.tomatoes}</span>
            </button>

            <button
              onClick={(e) => spawnParticles(e, '🤦', 'facepalms')}
              disabled={cooldownSecondsLeft > 0}
              style={{
                borderColor: `${theme.accentColor}30`,
              }}
              className={`relative p-2.5 rounded-xl border bg-black/10 transition-all text-center flex flex-col items-center justify-center group ${
                cooldownSecondsLeft > 0
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:bg-amber-600/10 hover:scale-105 active:scale-95 cursor-pointer'
              }`}
              id={`btn-react-facepalm-${card.id}`}
            >
              <span className="text-lg mb-1 group-hover:rotate-12 transition-transform duration-200">🤦</span>
              <span className={`text-xs uppercase font-semibold tracking-wider ${cooldownSecondsLeft > 0 ? 'text-zinc-500 font-mono text-[10px]' : 'text-amber-500'}`}>
                {cooldownSecondsLeft > 0 ? formatSecs(cooldownSecondsLeft) : 'Мдааа'}
              </span>
              <span className="text-sm font-bold mt-1 text-amber-400 font-mono">{card.facepalms}</span>
            </button>

            <button
              onClick={(e) => spawnParticles(e, '🥾', 'forgiven')}
              disabled={cooldownSecondsLeft > 0}
              style={{
                borderColor: `${theme.accentColor}30`,
              }}
              className={`relative p-2.5 rounded-xl border bg-black/10 transition-all text-center flex flex-col items-center justify-center group ${
                cooldownSecondsLeft > 0
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:bg-indigo-500/10 hover:scale-105 active:scale-95 cursor-pointer'
              }`}
              id={`btn-react-kick-${card.id}`}
            >
              <span className="text-lg mb-1 group-hover:scale-110 group-hover:rotate-12 transition-transform duration-200">🥾</span>
              <span className={`text-xs uppercase font-semibold tracking-wider ${cooldownSecondsLeft > 0 ? 'text-zinc-500 font-mono text-[10px]' : 'text-indigo-400'}`}>
                {cooldownSecondsLeft > 0 ? formatSecs(cooldownSecondsLeft) : 'Испинать'}
              </span>
              <span className="text-sm font-bold mt-1 text-indigo-300 font-mono">{card.forgiven}</span>
            </button>
          </div>

          {/* Comments Toggle Button */}
          <div className="mt-4 pt-3.5 border-t border-zinc-800/25 flex items-center justify-between text-xs font-mono">
            <button
              onClick={() => setShowComments(!showComments)}
              style={{ color: showComments ? theme.accentColor : 'inherit' }}
              className="flex items-center gap-1.5 font-bold hover:opacity-85 cursor-pointer transition-all uppercase tracking-wider text-[11px]"
              id={`toggle-comments-${card.id}`}
            >
              <span>💬</span>
              <span>
                {showComments ? 'Скрыть комменты' : `Комменты (${card.comments?.length || 0})`}
              </span>
            </button>
          </div>

          {/* Collapsible Comments Tray with nested replies support */}
          <AnimatePresence>
            {showComments && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                className="mt-3 space-y-3 overflow-hidden"
              >
                {/* List of comments */}
                <div className="max-h-52 overflow-y-auto space-y-2 pr-1 text-left">
                  {(!card.comments || card.comments.length === 0) ? (
                    <p className="text-[10px] text-zinc-500 italic text-center py-2 font-sans">
                      Ещё никто не порицал. Напишите первый коммент!
                    </p>
                  ) : (
                    card.comments
                      .filter(com => !com.parentId) // Top-level
                      .map(rootCom => {
                        const replies = card.comments!.filter(reply => reply.parentId === rootCom.id);
                        return (
                          <div key={rootCom.id} className="space-y-1.5 border-b border-zinc-800/10 pb-2 last:border-none">
                            {/* Top level comment */}
                            <div className="bg-black/10 p-2 rounded-lg border border-zinc-800/20 relative">
                              <div className="flex items-center justify-between mb-0.5">
                                <span className="font-bold text-[10px] text-white flex items-center gap-1 font-mono">
                                  {rootCom.author}
                                  {['terramata', 'mad'].includes(rootCom.author.toLowerCase().trim()) && (
                                    <span className="text-[7px] tracking-wide bg-red-500/10 text-red-500 px-1 py-px rounded border border-red-500/20 font-black">ADMIN</span>
                                  )}
                                </span>
                                <span className="text-[8px] text-zinc-500 font-mono">
                                  {new Date(rootCom.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              {editingCommentId === rootCom.id ? (
                                <div className="space-y-1.5 mt-1">
                                  <input
                                    type="text"
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-800 px-2 py-1.5 rounded-lg text-[11px] text-white focus:outline-none focus:border-red-500 font-sans"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') handleSaveEdit(rootCom.id);
                                      if (e.key === 'Escape') handleCancelEdit();
                                    }}
                                  />
                                  <div className="flex justify-end gap-1.5">
                                    <button
                                      onClick={handleCancelEdit}
                                      className="px-2 py-0.5 text-[8px] font-bold uppercase rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 cursor-pointer"
                                    >
                                      Отмена
                                    </button>
                                    <button
                                      onClick={() => handleSaveEdit(rootCom.id)}
                                      className="px-2 py-0.5 text-[8px] font-bold uppercase rounded bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer"
                                    >
                                      Сохранить
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-[11px] text-zinc-300 font-sans break-words bg-transparent">{rootCom.text}</p>
                              )}
                              
                              {/* Reply Trigger & Actions */}
                              <div className="mt-1 flex items-center justify-end gap-2.5">
                                {canManageComment(rootCom.author) && (
                                  <>
                                    <button
                                      onClick={() => handleStartEdit(rootCom.id, rootCom.text)}
                                      className="text-[9px] text-zinc-550 hover:text-zinc-300 cursor-pointer flex items-center gap-0.5 font-semibold"
                                      title="Редактировать"
                                    >
                                      <Edit3 size={9} /> Редактировать
                                    </button>
                                    <button
                                      onClick={() => handleDeleteComment(rootCom.id)}
                                      className="text-[9px] text-red-500/70 hover:text-red-400 cursor-pointer flex items-center gap-0.5 font-semibold font-mono"
                                      title="Удалить"
                                    >
                                      <Trash2 size={9} /> Удалить
                                    </button>
                                  </>
                                )}
                                <button
                                  onClick={() => {
                                    if (replyingToId === rootCom.id) {
                                      setReplyingToId(null);
                                    } else {
                                      setReplyingToId(rootCom.id);
                                      setReplyText('');
                                    }
                                  }}
                                  className="text-[9px] text-zinc-500 hover:text-zinc-300 cursor-pointer bg-transparent border-none font-semibold"
                                >
                                  {replyingToId === rootCom.id ? 'Отмена' : 'Ответить'}
                                </button>
                              </div>
                            </div>

                            {/* Reply Form for Top Level */}
                            {replyingToId === rootCom.id && (
                              <div className="ml-4 flex gap-1.5 items-center">
                                <input
                                  type="text"
                                  disabled={commentCooldownLeft > 0 && !['terramata', 'mad'].includes((localStorage.getItem('shame_user_nickname') || '').toLowerCase().trim())}
                                  placeholder={commentCooldownLeft > 0 && !['terramata', 'mad'].includes((localStorage.getItem('shame_user_nickname') || '').toLowerCase().trim())
                                    ? `Охлаждение... (${commentCooldownLeft}s)`
                                    : `Ответить ${rootCom.author}...`}
                                  value={replyText}
                                  onChange={(e) => setReplyText(e.target.value)}
                                  className="flex-grow bg-zinc-950/80 border border-zinc-800 px-2 py-1 rounded text-[11px] text-white focus:outline-none focus:border-red-500 placeholder-zinc-600 font-sans disabled:opacity-50"
                                />
                                <button
                                  disabled={commentCooldownLeft > 0 && !['terramata', 'mad'].includes((localStorage.getItem('shame_user_nickname') || '').toLowerCase().trim())}
                                  onClick={() => {
                                    if (replyText.trim()) {
                                      handleAddComment(replyText, rootCom.id, rootCom.author);
                                      setReplyText('');
                                      setReplyingToId(null);
                                    }
                                  }}
                                  className="px-2 py-1 rounded bg-red-650 hover:bg-red-700 text-[9px] text-white font-bold uppercase shrink-0 cursor-pointer disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500"
                                >
                                  ОК
                                </button>
                              </div>
                            )}

                            {/* Indented Replies */}
                            {replies.length > 0 && (
                              <div className="ml-4 pl-2 border-l border-zinc-800/40 space-y-1">
                                {replies.map(reply => (
                                  <div key={reply.id} className="bg-black/20 p-1.5 rounded border border-zinc-850/10 relative">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="font-semibold text-[9px] text-zinc-300 flex items-center gap-1 font-mono flex-wrap">
                                        <span>{reply.author}</span>
                                        {reply.replyToAuthor && (
                                          <>
                                            <span className="text-[8px] text-zinc-500 font-normal">→</span>
                                            <span className="text-[8px] text-zinc-400 font-bold bg-zinc-800/60 px-1 rounded">{reply.replyToAuthor}</span>
                                          </>
                                        )}
                                        {['terramata', 'mad'].includes(reply.author.toLowerCase().trim()) && (
                                          <span className="text-[6px] tracking-wider bg-red-500/10 text-red-500 px-0.5 rounded border border-red-500/20 font-black">ADMIN</span>
                                        )}
                                      </span>
                                      <span className="text-[7px] text-zinc-500 font-mono">
                                        {new Date(reply.date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                    {editingCommentId === reply.id ? (
                                      <div className="space-y-1.5 mt-1">
                                        <input
                                          type="text"
                                          value={editingText}
                                          onChange={(e) => setEditingText(e.target.value)}
                                          className="w-full bg-zinc-950 border border-zinc-850 px-2 py-1 rounded text-[10px] text-white focus:outline-none focus:border-red-500 font-sans"
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') handleSaveEdit(reply.id);
                                            if (e.key === 'Escape') handleCancelEdit();
                                          }}
                                        />
                                        <div className="flex justify-end gap-1.5">
                                          <button
                                            onClick={handleCancelEdit}
                                            className="px-1.5 py-0.5 text-[7px] font-bold uppercase rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 cursor-pointer"
                                          >
                                            Отмена
                                          </button>
                                          <button
                                            onClick={() => handleSaveEdit(reply.id)}
                                            className="px-1.5 py-0.5 text-[7px] font-bold uppercase rounded bg-emerald-700 hover:bg-emerald-600 text-white cursor-pointer"
                                          >
                                            Сохранить
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <p className="text-[10px] text-zinc-400 font-sans break-words bg-transparent">{reply.text}</p>
                                    )}
                                    
                                    {/* Action buttons to edit, delete and reply */}
                                    <div className="mt-1 flex items-center justify-end gap-2.5">
                                      {canManageComment(reply.author) && (
                                        <>
                                          <button
                                            onClick={() => handleStartEdit(reply.id, reply.text)}
                                            className="text-[8px] text-zinc-550 hover:text-zinc-300 cursor-pointer flex items-center gap-0.5 font-semibold"
                                            title="Редактировать"
                                          >
                                            <Edit3 size={8} /> Изменить
                                          </button>
                                          <button
                                            onClick={() => handleDeleteComment(reply.id)}
                                            className="text-[8px] text-red-500/70 hover:text-red-400 cursor-pointer flex items-center gap-0.5 font-semibold font-mono"
                                            title="Удалить"
                                          >
                                            <Trash2 size={8} /> Удалить
                                          </button>
                                        </>
                                      )}
                                      <button
                                        onClick={() => {
                                          if (replyingToId === reply.id) {
                                            setReplyingToId(null);
                                          } else {
                                            setReplyingToId(reply.id);
                                            setReplyText('');
                                          }
                                        }}
                                        className="text-[8px] text-zinc-500 hover:text-zinc-300 cursor-pointer bg-transparent border-none font-semibold"
                                      >
                                        {replyingToId === reply.id ? 'Отмена' : 'Ответить'}
                                      </button>
                                    </div>

                                    {/* Sub-reply input form */}
                                    {replyingToId === reply.id && (
                                      <div className="mt-1.5 flex gap-1 items-center">
                                        <input
                                          type="text"
                                          disabled={commentCooldownLeft > 0 && !['terramata', 'mad'].includes((localStorage.getItem('shame_user_nickname') || '').toLowerCase().trim())}
                                          placeholder={commentCooldownLeft > 0 && !['terramata', 'mad'].includes((localStorage.getItem('shame_user_nickname') || '').toLowerCase().trim())
                                            ? `Охлаждение... (${commentCooldownLeft}s)`
                                            : `Ответить ${reply.author}...`}
                                          value={replyText}
                                          onChange={(e) => setReplyText(e.target.value)}
                                          className="flex-grow bg-zinc-950 border border-zinc-800 px-1.5 py-0.5 rounded text-[10px] text-white focus:outline-none focus:border-red-500 placeholder-zinc-650 font-sans disabled:opacity-50"
                                        />
                                        <button
                                          disabled={commentCooldownLeft > 0 && !['terramata', 'mad'].includes((localStorage.getItem('shame_user_nickname') || '').toLowerCase().trim())}
                                          onClick={() => {
                                            if (replyText.trim()) {
                                              // We pass rootCom.id as parentId to keep it inside this thread, and target sub-author
                                              handleAddComment(replyText, rootCom.id, reply.author);
                                              setReplyText('');
                                              setReplyingToId(null);
                                            }
                                          }}
                                          className="px-1.5 py-0.5 rounded bg-red-650 hover:bg-red-700 text-[8px] text-white font-bold uppercase shrink-0 cursor-pointer disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500"
                                        >
                                          ОК
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                  )}
                </div>

                {/* Root New Comment Form input */}
                <div className="flex flex-col gap-1 pt-2 border-t border-zinc-850/40">
                  {commentError && (
                    <p className="text-[10px] text-red-500 font-medium font-mono mb-1">{commentError}</p>
                  )}
                  <div className="flex gap-1.5 items-center">
                    <input
                      type="text"
                      disabled={commentCooldownLeft > 0 && !['terramata', 'mad'].includes((localStorage.getItem('shame_user_nickname') || '').toLowerCase().trim())}
                      placeholder={commentCooldownLeft > 0 && !['terramata', 'mad'].includes((localStorage.getItem('shame_user_nickname') || '').toLowerCase().trim())
                        ? `Охлаждение комментов... (${commentCooldownLeft}s)`
                        : "Написать порицание..."}
                      value={newCommentText}
                      onChange={(e) => {
                        setNewCommentText(e.target.value);
                        setCommentError(null);
                      }}
                      className="flex-grow bg-zinc-950 border border-zinc-800 px-2 py-1.5 rounded-lg text-[11px] text-white focus:outline-none focus:border-red-500 placeholder-zinc-650 font-sans disabled:opacity-50"
                      id={`input-new-comment-${card.id}`}
                    />
                    <button
                      disabled={commentCooldownLeft > 0 && !['terramata', 'mad'].includes((localStorage.getItem('shame_user_nickname') || '').toLowerCase().trim())}
                      onClick={() => {
                        if (newCommentText.trim()) {
                          handleAddComment(newCommentText);
                          setNewCommentText('');
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-red-650 hover:bg-red-700 text-[10px] text-white font-extrabold uppercase shrink-0 cursor-pointer font-mono disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500"
                      id={`btn-post-comment-${card.id}`}
                    >
                      ОК
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      </motion.div>
    </motion.div>
  );
};
