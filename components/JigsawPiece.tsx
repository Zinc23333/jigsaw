
import React, { useEffect, useRef, useMemo } from 'react';
import { PuzzlePiece, Size } from '../types';
import { renderPiecePath, renderPieceEdges } from '../utils/jigsawPath';

interface Props {
  piece: PuzzlePiece;
  imageSrc: string;
  pieceSize: Size; // The logical grid size of a piece
  fullImageSize: Size; // The logical size of the entire puzzle board
  tabSize: number;
  isDragging?: boolean;
  scale?: number;
  connectedSides?: { top: boolean; right: boolean; bottom: boolean; left: boolean };
  animatePosition?: boolean;
  animationDuration?: number; // 新增属性：动画持续时间
}

export const JigsawPiece: React.FC<Props> = ({
  piece,
  imageSrc,
  pieceSize,
  fullImageSize,
  tabSize,
  isDragging = false,
  scale = 1,
  connectedSides = { top: false, right: false, bottom: false, left: false },
  animatePosition = false,
  animationDuration = 1000 // 默认1秒
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // We need to render the piece slightly larger than its grid cell to account for tabs.
  // The tab curve logic (Bezier) extends to about 1.3x - 1.4x the tabSize.
  // We use 2x tabSize as the bleed to ensure no clipping occurs for tabs or strokes.
  const bleed = tabSize * 2; 
  
  // SNAP TO INTEGERS: Prevent sub-pixel rendering artifacts
  const canvasWidth = Math.ceil(pieceSize.width + bleed * 2);
  const canvasHeight = Math.ceil(pieceSize.height + bleed * 2);

  // MEMOIZE DEPENDENCIES
  // Crucial: We must NOT put 'piece' in the dependency array directly.
  // 'piece' changes on every drag frame because piece.currentPos changes.
  // But the CANVAS CONTENT (image cropping, shape drawing) only depends on the structural IDs.
  const { id, row, col, shape } = piece;

  // Memoize connectedSides to avoid strict equality checks failing on new object references
  const connectedKey = `${connectedSides.top}-${connectedSides.right}-${connectedSides.bottom}-${connectedSides.left}`;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = imageSrc;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      ctx.save();
      // Translate to center the piece "grid" area within the bleed
      // Canvas (0,0) is top-left. We want the piece's logical (0,0) to be at (bleed, bleed)
      ctx.translate(bleed, bleed);
      
      // --- 1. Draw Image with Clipping ---
      // We clip strictly to the piece shape to render the image
      ctx.save();
      ctx.beginPath();
      renderPiecePath(ctx, pieceSize.width, pieceSize.height, shape, tabSize);
      ctx.clip();

      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;
      
      // Calculate scale factor between Natural Image and Logical Board
      const scaleX = naturalW / fullImageSize.width;
      const scaleY = naturalH / fullImageSize.height;

      // Determine Logical Bounds
      let lX = col * pieceSize.width - bleed;
      let lY = row * pieceSize.height - bleed;
      let lW = pieceSize.width + bleed * 2;
      let lH = pieceSize.height + bleed * 2;
      
      // Map to Source Image Coordinates (Natural)
      let sX = lX * scaleX;
      let sY = lY * scaleY;
      let sW = lW * scaleX;
      let sH = lH * scaleY;
      
      // Map to Destination Coordinates
      let dX = -bleed;
      let dY = -bleed;
      let dW = lW;
      let dH = lH;

      // Clamp Source Rect to Image Bounds
      if (sX < 0) {
          const diff = -sX; 
          const destDiff = diff / scaleX; 
          sX = 0;
          sW -= diff;
          dX += destDiff;
          dW -= destDiff;
      }
      if (sY < 0) {
          const diff = -sY;
          const destDiff = diff / scaleY;
          sY = 0;
          sH -= diff;
          dY += destDiff;
          dH -= destDiff;
      }
      if (sX + sW > naturalW) {
          const diff = (sX + sW) - naturalW;
          const destDiff = diff / scaleX;
          sW -= diff;
          dW -= destDiff;
      }
      if (sY + sH > naturalH) {
          const diff = (sY + sH) - naturalH;
          const destDiff = diff / scaleY;
          sH -= diff;
          dH -= destDiff;
      }

      // Snap destination coords to integer pixels
      const finalDX = Math.floor(dX);
      const finalDY = Math.floor(dY);
      const finalDW = Math.ceil(dX + dW) - finalDX;
      const finalDH = Math.ceil(dY + dH) - finalDY;

      if (sW > 0 && sH > 0) {
          ctx.drawImage(img, sX, sY, sW, sH, finalDX, finalDY, finalDW, finalDH);
      }
      
      // Restore to remove clip, so we can draw the stroke ON TOP of the image edge (full width)
      ctx.restore(); 

      // --- 2. Draw Strokes on Unconnected Edges ---
      // If dragging, use the Yellow-Brown highlight color and thicker line.
      // Otherwise, use subtle white.
      if (isDragging) {
          ctx.strokeStyle = '#b45309'; // Yellow-Brown (Tailwind amber-700 approx)
          ctx.lineWidth = 3;
      } else {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1.5;
      }
      
      // Round caps/joins ensure corners look continuous even if drawn as separate segments
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      renderPieceEdges(ctx, pieceSize.width, pieceSize.height, shape, tabSize, connectedSides);
      
      ctx.restore(); // Restore translation
    };
    
    // Cleanup if component unmounts quickly, though for image.onload mostly harmless
  }, [
      // Only re-run canvas draw if these SPECIFIC props change.
      // Do NOT include 'piece' or 'piece.currentPos'.
      id, 
      row, 
      col, 
      shape, 
      imageSrc, 
      pieceSize.width, 
      pieceSize.height, 
      fullImageSize.width,
      fullImageSize.height,
      tabSize, 
      isDragging, 
      connectedKey // Use the string key for stable dependency
  ]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      style={{
        position: 'absolute',
        // Visual pos must subtract bleed to align the "grid" corner with currentPos
        left: piece.currentPos.x - bleed,
        top: piece.currentPos.y - bleed,
        pointerEvents: 'none', 
        transition: animatePosition ? `top ${animationDuration}ms ease-out, left ${animationDuration}ms ease-out` : 'none'
      }}
    />
  );
};
