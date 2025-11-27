import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Player, Platform, Human, InputState, Particle, Item, Projectile } from '../types';

// --- CONFIGURATION ---
const ROUND_TIME = 180; // 3 minutes
const TOTAL_ROUNDS = 33;
const BASE_SKIN_COST = 1000;

// Game Constants
const GRAVITY = 0.6;
const JUMP_FORCE = -14;
const FRICTION = 0.85;
const MAX_FALL_SPEED = 12;

const BURGER_WIDTH = 40;
const BURGER_HEIGHT = 36;
const HUMAN_WIDTH = 16;
const HUMAN_HEIGHT = 24;

const PLAYER_MAX_HP = 100;
const HUMAN_DAMAGE = 15;
const EAT_HEAL = 20;
const SPEED_BOOST_DURATION = 12; // seconds
const BASE_SPEED = 0.8;
const BOOST_SPEED = 1.4;

interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  vy: number;
}

interface SkinData {
  id: number;
  name: string;
  colors: {
    bun: string;
    patty: string;
    lettuce: string;
    cheese: string;
    seeds: string;
  };
}

// Generate 33 Unique Skins
const SKINS: SkinData[] = Array.from({ length: 33 }, (_, i) => {
  if (i === 0) {
    return {
      id: 0,
      name: "Классика",
      colors: { bun: '#d4a373', patty: '#78350f', lettuce: '#4ade80', cheese: '#facc15', seeds: '#fde047' }
    };
  }
  const hue = (i * 137.5) % 360; 
  return {
    id: i,
    name: `Скин #${i + 1}`,
    colors: {
      bun: `hsl(${hue}, 70%, 60%)`,
      patty: `hsl(${(hue + 180) % 360}, 60%, 30%)`,
      lettuce: `hsl(${(hue + 90) % 360}, 80%, 50%)`,
      cheese: `hsl(${(hue - 45) % 360}, 90%, 60%)`,
      seeds: '#ffffff'
    }
  };
});

type GameState = 'MENU' | 'PLAYING' | 'SHOP' | 'SKINS' | 'VICTORY' | 'GAME_OVER';

const Game: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>();
  
  // Game Logic State
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<GameState>('MENU');
  // Track previous state for "Back" button functionality (to return to Pause or Shop)
  const [prevGameState, setPrevGameState] = useState<GameState>('MENU');
  
  const [currentRound, setCurrentRound] = useState(1);
  const [timeLeft, setTimeLeft] = useState(ROUND_TIME);
  const [ownedSkins, setOwnedSkins] = useState<number[]>([0]);
  const [currentSkinId, setCurrentSkinId] = useState(0);
  const [showMobileControls, setShowMobileControls] = useState(false);

  // Audio Context Ref
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Mutable Game State
  const gameStateRef = useRef<GameState>('MENU');
  const timeRef = useRef<number>(ROUND_TIME);
  const lastTimeRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);

  const playerRef = useRef<Player>({
    x: 100, y: 100, w: BURGER_WIDTH, h: BURGER_HEIGHT,
    vx: 0, vy: 0, isGrounded: false, facingRight: true, frame: 0,
    hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP, speedTimer: 0
  });

  const platformsRef = useRef<Platform[]>([]);
  const humansRef = useRef<Human[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  
  const inputRef = useRef<InputState>({ left: false, right: false, jump: false });

  // Mobile Control Refs
  const joystickRef = useRef<{
    active: boolean; id: number | null;
    originX: number; originY: number;
    currentX: number; currentY: number;
  }>({ active: false, id: null, originX: 0, originY: 0, currentX: 0, currentY: 0 });

  const jumpBtnRef = useRef<{ active: boolean; id: number | null }>({ active: false, id: null });

  // Sync refs
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
  useEffect(() => { scoreRef.current = score; }, [score]);

  // Sound Synth
  const playSound = useCallback((type: 'jump' | 'eat' | 'start' | 'round_end' | 'buy' | 'shoot' | 'hit' | 'powerup') => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;

    switch(type) {
      case 'jump':
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'eat':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      case 'start':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
        break;
      case 'round_end':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(440, now + 0.2);
        osc.frequency.setValueAtTime(880, now + 0.4);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 1);
        osc.start(now);
        osc.stop(now + 1);
        break;
      case 'buy':
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'shoot':
        osc.type = 'square';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'hit':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'powerup':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
    }
  }, []);

  const startRound = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    playerRef.current.x = canvas.width / 2;
    playerRef.current.y = canvas.height / 2;
    playerRef.current.vx = 0;
    playerRef.current.vy = 0;
    playerRef.current.hp = PLAYER_MAX_HP;
    playerRef.current.speedTimer = 0;

    const platforms: Platform[] = [];
    platforms.push({ x: 0, y: canvas.height - 40, w: canvas.width, h: 40, type: 'ground' });
    
    const numPlatforms = 6 + Math.min(5, Math.floor(currentRound / 3));
    const sectionHeight = (canvas.height - 100) / numPlatforms;
    
    for (let i = 0; i < numPlatforms; i++) {
      platforms.push({
        x: Math.random() * (canvas.width - 200),
        y: canvas.height - 150 - (i * sectionHeight),
        w: 100 + Math.random() * 100,
        h: 20,
        type: 'floating'
      });
    }
    platformsRef.current = platforms;

    humansRef.current = [];
    spawnHumans(canvas.width, canvas.height, 5 + Math.floor(currentRound * 0.5));
    particlesRef.current = [];
    floatingTextsRef.current = [];
    itemsRef.current = [];
    projectilesRef.current = [];
    
    timeRef.current = ROUND_TIME;
    setTimeLeft(ROUND_TIME);
    
    setGameState('PLAYING');
    playSound('start');
  }, [currentRound, playSound]);

  const spawnHumans = (cw: number, ch: number, count: number) => {
    const colors = ['#f87171', '#60a5fa', '#4ade80', '#facc15', '#c084fc'];
    for (let i = 0; i < count; i++) {
      humansRef.current.push({
        x: Math.random() * (cw - HUMAN_WIDTH),
        y: Math.random() * (ch - 200),
        w: HUMAN_WIDTH,
        h: HUMAN_HEIGHT,
        vx: Math.random() > 0.5 ? 2 + (currentRound * 0.1) : -2 - (currentRound * 0.1),
        direction: 1,
        panicLevel: 0,
        color: colors[Math.floor(Math.random() * colors.length)],
        frame: Math.random() * 10,
        hasWeapon: false,
        shootCooldown: 0
      });
    }
  };

  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const speed = Math.random() * 4 + 2;
      particlesRef.current.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color: color,
        size: Math.random() * 6 + 3
      });
    }
  };

  const createFloatingText = (x: number, y: number, text: string, color: string = '#fbbf24') => {
    floatingTextsRef.current.push({ x, y, text, life: 1.0, vy: -2 });
  };

  const drawPixelRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));
  };

  const drawBurger = (ctx: CanvasRenderingContext2D, p: Player, skinId: number) => {
    const { x, y, w, h, facingRight } = p;
    const skin = SKINS[skinId] || SKINS[0];
    const colors = skin.colors;

    // Blink if hit
    if (gameStateRef.current === 'PLAYING' && Math.random() < 0.1 && p.hp < 30) {
        ctx.globalAlpha = 0.5;
    }

    let sy = 0; let sx = 0;
    if (Math.abs(p.vy) > 1) { sy = Math.sign(p.vy) * 2; sx = -Math.sign(p.vy) * 2; }

    const dw = w + sx; const dh = h + sy;
    const dx = x - sx/2; const dy = y - sy;

    drawPixelRect(ctx, dx, dy, dw, dh * 0.35, colors.bun); 
    if (p.frame % 20 < 10) {
        drawPixelRect(ctx, dx + 8, dy + 4, 2, 2, colors.seeds);
        drawPixelRect(ctx, dx + 20, dy + 6, 2, 2, colors.seeds);
        drawPixelRect(ctx, dx + 32, dy + 4, 2, 2, colors.seeds);
    }
    drawPixelRect(ctx, dx - 2, dy + dh * 0.35, dw + 4, dh * 0.15, colors.lettuce);
    drawPixelRect(ctx, dx - 1, dy + dh * 0.5, dw + 2, dh * 0.1, colors.cheese);
    drawPixelRect(ctx, dx + 6, dy + dh * 0.6, 4, 4, colors.cheese); 
    drawPixelRect(ctx, dx, dy + dh * 0.6, dw, dh * 0.25, colors.patty);
    drawPixelRect(ctx, dx + 2, dy + dh * 0.85, dw - 4, dh * 0.15, colors.bun);
    
    const eyeX = facingRight ? dx + dw - 14 : dx + 6;
    drawPixelRect(ctx, eyeX, dy + 12, 8, 4, '#000');
    drawPixelRect(ctx, eyeX + (facingRight ? 4 : 0), dy + 13, 2, 2, '#fff');
    drawPixelRect(ctx, eyeX - 1, dy + 9, 10, 2, colors.patty);

    const walkOffset = Math.sin(Date.now() / 60) * 5;
    const legX = (Math.abs(p.vx) > 0.1 && p.isGrounded) ? walkOffset : 0;
    drawPixelRect(ctx, dx + 8 + legX, dy + dh, 4, 6, colors.bun);
    drawPixelRect(ctx, dx + dw - 12 - legX, dy + dh, 4, 6, colors.bun);

    // Speed boost visual
    if (p.speedTimer > 0) {
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(dx - 5, dy - 5, dw + 10, dh + 10);
    }
    ctx.globalAlpha = 1;
  };

  const drawHuman = (ctx: CanvasRenderingContext2D, h: Human, playerX: number) => {
    const bob = Math.sin(Date.now() / 100 + h.x) * 2;
    const dy = h.y + bob;
    
    // Body
    drawPixelRect(ctx, h.x + 4, dy, 8, 8, '#fca5a5'); 
    
    // Eyes
    if (h.panicLevel > 0) {
        drawPixelRect(ctx, h.x + 5, dy + 2, 1, 1, '#000');
        drawPixelRect(ctx, h.x + 9, dy + 2, 1, 1, '#000');
        drawPixelRect(ctx, h.x + 6, dy + 5, 4, 2, '#000');
    } else {
        drawPixelRect(ctx, h.x + 6, dy + 3, 1, 1, '#000');
        drawPixelRect(ctx, h.x + 9, dy + 3, 1, 1, '#000');
    }

    // Shirt
    drawPixelRect(ctx, h.x + 2, dy + 8, 12, 10, h.color); 
    
    // Arms
    if (h.hasWeapon) {
        // Aim at player
        const isAimingRight = playerX > h.x;
        const gunX = isAimingRight ? h.x + 10 : h.x - 4;
        drawPixelRect(ctx, gunX, dy + 10, 8, 4, '#333'); // Gun
        drawPixelRect(ctx, isAimingRight ? h.x + 10 : h.x, dy + 9, 4, 2, h.color); // Arm holding gun
    } else {
         if (h.panicLevel > 0) {
            drawPixelRect(ctx, h.x - 1, dy + 6, 3, 8, h.color);
            drawPixelRect(ctx, h.x + 14, dy + 6, 3, 8, h.color);
        } else {
            drawPixelRect(ctx, h.x, dy + 9, 2, 8, h.color);
            drawPixelRect(ctx, h.x + 14, dy + 9, 2, 8, h.color);
        }
    }

    // Legs
    drawPixelRect(ctx, h.x + 3, dy + 18, 4, 6, '#334155'); 
    drawPixelRect(ctx, h.x + 9, dy + 18, 4, 6, '#334155');
  };

  const drawItem = (ctx: CanvasRenderingContext2D, item: Item) => {
    if (item.type === 'weapon') {
        drawPixelRect(ctx, item.x, item.y, item.w, item.h, '#4b5563'); // Grey gun
        drawPixelRect(ctx, item.x + 4, item.y + 4, 4, 4, '#000');
    } else if (item.type === 'speed_box') {
        drawPixelRect(ctx, item.x, item.y, item.w, item.h, '#0ea5e9'); // Blue box
        // Yellow bolt
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.moveTo(item.x + item.w/2 + 2, item.y + 2);
        ctx.lineTo(item.x + 4, item.y + item.h/2);
        ctx.lineTo(item.x + item.w/2, item.y + item.h/2);
        ctx.lineTo(item.x + item.w/2 - 2, item.y + item.h - 2);
        ctx.lineTo(item.x + item.w - 4, item.y + item.h/2);
        ctx.lineTo(item.x + item.w/2, item.y + item.h/2);
        ctx.fill();
    }
  };

  const drawControls = (ctx: CanvasRenderingContext2D) => {
    if (!showMobileControls || gameState !== 'PLAYING') return;
    if (joystickRef.current.active) {
        const { originX, originY, currentX, currentY } = joystickRef.current;
        ctx.beginPath();
        ctx.arc(originX, originY, 40, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(currentX, currentY, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fill();
    } else {
        ctx.beginPath();
        ctx.arc(80, ctx.canvas.height - 80, 30, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    const btnX = ctx.canvas.width - 80;
    const btnY = ctx.canvas.height - 80;
    ctx.beginPath();
    ctx.arc(btnX, btnY, 35, 0, Math.PI * 2);
    ctx.fillStyle = jumpBtnRef.current.active ? 'rgba(251, 191, 36, 0.6)' : 'rgba(251, 191, 36, 0.3)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ПРЫЖОК', btnX, btnY);
  };

  const drawHUD = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, ctx.canvas.width, 60);

    // Score
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillStyle = '#facc15';
    ctx.textAlign = 'left';
    ctx.fillText(`$${scoreRef.current}`, 20, 32);

    // Time
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    const min = Math.floor(timeRef.current / 60);
    const sec = Math.floor(timeRef.current % 60);
    ctx.fillText(`${min}:${sec.toString().padStart(2, '0')}`, ctx.canvas.width / 2, 32);

    // Round
    ctx.textAlign = 'right';
    ctx.fillText(`РАУНД ${currentRound}/${TOTAL_ROUNDS}`, ctx.canvas.width - 20, 32);

    // Health Bar
    const hpPercent = playerRef.current.hp / playerRef.current.maxHp;
    ctx.fillStyle = '#ef4444'; // Red bg
    ctx.fillRect(20, 42, 200, 10);
    ctx.fillStyle = '#22c55e'; // Green fg
    ctx.fillRect(20, 42, 200 * hpPercent, 10);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(20, 42, 200, 10);
    
    // Speed Boost Timer
    if (playerRef.current.speedTimer > 0) {
        ctx.fillStyle = '#00ffff';
        ctx.textAlign = 'left';
        ctx.fillText(`УСКОРЕНИЕ: ${Math.ceil(playerRef.current.speedTimer)}`, 20, 80);
    }
  };

  const update = useCallback((time: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dt = (time - lastTimeRef.current) / 1000;
    lastTimeRef.current = time;

    ctx.fillStyle = '#171717';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#262626';
    for(let i=0; i<10; i++) {
        ctx.fillRect((canvas.width * i * 0.13) % canvas.width, (canvas.height * i * 0.27) % canvas.height, 4, 4);
    }

    if (gameStateRef.current === 'PLAYING') {
        timeRef.current -= dt;
        if (timeRef.current <= 0) {
            timeRef.current = 0;
            if (currentRound >= TOTAL_ROUNDS) {
                setGameState('VICTORY');
                playSound('round_end');
            } else {
                setGameState('SHOP');
                playSound('round_end');
            }
        }
        if (Math.floor(timeRef.current) !== Math.floor(timeLeft)) setTimeLeft(timeRef.current);

        const player = playerRef.current;

        // Speed Boost Logic
        if (player.speedTimer > 0) {
            player.speedTimer -= dt;
        }
        const speedMultiplier = player.speedTimer > 0 ? BOOST_SPEED : BASE_SPEED;

        if (inputRef.current.left) { player.vx -= speedMultiplier; player.facingRight = false; }
        if (inputRef.current.right) { player.vx += speedMultiplier; player.facingRight = true; }
        
        player.vx *= FRICTION;
        player.vy += GRAVITY;
        player.vy = Math.min(player.vy, MAX_FALL_SPEED);

        if (inputRef.current.jump && player.isGrounded) {
            player.vy = JUMP_FORCE;
            player.isGrounded = false;
            playSound('jump');
            for(let i=0; i<5; i++) {
                particlesRef.current.push({
                    x: player.x + player.w/2, y: player.y + player.h,
                    vx: (Math.random() - 0.5) * 4, vy: (Math.random() * -2),
                    life: 0.8, color: '#fff', size: Math.random() * 4
                });
            }
        }

        player.x += player.vx;
        player.y += player.vy;

        if (player.x > canvas.width) player.x = -player.w;
        if (player.x + player.w < 0) player.x = canvas.width;

        player.isGrounded = false;
        platformsRef.current.forEach(plat => {
            const prevY = player.y - player.vy;
            if (player.x < plat.x + plat.w && player.x + player.w > plat.x &&
                player.y + player.h >= plat.y && player.y + player.h <= plat.y + plat.h + 15 &&
                prevY + player.h <= plat.y + 15 && player.vy >= 0) {
                player.y = plat.y - player.h;
                player.vy = 0;
                player.isGrounded = true;
            }
        });
        if (player.y > canvas.height + 50) { player.y = 0; player.vy = 0; }

        // --- SPAWN ITEMS (Weapons & Powerups) ---
        // 0.2% chance per frame for weapon, 0.05% for speed box
        if (Math.random() < 0.005) {
             itemsRef.current.push({
                 x: Math.random() * (canvas.width - 20),
                 y: -20, w: 20, h: 10,
                 type: 'weapon', vy: 2, onGround: false, life: 20 // 20 sec life
             });
        }
        if (Math.random() < 0.001) {
             itemsRef.current.push({
                 x: Math.random() * (canvas.width - 24),
                 y: -24, w: 24, h: 24,
                 type: 'speed_box', vy: 2, onGround: false, life: 30
             });
        }

        // --- UPDATE ITEMS ---
        for (let i = itemsRef.current.length - 1; i >= 0; i--) {
            const item = itemsRef.current[i];
            
            // Gravity for items
            if (!item.onGround) {
                item.y += item.vy;
                item.vy += 0.2;
                platformsRef.current.forEach(plat => {
                    if (item.x < plat.x + plat.w && item.x + item.w > plat.x &&
                        item.y + item.h >= plat.y && item.y + item.h <= plat.y + 10 && item.vy > 0) {
                        item.y = plat.y - item.h;
                        item.vy = 0;
                        item.onGround = true;
                    }
                });
                if (item.y > canvas.height) {
                    itemsRef.current.splice(i, 1);
                    continue;
                }
            }
            item.life -= dt;
            if (item.life <= 0) {
                 itemsRef.current.splice(i, 1);
                 continue;
            }

            // Player collision with Items
            if (player.x < item.x + item.w && player.x + player.w > item.x &&
                player.y < item.y + item.h && player.y + player.h > item.y) {
                    if (item.type === 'speed_box') {
                        player.speedTimer = SPEED_BOOST_DURATION;
                        createFloatingText(player.x, player.y - 20, "СКОРОСТЬ!", '#00ffff');
                        playSound('powerup');
                        itemsRef.current.splice(i, 1);
                        continue;
                    }
            }
        }

        // --- UPDATE HUMANS ---
        const humans = humansRef.current;
        for (let i = humans.length - 1; i >= 0; i--) {
            const h = humans[i];
            let hGrounded = false;
            platformsRef.current.forEach(plat => {
                if (h.x < plat.x + plat.w && h.x + h.w > plat.x && 
                    h.y + h.h >= plat.y && h.y + h.h <= plat.y + 10) {
                    h.y = plat.y - h.h;
                    hGrounded = true;
                }
            });
            if (!hGrounded) h.y += 4;

            // Weapon Pickup
            if (!h.hasWeapon) {
                for (let j = itemsRef.current.length - 1; j >= 0; j--) {
                    const item = itemsRef.current[j];
                    if (item.type === 'weapon' && 
                        h.x < item.x + item.w && h.x + h.w > item.x &&
                        h.y < item.y + item.h && h.y + h.h > item.y) {
                        h.hasWeapon = true;
                        itemsRef.current.splice(j, 1);
                        break;
                    }
                }
            }

            // AI Logic
            const dist = Math.sqrt(Math.pow(h.x - player.x, 2) + Math.pow(h.y - player.y, 2));
            
            if (h.hasWeapon) {
                h.shootCooldown -= dt;
                // Shoot if close enough
                if (dist < 400 && h.shootCooldown <= 0) {
                    const angle = Math.atan2((player.y + player.h/2) - (h.y + h.h/2), (player.x + player.w/2) - (h.x + h.w/2));
                    projectilesRef.current.push({
                        x: h.x + h.w/2, y: h.y + h.h/2, w: 6, h: 6,
                        vx: Math.cos(angle) * 8,
                        vy: Math.sin(angle) * 8,
                        color: '#fde047',
                        damage: HUMAN_DAMAGE
                    });
                    h.shootCooldown = 2.0; // Seconds between shots
                    playSound('shoot');
                }
                // Run away if too close, otherwise stand ground
                if (dist < 100) {
                     h.vx = (h.x < player.x) ? -2 : 2;
                } else {
                    h.vx = 0;
                }
            } else {
                 if (dist < 200) {
                    h.panicLevel = 1;
                    h.vx = (h.x < player.x) ? -3.5 : 3.5;
                } else {
                    h.panicLevel = 0;
                    if (Math.random() < 0.05) h.vx = (Math.random() - 0.5) * 4;
                }
            }

            h.x += h.vx;
            if (h.x < 0) { h.x = 0; h.vx *= -1; }
            if (h.x > canvas.width - h.w) { h.x = canvas.width - h.w; h.vx *= -1; }

            // Eat Human
            if (player.x < h.x + h.w && player.x + player.w > h.x &&
                player.y < h.y + h.h && player.y + player.h > h.y) {
                playSound('eat');
                createExplosion(h.x + h.w/2, h.y + h.h/2, '#ef4444');
                createFloatingText(h.x, h.y, "+100");
                
                // Heal Player
                player.hp = Math.min(player.hp + EAT_HEAL, player.maxHp);
                createFloatingText(player.x, player.y - 40, "+HP", '#22c55e');

                setScore(s => s + 100);
                humans.splice(i, 1);
                playerRef.current.frame++;
            }
        }
        if (humans.length < 3 && Math.random() < 0.02) spawnHumans(canvas.width, canvas.height, 1);

        // --- UPDATE PROJECTILES ---
        for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
            const p = projectilesRef.current[i];
            p.x += p.vx;
            p.y += p.vy;

            // Bounds
            if (p.x < 0 || p.x > canvas.width || p.y < 0 || p.y > canvas.height) {
                projectilesRef.current.splice(i, 1);
                continue;
            }

            // Hit Player
            if (p.x < player.x + player.w && p.x + p.w > player.x &&
                p.y < player.y + player.h && p.y + p.h > player.y) {
                player.hp -= p.damage;
                playSound('hit');
                createExplosion(p.x, p.y, '#ef4444');
                createFloatingText(player.x, player.y, `-${p.damage}`, '#ef4444');
                projectilesRef.current.splice(i, 1);

                if (player.hp <= 0) {
                    setGameState('GAME_OVER');
                }
            }
        }

        // --- PARTICLES & TEXT ---
        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
            const p = particlesRef.current[i];
            p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= 0.03;
            if (p.life <= 0) particlesRef.current.splice(i, 1);
        }
        for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
            const ft = floatingTextsRef.current[i];
            ft.y += ft.vy; ft.vy *= 0.9; ft.life -= 0.02;
            if (ft.life <= 0) floatingTextsRef.current.splice(i, 1);
        }

        // --- DRAWING ---
        platformsRef.current.forEach(plat => {
            ctx.fillStyle = '#10b981'; ctx.fillRect(plat.x, plat.y, plat.w, 4);
            ctx.fillStyle = '#3f3f46'; ctx.fillRect(plat.x, plat.y + 4, plat.w, plat.h - 4);
        });
        
        itemsRef.current.forEach(item => drawItem(ctx, item));
        humansRef.current.forEach(h => drawHuman(ctx, h, player.x));
        drawBurger(ctx, player, currentSkinId);
        
        projectilesRef.current.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.w, p.h);
        });

        particlesRef.current.forEach(p => {
            ctx.globalAlpha = p.life; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, p.size, p.size);
        });
        ctx.globalAlpha = 1;

        floatingTextsRef.current.forEach(ft => {
            ctx.globalAlpha = ft.life; ctx.font = 'bold 20px monospace';
            ctx.fillStyle = '#fbbf24'; ctx.strokeStyle = '#000';
            ctx.lineWidth = 2; ctx.strokeText(ft.text, ft.x, ft.y); ctx.fillText(ft.text, ft.x, ft.y);
        });
        ctx.globalAlpha = 1;

        drawControls(ctx);
        drawHUD(ctx);
    } 
    else {
         if (['MENU', 'SHOP', 'SKINS', 'VICTORY', 'GAME_OVER'].includes(gameStateRef.current)) {
            if (gameStateRef.current !== 'GAME_OVER') {
                 ctx.fillStyle = '#10b981';
                 ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
                 drawBurger(ctx, { ...playerRef.current, x: canvas.width/2 - 20, y: canvas.height/2, vx: 0, vy: 0 }, currentSkinId);
            }
         }
    }
    requestRef.current = requestAnimationFrame(update);
  }, [currentSkinId, currentRound, playSound, showMobileControls]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, [update]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
      setShowMobileControls('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((gameStateRef.current === 'MENU' || gameStateRef.current === 'GAME_OVER') && e.code === 'Space') {
        startRound();
        return;
      }
      if (gameStateRef.current === 'PLAYING') {
        switch (e.code) {
          case 'ArrowLeft': inputRef.current.left = true; break;
          case 'ArrowRight': inputRef.current.right = true; break;
          case 'Space': case 'ArrowUp': inputRef.current.jump = true; break;
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'ArrowLeft': inputRef.current.left = false; break;
        case 'ArrowRight': inputRef.current.right = false; break;
        case 'Space': case 'ArrowUp': inputRef.current.jump = false; break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startRound]);

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (gameState === 'MENU' || gameState === 'GAME_OVER') { startRound(); return; }
    if (gameState !== 'PLAYING') return;

    for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.clientX < window.innerWidth / 2) {
            if (!joystickRef.current.active) {
                joystickRef.current = { active: true, id: t.identifier, originX: t.clientX, originY: t.clientY, currentX: t.clientX, currentY: t.clientY };
            }
        } else {
            if (!jumpBtnRef.current.active) {
                jumpBtnRef.current = { active: true, id: t.identifier };
                inputRef.current.jump = true;
            }
        }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (joystickRef.current.active && t.identifier === joystickRef.current.id) {
            const maxRadius = 50;
            let dx = t.clientX - joystickRef.current.originX;
            let dy = t.clientY - joystickRef.current.originY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist > maxRadius) { const ratio = maxRadius / dist; dx *= ratio; dy *= ratio; }
            joystickRef.current.currentX = joystickRef.current.originX + dx;
            joystickRef.current.currentY = joystickRef.current.originY + dy;

            if (dx < -10) { inputRef.current.left = true; inputRef.current.right = false; }
            else if (dx > 10) { inputRef.current.left = false; inputRef.current.right = true; }
            else { inputRef.current.left = false; inputRef.current.right = false; }
        }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (joystickRef.current.active && t.identifier === joystickRef.current.id) {
            joystickRef.current.active = false; joystickRef.current.id = null;
            inputRef.current.left = false; inputRef.current.right = false;
        }
        if (jumpBtnRef.current.active && t.identifier === jumpBtnRef.current.id) {
            jumpBtnRef.current.active = false; jumpBtnRef.current.id = null;
            inputRef.current.jump = false;
        }
    }
  };

  const buySkin = () => {
    const nextSkinId = ownedSkins.length;
    if (nextSkinId >= SKINS.length) return;
    const cost = BASE_SKIN_COST + (ownedSkins.length * 500);
    
    if (score >= cost) {
      setScore(s => s - cost);
      setOwnedSkins([...ownedSkins, nextSkinId]);
      setCurrentSkinId(nextSkinId);
      playSound('buy');
    }
  };

  const proceedToNextRound = () => {
    setCurrentRound(c => c + 1);
    startRound();
  };
  
  const openSkinsMenu = () => {
    if (gameState === 'SKINS') return;
    setPrevGameState(gameState);
    setGameState('SKINS');
  };
  
  const closeSkinsMenu = () => {
    setGameState(prevGameState);
  };

  const nextSkinCost = BASE_SKIN_COST + (ownedSkins.length * 500);
  const nextSkin = SKINS[ownedSkins.length];

  return (
    <>
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none select-none outline-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
      />

      {/* --- MENU OVERLAYS --- */}
      
      {gameState === 'PLAYING' && (
        <button
            onClick={openSkinsMenu}
            className="absolute top-20 right-4 z-40 bg-slate-800/80 p-2 rounded border border-slate-600 hover:bg-slate-700 text-white font-bold text-xs shadow-lg transition-transform hover:scale-105"
        >
            ПАУЗА / СКИНЫ
        </button>
      )}
      
      {gameState === 'MENU' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm z-50 text-white">
          <h1 className="text-6xl font-black text-yellow-400 mb-4 tracking-tighter drop-shadow-lg text-center">БУРГЕР МЭН</h1>
          <p className="text-sm text-gray-400 mb-8 font-mono">Версия игры 1.0</p>
          <p className="mb-8 font-mono text-xl opacity-80 animate-pulse text-center">
            {showMobileControls ? 'КОСНИТЕСЬ ЭКРАНА' : 'НАЖМИТЕ ПРОБЕЛ'}
          </p>
          <button 
            onClick={startRound}
            className="px-8 py-4 bg-green-500 hover:bg-green-600 rounded font-bold text-2xl shadow-lg transform transition hover:scale-105"
          >
            ИГРАТЬ
          </button>
        </div>
      )}

      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/90 backdrop-blur-md z-50 text-white">
          <h1 className="text-6xl font-black text-white mb-4 tracking-tighter drop-shadow-lg text-center">ВЫ ПРОИГРАЛИ</h1>
          <p className="mb-8 font-mono text-xl text-center">
            РАУНД: {currentRound} | СЧЕТ: ${score}
          </p>
          <button 
            onClick={startRound}
            className="px-8 py-4 bg-yellow-500 hover:bg-yellow-600 rounded font-bold text-2xl shadow-lg transform transition hover:scale-105 text-black"
          >
            ЗАНОВО
          </button>
        </div>
      )}

      {gameState === 'SHOP' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md z-50 text-white p-4">
          <h2 className="text-4xl font-bold text-yellow-400 mb-2">РАУНД {currentRound} ЗАВЕРШЕН!</h2>
          <p className="text-xl mb-8 font-mono text-green-400">ВАШ БАЛАНС: ${score}</p>
          
          <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 w-full max-w-md mb-8">
            <h3 className="text-xl font-bold mb-4 text-center">МАГАЗИН СКИНОВ</h3>
            {nextSkin ? (
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded border-2 border-dashed border-slate-500 flex items-center justify-center" 
                     style={{backgroundColor: nextSkin.colors.bun}}>
                    ?
                </div>
                <div className="text-center">
                    <p className="font-bold">{nextSkin.name}</p>
                    <p className="text-yellow-200">Цена: ${nextSkinCost}</p>
                </div>
                <button 
                  onClick={buySkin}
                  disabled={score < nextSkinCost}
                  className={`px-6 py-2 rounded font-bold w-full ${score >= nextSkinCost ? 'bg-blue-500 hover:bg-blue-600' : 'bg-slate-600 cursor-not-allowed opacity-50'}`}
                >
                  КУПИТЬ
                </button>
              </div>
            ) : (
                <p className="text-center text-green-400">ВСЕ СКИНЫ КУПЛЕНЫ!</p>
            )}
          </div>

          <div className="flex gap-4">
            <button 
              onClick={openSkinsMenu}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded font-bold shadow-lg"
            >
              МОИ СКИНЫ
            </button>
            <button 
              onClick={proceedToNextRound}
              className="px-6 py-3 bg-green-500 hover:bg-green-600 rounded font-bold shadow-lg animate-pulse"
            >
              СЛЕДУЮЩИЙ РАУНД &gt;
            </button>
          </div>
        </div>
      )}

      {gameState === 'SKINS' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-md z-50 text-white p-4">
            <h2 className="text-3xl font-bold mb-6">МОИ СКИНЫ</h2>
            <div className="grid grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto p-4 bg-slate-800 rounded-xl mb-8 w-full max-w-2xl">
                {ownedSkins.map(id => {
                    const skin = SKINS[id];
                    return (
                        <button 
                            key={id}
                            onClick={() => { setCurrentSkinId(id); }}
                            className={`p-4 rounded border-2 flex flex-col items-center gap-2 ${currentSkinId === id ? 'border-yellow-400 bg-slate-700' : 'border-transparent bg-slate-700/50 hover:bg-slate-700'}`}
                        >
                            <div className="w-12 h-12 rounded" style={{backgroundColor: skin.colors.bun}}></div>
                            <span className="text-xs font-bold">{skin.name}</span>
                            {currentSkinId === id && <span className="text-xs text-yellow-400">ВЫБРАН</span>}
                        </button>
                    );
                })}
            </div>
            <button 
              onClick={closeSkinsMenu}
              className="px-8 py-3 bg-slate-600 hover:bg-slate-700 rounded font-bold"
            >
              {prevGameState === 'PLAYING' ? 'ПРОДОЛЖИТЬ' : 'НАЗАД'}
            </button>
        </div>
      )}

      {gameState === 'VICTORY' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-yellow-500 z-50 text-black p-8 text-center">
            <h1 className="text-6xl font-black mb-4 tracking-tighter">ПОЗДРАВЛЯЕМ!</h1>
            <p className="text-2xl font-bold mb-8">ВЫ ПРОШЛИ ВСЕ 33 РАУНДА!</p>
            <p className="text-xl mb-12">Ваш итоговый счет: ${score}</p>
            <button 
                onClick={() => window.location.reload()}
                className="px-8 py-4 bg-black text-white hover:bg-neutral-800 rounded font-bold text-2xl shadow-lg"
            >
                ИГРАТЬ СНОВА
            </button>
        </div>
      )}
    </>
  );
};

export default Game;