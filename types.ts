export interface Position {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface GameObject extends Position, Size {
  color: string;
  markedForDeletion?: boolean;
}

export interface Player extends GameObject {
  speed: number;
  isShooting: boolean;
  cooldown: number;
}

export type EnemyType = 'STANDARD' | 'SHOOTER';

export interface Enemy extends GameObject {
  row: number;
  col: number;
  type: EnemyType;
}

export interface Bullet extends GameObject {
  dy: number;
}

export interface Particle extends GameObject {
  dx: number;
  dy: number;
  life: number;
  maxLife: number;
}

export enum GameState {
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}