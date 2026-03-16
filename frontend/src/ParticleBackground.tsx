import { useEffect, useRef } from "react";

class DataStream {
  x: number = 0;
  y: number = 0;
  length: number = 0;
  speed: number = 0;
  baseAmp1: number = 0;
  baseAmp2: number = 0;
  oscillationSpeed: number = 0;
  time: number = 0;

  constructor(w: number, h: number) {
    this.reset(w, h);
    // Inicializa a linha em posições aleatórias horizontais para preencher a tela desde o começo
    this.x = Math.random() * w;
  }

  reset(w: number, h: number) {
    this.length = Math.random() * 500 + 400; // Comprimento do feixe (400 a 900)
    const horizontalOffset = Math.max(w * 0.25, 1);
    this.x = -this.length - 50 - Math.random() * horizontalOffset; // Começa escondido à esquerda, com variação
    this.y = Math.random() * h;
    this.speed = Math.random() * 0.2 + 0.1; // Velocidade "meditativa"
    this.baseAmp1 = (Math.random() - 0.5) * 150; // Amplitude da primeira curva de Bezier
    this.baseAmp2 = (Math.random() - 0.5) * 150; // Amplitude da segunda curva de Bezier
    this.oscillationSpeed = Math.random() * 0.005 + 0.002; // Quão rápido a curva ondula verticalmente
    this.time = Math.random() * 100;
  }

  update(w: number, h: number) {
    this.x += this.speed;
    this.time += this.oscillationSpeed;

    // Se saiu totalmente pela direita, reseta e volta para a esquerda
    if (this.x > w) {
      this.reset(w, h);
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const endX = this.x + this.length;
    const endY = this.y;

    // A curva de bézier oscila levemente ao longo do tempo (sensação orgânica / fluxo fluido)
    const amp1 = this.baseAmp1 + Math.sin(this.time) * 40;
    const amp2 = this.baseAmp2 + Math.cos(this.time) * 40;

    // Pontos de controle matemáticos
    const cp1x = this.x + this.length * 0.33;
    const cp1y = this.y + amp1;
    const cp2x = this.x + this.length * 0.66;
    const cp2y = this.y + amp2;

    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);

    // Gradiente de preenchimento (0% -> 12% rgba color azul -> 0%) fade nas pontas
    const gradient = ctx.createLinearGradient(this.x, 0, endX, 0);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0)');
    gradient.addColorStop(0.5, 'rgba(59, 130, 246, 0.12)'); 
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1; // Linhas finas, elegantes
    ctx.stroke();
  }
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number = 0;
    let streams: DataStream[] = [];

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const init = () => {
      resize();
      streams = [];
      // Quantidade inteligente baseada no tamanho da tela (para não sobrecarregar ou ficar vazio)
      const streamCount = Math.min(Math.max(Math.floor(window.innerWidth / 70), 10), 30);
      for (let i = 0; i < streamCount; i++) {
        streams.push(new DataStream(canvas.width, canvas.height));
      }
    };

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      streams.forEach((stream) => {
        stream.update(canvas.width, canvas.height);
        stream.draw(ctx);
      });
      animationFrameId = requestAnimationFrame(render);
    };

    window.addEventListener('resize', resize);
    init();
    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: -1 }}
    />
  );
}
