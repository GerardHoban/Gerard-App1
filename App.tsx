import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, RotateCcw, Trophy, Skull, Heart } from 'lucide-react';
import { 
  GameState, 
  Player, 
  Enemy, 
  Bullet, 
  Particle,
  GameObject,
  EnemyType
} from './types';
import {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_SPEED,
  PLAYER_COLOR,
  PLAYER_LIVES,
  ENEMY_WIDTH,
  ENEMY_HEIGHT,
  ENEMY_PADDING,
  ENEMY_ROWS,
  ENEMY_COLS,
  ENEMY_COLOR,
  ENEMY_SHOOTER_COLOR,
  ENEMY_SPEED_INITIAL,
  ENEMY_DROP_HEIGHT,
  ENEMY_SHOOT_CHANCE,
  BULLET_WIDTH,
  BULLET_HEIGHT,
  BULLET_SPEED,
  BULLET_COLOR,
  BULLET_COOLDOWN,
  ENEMY_BULLET_SPEED,
  ENEMY_BULLET_COLOR,
  PARTICLE_COUNT,
  PARTICLE_LIFE,
  PARTICLE_COLOR
} from './constants';

const App: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [lives, setLives] = useState(PLAYER_LIVES);

  // Mutable game state refs
  const frameIdRef = useRef<number>(0);
  const keysPressed = useRef<Set<string>>(new Set());
  const audioCtxRef = useRef<AudioContext | null>(null);
  
  const playerRef = useRef<Player>({
    x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2,
    y: CANVAS_HEIGHT - PLAYER_HEIGHT - 20,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    color: PLAYER_COLOR,
    speed: PLAYER_SPEED,
    isShooting: false,
    cooldown: 0
  });

  const enemiesRef = useRef<Enemy[]>([]);
  const enemyDirectionRef = useRef<number>(1);
  const bulletsRef = useRef<Bullet[]>([]);
  const enemyBulletsRef = useRef<Bullet[]>([]);
  const particlesRef = useRef<Particle[]>([]);

  // Sound System
  const initAudio = () => {
    if (!audioCtxRef.current) {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        audioCtxRef.current = new AudioContext();
      }
    }
  };

  const playSound = useCallback((type: 'shoot' | 'enemyShoot' | 'explosion' | 'hit' | 'gameover' | 'victory') => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    
    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case 'shoot':
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      case 'enemyShoot':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(200, now + 0.15);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      case 'hit': // Player getting hit
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.linearRampToValueAtTime(50, now + 0.3);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      case 'explosion': // Enemy dying
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.2);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      case 'gameover':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(50, now + 1.5);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 1.5);
        osc.start(now);
        osc.stop(now + 1.5);
        break;
       case 'victory':
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.5);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 1.0);
        osc.start(now);
        osc.stop(now + 1.0);
        break;
    }
  }, []);

  // Initialize Game Logic
  const initGame = useCallback(() => {
    initAudio();
    setScore(0);
    setLives(PLAYER_LIVES);
    setGameState(GameState.PLAYING);
    
    // Reset Player
    playerRef.current = {
      x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2,
      y: CANVAS_HEIGHT - PLAYER_HEIGHT - 20,
      width: PLAYER_WIDTH,
      height: PLAYER_HEIGHT,
      color: PLAYER_COLOR,
      speed: PLAYER_SPEED,
      isShooting: false,
      cooldown: 0
    };

    // Reset Bullets & Particles
    bulletsRef.current = [];
    enemyBulletsRef.current = [];
    particlesRef.current = [];

    // Initialize Enemies
    const newEnemies: Enemy[] = [];
    const startX = (CANVAS_WIDTH - (ENEMY_COLS * (ENEMY_WIDTH + ENEMY_PADDING))) / 2;
    const startY = 50;

    for (let row = 0; row < ENEMY_ROWS; row++) {
      for (let col = 0; col < ENEMY_COLS; col++) {
        // Top 2 rows are Shooters (Blue), Bottom 2 are Standard (Red)
        const type: EnemyType = row < 2 ? 'SHOOTER' : 'STANDARD';
        newEnemies.push({
          x: startX + col * (ENEMY_WIDTH + ENEMY_PADDING),
          y: startY + row * (ENEMY_HEIGHT + ENEMY_PADDING),
          width: ENEMY_WIDTH,
          height: ENEMY_HEIGHT,
          color: type === 'SHOOTER' ? ENEMY_SHOOTER_COLOR : ENEMY_COLOR,
          row,
          col,
          type,
          markedForDeletion: false
        });
      }
    }
    enemiesRef.current = newEnemies;
    enemyDirectionRef.current = 1;
  }, [playSound]);

  // Helpers
  const createExplosion = (x: number, y: number, color: string) => {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / PARTICLE_COUNT;
      const speed = Math.random() * 2 + 1;
      particlesRef.current.push({
        x,
        y,
        width: 3,
        height: 3,
        color: color,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        life: PARTICLE_LIFE,
        maxLife: PARTICLE_LIFE
      });
    }
  };

  const checkCollision = (rect1: GameObject, rect2: GameObject) => {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  };

  // Main Game Loop
  const update = useCallback(() => {
    if (gameState !== GameState.PLAYING) return;

    const player = playerRef.current;
    
    // 1. Update Player Position
    if (keysPressed.current.has('ArrowLeft')) {
      player.x = Math.max(0, player.x - player.speed);
    }
    if (keysPressed.current.has('ArrowRight')) {
      player.x = Math.min(CANVAS_WIDTH - player.width, player.x + player.speed);
    }

    // 2. Handle Player Shooting
    if (player.cooldown > 0) player.cooldown--;
    if (keysPressed.current.has(' ') && player.cooldown <= 0) {
      playSound('shoot');
      bulletsRef.current.push({
        x: player.x + player.width / 2 - BULLET_WIDTH / 2,
        y: player.y,
        width: BULLET_WIDTH,
        height: BULLET_HEIGHT,
        color: BULLET_COLOR,
        dy: -BULLET_SPEED
      });
      player.cooldown = BULLET_COOLDOWN;
    }

    // 3. Update Player Bullets
    bulletsRef.current.forEach(b => {
      b.y += b.dy;
      if (b.y < 0) b.markedForDeletion = true;
    });

    // 4. Update Enemies
    let shouldChangeDirection = false;
    let reachedBottom = false;
    
    const enemyCount = enemiesRef.current.length;
    if (enemyCount === 0) {
      playSound('victory');
      setGameState(GameState.VICTORY);
      return;
    }
    const currentEnemySpeed = ENEMY_SPEED_INITIAL + (1 - enemyCount / (ENEMY_ROWS * ENEMY_COLS)) * 2;

    enemiesRef.current.forEach(enemy => {
      enemy.x += currentEnemySpeed * enemyDirectionRef.current;

      // Enemy Shooting Logic
      if (enemy.type === 'SHOOTER') {
        if (Math.random() < ENEMY_SHOOT_CHANCE) {
          playSound('enemyShoot');
          enemyBulletsRef.current.push({
            x: enemy.x + enemy.width / 2 - BULLET_WIDTH / 2,
            y: enemy.y + enemy.height,
            width: BULLET_WIDTH,
            height: BULLET_HEIGHT,
            color: ENEMY_BULLET_COLOR,
            dy: ENEMY_BULLET_SPEED
          });
        }
      }

      // Check boundary collision for direction change
      if (
        (enemyDirectionRef.current === 1 && enemy.x + enemy.width > CANVAS_WIDTH - 20) ||
        (enemyDirectionRef.current === -1 && enemy.x < 20)
      ) {
        shouldChangeDirection = true;
      }

      // Check Invasion (enemy touches player line)
      if (enemy.y + enemy.height >= player.y) {
        reachedBottom = true;
      }

      // Check Collision with Player Body
      if (checkCollision(enemy, player)) {
        reachedBottom = true;
      }
    });

    if (reachedBottom) {
      playSound('gameover');
      setGameState(GameState.GAME_OVER);
    }

    if (shouldChangeDirection) {
      enemyDirectionRef.current *= -1;
      enemiesRef.current.forEach(e => e.y += ENEMY_DROP_HEIGHT);
    }

    // 5. Update Enemy Bullets
    enemyBulletsRef.current.forEach(b => {
      b.y += b.dy;
      if (b.y > CANVAS_HEIGHT) b.markedForDeletion = true;

      // Check Collision with Player
      if (checkCollision(b, player)) {
        b.markedForDeletion = true;
        createExplosion(player.x + player.width/2, player.y + player.height/2, PLAYER_COLOR);
        playSound('hit');
        
        // Handle Life Loss
        if (lives > 1) {
            setLives(l => l - 1);
        } else {
            setLives(0);
            playSound('gameover');
            setGameState(GameState.GAME_OVER);
        }
      }
    });

    // 6. Collision Detection: Player Bullets vs Enemies
    bulletsRef.current.forEach(bullet => {
      if (bullet.markedForDeletion) return;
      
      enemiesRef.current.forEach(enemy => {
        if (enemy.markedForDeletion) return;
        
        if (checkCollision(bullet, enemy)) {
          bullet.markedForDeletion = true;
          enemy.markedForDeletion = true;
          createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.color);
          playSound('explosion');
          setScore(s => s + (enemy.type === 'SHOOTER' ? 200 : 100));
        }
      });
    });

    // Cleanup Deleted Entities
    bulletsRef.current = bulletsRef.current.filter(b => !b.markedForDeletion);
    enemyBulletsRef.current = enemyBulletsRef.current.filter(b => !b.markedForDeletion);
    enemiesRef.current = enemiesRef.current.filter(e => !e.markedForDeletion);

    // 7. Update Particles
    particlesRef.current.forEach(p => {
      p.x += p.dx;
      p.y += p.dy;
      p.life--;
      if (p.life <= 0) p.markedForDeletion = true;
    });
    particlesRef.current = particlesRef.current.filter(p => !p.markedForDeletion);

  }, [gameState, lives, playSound]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear Canvas
    ctx.fillStyle = '#0f172a'; // Match bg
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw Player
    const p = playerRef.current;
    ctx.fillStyle = p.color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = p.color;
    ctx.fillRect(p.x, p.y, p.width, p.height);
    ctx.shadowBlur = 0;

    // Draw Enemies
    enemiesRef.current.forEach(e => {
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x, e.y, e.width, e.height);
      
      // Eyes
      ctx.fillStyle = '#0f172a';
      if (e.type === 'SHOOTER') {
        // Cyclops eye for shooters
         ctx.fillRect(e.x + 10, e.y + 8, 10, 6);
      } else {
         // Two eyes for standard
        ctx.fillRect(e.x + 6, e.y + 8, 6, 6);
        ctx.fillRect(e.x + 18, e.y + 8, 6, 6);
      }
    });

    // Draw Player Bullets
    bulletsRef.current.forEach(b => {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.width, b.height);
    });

    // Draw Enemy Bullets
    enemyBulletsRef.current.forEach(b => {
      ctx.fillStyle = b.color;
      // Draw as a small circle or diamond
      ctx.beginPath();
      ctx.arc(b.x + b.width/2, b.y + b.height/2, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Particles
    particlesRef.current.forEach(pt => {
      ctx.globalAlpha = pt.life / pt.maxLife;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.width, pt.height);
      ctx.globalAlpha = 1.0;
    });

    // Scanlines effect for retro feel
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    for (let i = 0; i < CANVAS_HEIGHT; i += 4) {
      ctx.fillRect(0, i, CANVAS_WIDTH, 2);
    }

  }, []);

  const tick = useCallback(() => {
    update();
    draw();
    frameIdRef.current = requestAnimationFrame(tick);
  }, [update, draw]);

  // Event Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current.add(e.key);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current.delete(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Game Loop Control
  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      frameIdRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frameIdRef.current);
      draw();
    }
    return () => cancelAnimationFrame(frameIdRef.current);
  }, [gameState, tick, draw]);

  // High Score updater
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score);
    }
  }, [score, highScore]);

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center p-4">
      {/* Header / Scoreboard */}
      <div className="w-full max-w-[800px] flex justify-between items-center mb-4 px-6 py-3 bg-gray-800 rounded-lg border-b-4 border-gray-700 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <span className="text-gray-400 text-xs tracking-wider">SCORE</span>
            <span className="text-2xl text-green-400">{score.toString().padStart(6, '0')}</span>
          </div>
          <div className="flex flex-col ml-4">
            <span className="text-gray-400 text-xs tracking-wider">LIVES</span>
            <div className="flex gap-1 mt-1">
                {Array.from({ length: Math.max(0, lives) }).map((_, i) => (
                    <Heart key={i} size={20} className="text-red-500 fill-red-500" />
                ))}
            </div>
          </div>
        </div>
        
        <h1 className="hidden md:block text-2xl text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 tracking-widest font-black uppercase italic">
          Space Invaders
        </h1>

        <div className="flex flex-col items-end">
          <span className="text-gray-400 text-xs tracking-wider flex items-center gap-2">
            HIGH SCORE <Trophy size={12} className="text-yellow-500" />
          </span>
          <span className="text-2xl text-yellow-500">{highScore.toString().padStart(6, '0')}</span>
        </div>
      </div>

      {/* Game Container */}
      <div className="relative group shadow-2xl rounded-lg overflow-hidden border-4 border-gray-700">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="block bg-[#0f172a] max-w-full h-auto"
          style={{ 
            width: '800px', 
            height: '600px',
            cursor: gameState === GameState.PLAYING ? 'none' : 'default'
          }}
        />

        {/* Menu Overlay */}
        {gameState === GameState.MENU && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-10 animate-fade-in">
            <h1 className="text-5xl md:text-6xl text-center leading-tight mb-8 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
              RETRO<br />INVADERS
            </h1>
            <p className="text-blue-300 mb-8 text-sm md:text-base animate-pulse text-center max-w-md leading-relaxed">
              Use <span className="px-2 py-1 bg-gray-700 rounded border border-gray-500">←</span> <span className="px-2 py-1 bg-gray-700 rounded border border-gray-500">→</span> to Move<br /><br />
              Press <span className="px-4 py-1 bg-gray-700 rounded border border-gray-500">SPACE</span> to Shoot<br /><br />
              Watch out for <span className="text-blue-400 font-bold">Blue Invaders</span> that shoot back!
            </p>
            <button
              onClick={initGame}
              className="flex items-center gap-3 px-8 py-4 bg-green-600 hover:bg-green-500 text-white rounded-none border-b-4 border-green-800 active:border-b-0 active:translate-y-1 transition-all text-xl"
            >
              <Play fill="currentColor" /> START GAME
            </button>
          </div>
        )}

        {/* Game Over Overlay */}
        {gameState === GameState.GAME_OVER && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/80 backdrop-blur-sm z-10">
            <Skull size={64} className="text-white mb-4 animate-bounce" />
            <h2 className="text-5xl text-white mb-2 tracking-widest">GAME OVER</h2>
            <p className="text-red-200 mb-8">Final Score: {score}</p>
            <button
              onClick={initGame}
              className="flex items-center gap-3 px-8 py-4 bg-white hover:bg-gray-100 text-red-600 rounded-none border-b-4 border-gray-300 active:border-b-0 active:translate-y-1 transition-all text-xl"
            >
              <RotateCcw /> TRY AGAIN
            </button>
          </div>
        )}

        {/* Victory Overlay */}
        {gameState === GameState.VICTORY && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-900/80 backdrop-blur-sm z-10">
            <Trophy size={64} className="text-yellow-400 mb-4 animate-pulse" />
            <h2 className="text-5xl text-white mb-2 tracking-widest">VICTORY!</h2>
            <p className="text-green-200 mb-8">Earth is safe... for now.</p>
            <button
              onClick={initGame}
              className="flex items-center gap-3 px-8 py-4 bg-yellow-500 hover:bg-yellow-400 text-black rounded-none border-b-4 border-yellow-700 active:border-b-0 active:translate-y-1 transition-all text-xl"
            >
              <Play fill="currentColor" /> PLAY AGAIN
            </button>
          </div>
        )}
      </div>

      {/* Footer Instructions */}
      <div className="mt-8 text-gray-500 text-xs text-center">
        <p>Built with React + Canvas API</p>
      </div>
    </div>
  );
};

export default App;