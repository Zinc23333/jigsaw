import React, { useEffect, useRef } from 'react';
import { PuzzlePiece, Size } from '../types';
import { renderPiecePath } from '../utils/jigsawPath';

interface Props {
  pieces: PuzzlePiece[];
  width: number;
  height: number;
  pieceSize: Size;
  tabSize: number;
}

export const PreviewCanvas: React.FC<Props> = ({ pieces, width, height, pieceSize, tabSize }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 2;

    pieces.forEach(p => {
      ctx.save();
      // Translate to where this piece belongs in the full image
      ctx.translate(p.col * pieceSize.width, p.row * pieceSize.height);
      
      ctx.beginPath();
      renderPiecePath(ctx, pieceSize.width, pieceSize.height, p.shape, tabSize);
      ctx.stroke();
      
      ctx.restore();
    });

  }, [pieces, width, height, pieceSize, tabSize]);

  return (
    <canvas 
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute top-0 left-0 pointer-events-none w-full h-full"
    />
  );
};