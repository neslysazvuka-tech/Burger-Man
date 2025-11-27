export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Player extends Rect {
  vx: number;
  vy: number;
  isGrounded: boolean;
  facingRight: boolean;
  frame: number;
  hp: number;
  maxHp: number;
  speedTimer: number; // Time remaining in seconds
}

export interface Human extends Rect {
  vx: number;
  direction: number; // -1 or 1
  panicLevel: number;
  color: string;
  frame: number;
  hasWeapon: boolean;
  shootCooldown: number;
}

export interface Platform extends Rect {
  type: 'ground' | 'floating';
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean;
}

export interface Projectile extends Rect {
  vx: number;
  vy: number;
  color: string;
  damage: number;
}

export interface Item extends Rect {
  type: 'weapon' | 'speed_box';
  vy: number;
  onGround: boolean;
  life: number;
}