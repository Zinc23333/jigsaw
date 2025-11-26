import React, { useEffect, useRef } from 'react';

export const Confetti = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas to full screen
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      alpha: number;
      life: number;
      decay: number;
      gravity: number;
    }

    let particles: Particle[] = [];
    const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f472b6', '#fbbf24'];

    const createFirework = (x: number, y: number, angleRange: [number, number]) => {
      const particleCount = 40;
      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.random() * (angleRange[1] - angleRange[0]) + angleRange[0]) * (Math.PI / 180);
        const speed = Math.random() * 15 + 10;
        particles.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: colors[Math.floor(Math.random() * colors.length)],
          alpha: 1,
          life: 100,
          decay: Math.random() * 0.015 + 0.005,
          gravity: 0.2
        });
      }
    };

    let animationId: number;
    let tick = 0;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Spawn fireworks periodically
      if (tick % 40 === 0 && tick < 300) { // Stop spawning after ~5 seconds (assuming 60fps)
        // Left corner shooting up-right
        createFirework(0, canvas.height, [-80, -20]);
        // Right corner shooting up-left
        createFirework(canvas.width, canvas.height, [-160, -100]);
      }

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.98; // Friction
        p.vy *= 0.98;
        p.life--;
        p.alpha -= p.decay;

        if (p.alpha <= 0 || p.life <= 0) {
          particles.splice(i, 1);
        } else {
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.globalAlpha = 1;

      tick++;
      if (particles.length > 0 || tick < 300) {
        animationId = requestAnimationFrame(render);
      }
    };

    render();

    const handleResize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 pointer-events-none z-[150]"
    />
  );
};