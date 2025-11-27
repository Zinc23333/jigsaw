
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PuzzlePiece, GameState, Point, EdgeType } from './types';
import { JigsawPiece } from './components/JigsawPiece';
import { PreviewCanvas } from './components/PreviewCanvas';
import { Confetti } from './components/Confetti';

import { createJigsawPath } from './utils/jigsawPath';

// --- Icons ---
const UploadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>;
const PlayIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" /></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" /></svg>;

const SNAP_DISTANCE = 20; // Pixels
const TAB_RATIO = 0.25;   // Tab size relative to piece smallest dimension
// Margin for dragging constraints (not for coordinate offset!)
const VIEWPORT_MARGIN_X = 36; 
const VIEWPORT_MARGIN_Y = 36; 
const HEADER_RESERVED_SPACE = 80; // 顶部保留区域高度

export default function App() {
  const [gameState, setGameState] = useState<GameState & { boardOrigin: Point }>({
    status: 'idle',
    imageUrl: null,
    imageSize: { width: 0, height: 0 },
    gridSize: { rows: 4, cols: 6 }, // Will be overwritten on load
    boardOrigin: { x: 0, y: 0 }
  });
  const [pieces, setPieces] = useState<PuzzlePiece[]>([]);
  const [draggingGroupId, setDraggingGroupId] = useState<number | null>(null);
  const [showWinMessage, setShowWinMessage] = useState(false);
  const [targetShortSideCount, setTargetShortSideCount] = useState<number>(4);
  const [isScattering, setIsScattering] = useState(false);
  const [showTaskSelector, setShowTaskSelector] = useState(false);
  const [showReferenceImage, setShowReferenceImage] = useState(true);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [healAnimationDuration, setHealAnimationDuration] = useState<number>(1000);
  const [confettiKey, setConfettiKey] = useState<number>(0); // 用于强制重新渲染Confetti组件
  const [showRules, setShowRules] = useState(false); // 控制规则弹窗显示
  
  // Dragging State
  const dragRef = useRef<{
    active: boolean;
    pieceId: number | null;
    groupId: number | null;
    startPointer: Point;
    startPiecePos: Map<number, Point>; // Store initial pos for ALL pieces in the group
    constraints: { minDx: number; maxDx: number; minDy: number; maxDy: number };
  }>({ 
      active: false, 
      pieceId: null, 
      groupId: null, 
      startPointer: {x:0,y:0}, 
      startPiecePos: new Map(),
      constraints: { minDx: -Infinity, maxDx: Infinity, minDy: -Infinity, maxDy: Infinity }
  });

  // Refs for board dimensions
  const boardRef = useRef<HTMLDivElement>(null);
  const hitTestCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  // Initialize Hit Test Canvas Context once
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    hitTestCtxRef.current = canvas.getContext('2d');
  }, []);

  // --- Group Logic (Hoisted for Hit Testing) ---
  
  const uniqueGroupIds = useMemo(() => {
      // Sorting Order determines Rendering Order (Bottom to Top)
      return Array.from(new Set(pieces.map(p => p.groupId))).sort((a, b) => {
          // 1. Dragging Group (Top)
          if (a === draggingGroupId) return 1;
          if (b === draggingGroupId) return -1;

          // 2. Solved vs Unsolved
          const aSolved = pieces.find(p => p.groupId === a)?.isSolved;
          const bSolved = pieces.find(p => p.groupId === b)?.isSolved;

          if (aSolved !== bSolved) {
              return aSolved ? -1 : 1; // Solved goes to bottom (-1)
          }
          
          // 3. ID Order (Higher IDs usually on top as they are created later)
          return (a as number) - (b as number);
      });
  }, [pieces, draggingGroupId]);

  // --- Helpers ---
  
  const getTabSize = () => {
    if (gameState.imageSize.width === 0) return 0;
    return Math.min(gameState.imageSize.width / gameState.gridSize.cols, gameState.imageSize.height / gameState.gridSize.rows) * TAB_RATIO;
  };

  const getPieceSize = () => {
      return {
          width: gameState.imageSize.width / gameState.gridSize.cols,
          height: gameState.imageSize.height / gameState.gridSize.rows
      };
  };

  // --- Initialization Logic ---

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (typeof evt.target?.result === 'string') {
          loadImage(evt.target.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const loadImage = (src: string) => {
    const img = new Image();
    img.src = src;
    img.onload = () => {
      // 1. Optimize Image (Resize if too large)
      // This is crucial for performance. Drawing a 4K image 100 times for pieces is slow.
      const MAX_DIMENSION = 2048;
      let w = img.width;
      let h = img.height;
      
      let renderW = w;
      let renderH = h;
      
      if (w > MAX_DIMENSION || h > MAX_DIMENSION) {
          const ratio = Math.min(MAX_DIMENSION / w, MAX_DIMENSION / h);
          renderW = Math.floor(w * ratio);
          renderH = Math.floor(h * ratio);
      }

      const offscreen = document.createElement('canvas');
      offscreen.width = renderW;
      offscreen.height = renderH;
      const ctx = offscreen.getContext('2d');
      if (ctx) {
          ctx.drawImage(img, 0, 0, renderW, renderH);
      }
      // Use this optimized source for all game rendering
      const optimizedSrc = offscreen.toDataURL('image/jpeg', 0.7);

      // 2. Calculate Logical Board Size (Fit to Screen)
      // Reserve space at the top for the select button (button is 24*24 px with padding, so ~80px total)
      const headerReservedSpace = 80; // Space reserved at the top for the select button
      
      // Calculate available space for the puzzle (75% of screen dimensions)
      const maxPuzzleWidth = window.innerWidth * 0.75;
      const maxPuzzleHeight = (window.innerHeight - headerReservedSpace) * 0.75;
      
      // Use original aspect ratio from w/h to calculate the actual dimensions
      const imageAspectRatio = w / h;
      
      // Calculate the maximum size that maintains aspect ratio and fits within 75% of screen
      let logicalW, logicalH;
      if (imageAspectRatio > 1) { // Landscape image
        // For landscape images, use 75% of width as the base
        logicalW = maxPuzzleWidth;
        logicalH = logicalW / imageAspectRatio;
        
        // Check if height exceeds the max height, and adjust if needed
        if (logicalH > maxPuzzleHeight) {
          logicalH = maxPuzzleHeight;
          logicalW = logicalH * imageAspectRatio;
        }
      } else { // Portrait or square image
        // For portrait images, use 75% of height as the base
        logicalH = maxPuzzleHeight;
        logicalW = logicalH * imageAspectRatio;
        
        // Check if width exceeds the max width, and adjust if needed
        if (logicalW > maxPuzzleWidth) {
          logicalW = maxPuzzleWidth;
          logicalH = logicalW / imageAspectRatio;
        }
      }

      // 3. Calculate Center Offset relative to Main container
      const boardAreaW = window.innerWidth;
      const boardAreaH = window.innerHeight - headerReservedSpace;

      const originX = (boardAreaW - logicalW) / 2;
      const originY = headerReservedSpace + (boardAreaH - logicalH) / 2;

      // 4. Cutting Algorithm
      const isPortrait = logicalW < logicalH;
      const shortLen = isPortrait ? logicalW : logicalH;
      const longLen = isPortrait ? logicalH : logicalW;

      const shortSideCount = targetShortSideCount;
      const idealPieceSize = shortLen / shortSideCount;
      const longSideCount = Math.max(shortSideCount, Math.round(longLen / idealPieceSize));

      const cols = isPortrait ? shortSideCount : longSideCount;
      const rows = isPortrait ? longSideCount : shortSideCount;

      setGameState(prev => ({
        ...prev,
        status: 'preview',
        imageUrl: optimizedSrc,
        imageSize: { width: logicalW, height: logicalH },
        gridSize: { rows, cols },
        boardOrigin: { x: originX, y: originY }
      }));
      
      generatePieces(logicalW, logicalH, rows, cols, originX, originY);
    };
  };

  const generatePieces = (w: number, h: number, rows: number, cols: number, originX: number, originY: number) => {
    const pW = w / cols;
    const pH = h / rows;
    const newPieces: PuzzlePiece[] = [];

    // Helper to get random edge: 1 or -1
    const randomEdge = () => Math.random() > 0.5 ? 1 : -1;

    // Track vertical edges from previous row to match them
    const vEdges: EdgeType[][] = Array(rows).fill(null).map(() => Array(cols + 1).fill(0));
    // Track horizontal edges
    const hEdges: EdgeType[][] = Array(rows + 1).fill(null).map(() => Array(cols).fill(0));

    // Pre-calculate edges
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Right edge (vertical)
        if (c < cols - 1) {
          vEdges[r][c+1] = randomEdge();
        }
        // Bottom edge (horizontal)
        if (r < rows - 1) {
          hEdges[r+1][c] = randomEdge();
        }
      }
    }

    let idCounter = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const top = r === 0 ? 0 : (hEdges[r][c] * -1 as EdgeType); // Invert neighbor
        const bottom = r === rows - 1 ? 0 : hEdges[r+1][c];
        const left = c === 0 ? 0 : (vEdges[r][c] * -1 as EdgeType);
        const right = c === cols - 1 ? 0 : vEdges[r][c+1];

        // Solved Position includes the Board Origin offset
        const solvedX = originX + c * pW;
        const solvedY = originY + r * pH;

        newPieces.push({
          id: idCounter++,
          row: r,
          col: c,
          shape: { top, right, bottom, left },
          currentPos: { x: solvedX, y: solvedY }, // Start in solved pos for preview
          solvedPos: { x: solvedX, y: solvedY },
          width: pW,
          height: pH,
          groupId: idCounter, // Unique group initially (mapped later properly)
          isSolved: false
        });
      }
    }
    // Correct initial group IDs
    const finalPieces = newPieces.map(p => ({...p, groupId: p.id}));
    setPieces(finalPieces);
  };

  const startGame = () => {
    // Scatter pieces uniformly across the screen
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    
    // Set to playing state immediately
    setGameState(prev => ({ ...prev, status: 'playing' }));
    setShowWinMessage(false);
    
    // Start the timer when the game starts
    setStartTime(Date.now());
    setElapsedTime(0);
    setIsTimerRunning(true);
    
    // Enable animation for the scatter phase
    setIsScattering(true);

    // Reference (Ghost) Image Bounds
    const imgX = gameState.boardOrigin.x;
    const imgY = gameState.boardOrigin.y;
    const imgW = gameState.imageSize.width;
    const imgH = gameState.imageSize.height;

    const scattered = pieces.map(p => {
        const padding = 20;
        const maxX = winW - p.width - padding;
        const maxY = winH - p.height - padding;
        
        let bestX = 0;
        let bestY = 0;

        // Try up to 10 times to find a position.
        // We prioritize positions OUTSIDE the reference image.
        for (let i = 0; i < 10; i++) {
             const randX = Math.max(padding, Math.random() * maxX);
             const randY = Math.max(padding + HEADER_RESERVED_SPACE, Math.random() * maxY);

             // Check overlap with the reference image area
             const isOverlapping = (
                 randX < imgX + imgW &&
                 randX + p.width > imgX &&
                 randY < imgY + imgH &&
                 randY + p.height > imgY
             );

             if (!isOverlapping) {
                 // Found a spot in the clear! Accept immediately.
                 bestX = randX;
                 bestY = randY;
                 break; 
             } else {
                 // Overlaps the reference image.
                 // Accept with low probability (e.g., 10%), to allow a few pieces to stay in center.
                 if (Math.random() < 0.1) {
                     bestX = randX;
                     bestY = randY;
                     break;
                 }
                 // Otherwise reject and try again
             }
             
             // Always update bestX/bestY to the last generated valid coord
             // so if we run out of attempts, we at least have a position.
             bestX = randX;
             bestY = randY;
        }

        return {
            ...p,
            currentPos: { x: bestX, y: bestY },
            isSolved: false // Reset solved status
        };
    });

    setPieces(scattered);

    // Turn off animation flag after the transition finishes (1s)
    setTimeout(() => {
      setIsScattering(false);
    }, 1000);
  };

  // --- Resize / Boundary Recovery ---
  useEffect(() => {
    const ensurePiecesInsideBounds = () => {
        if (gameState.status !== 'playing' && gameState.status !== 'won') return;
        
        const offsetX = VIEWPORT_MARGIN_X;
        const offsetY = VIEWPORT_MARGIN_Y;
        const winW = window.innerWidth;
        const winH = window.innerHeight;

        setPieces(prev => prev.map(p => {
             const minX = -offsetX;
             const maxX = winW - p.width - offsetX;
             const minY = -offsetY + HEADER_RESERVED_SPACE;
             const maxY = winH - p.height - offsetY;
             
             let newX = p.currentPos.x;
             let newY = p.currentPos.y;
             let changed = false;

             if (newX < minX) { newX = minX; changed = true; }
             if (newX > maxX) { newX = Math.max(minX, maxX); changed = true; }
             if (newY < minY) { newY = minY; changed = true; }
             if (newY > maxY) { newY = Math.max(minY, maxY); changed = true; }

             if (changed) {
                 return { ...p, currentPos: { x: newX, y: newY } };
             }
             return p;
        }));
    };

    let timeoutId: ReturnType<typeof setTimeout>;
    const handleResize = () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(ensurePiecesInsideBounds, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
        window.removeEventListener('resize', handleResize);
        clearTimeout(timeoutId);
    };
  }, [gameState.status]);


  // --- Hit Testing Logic ---

  const getPieceAtPosition = (clientX: number, clientY: number): number | null => {
      if (!boardRef.current || !hitTestCtxRef.current) return null;

      // Calculate click relative to Board Container (where pieces are absolute positioned)
      const rect = boardRef.current.getBoundingClientRect();
      // NO OFFSET SUBTRACTION HERE. Pieces are positioned at (0,0) relative to the board container.
      const boardX = clientX - rect.left;
      const boardY = clientY - rect.top;
      
      const ctx = hitTestCtxRef.current;
      const tabSize = getTabSize();

      // HIT TEST ORDER: Top to Bottom.
      // We must reverse the Rendering Order to check top-most pieces first.
      
      // 1. Iterate Groups in Reverse Render Order (Top groups first)
      const groupsReversed = [...uniqueGroupIds].reverse();
      
      for (const groupId of groupsReversed) {
           const groupPieces = pieces.filter(p => p.groupId === groupId);
           
           // 2. Iterate Pieces in Reverse Render Order (Top pieces in group first)
           // In React, later elements in array are rendered on top.
           const piecesReversed = [...groupPieces].reverse();

           for (const p of piecesReversed) {
              // Fast Bounding Box Check (with margin for tabs)
              // This is just to skip obvious misses
              const margin = tabSize * 1.5;
              if (
                  boardX < p.currentPos.x - margin ||
                  boardX > p.currentPos.x + p.width + margin ||
                  boardY < p.currentPos.y - margin ||
                  boardY > p.currentPos.y + p.height + margin
              ) {
                  continue;
              }

              // Precise Path Check
              // createJigsawPath returns path starting at (0,0) of the piece box (logical top-left)
              // We need to check if local point is in path
              const path = createJigsawPath(p.width, p.height, p.shape, tabSize);
              
              const localX = boardX - p.currentPos.x;
              const localY = boardY - p.currentPos.y;

              // isPointInPath works with non-zero winding rule by default.
              // It correctly handles holes (slots) as "outside" and tabs as "inside"
              if (ctx.isPointInPath(path, localX, localY)) {
                  return p.id;
              }
           }
      }

      return null;
  };

  // --- Interaction Logic ---

  const handlePointerDown = (e: React.PointerEvent) => {
    // Disable interaction during scatter animation
    if (isScattering) return;
    
    // Allow moving pieces even if 'won' to allow breaking the puzzle
    if (gameState.status !== 'playing' && gameState.status !== 'won') return;
    
    const pieceId = getPieceAtPosition(e.clientX, e.clientY);
    if (pieceId === null) return;

    // Find piece and its group
    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) return;

    // IMPORTANT: We allowed dragging solved pieces now, effectively "unsolving" them if moved.

    const groupMembers = pieces.filter(p => p.groupId === piece.groupId);
    
    // Store initial positions
    const startPosMap = new Map<number, Point>();
    groupMembers.forEach(p => startPosMap.set(p.id, { ...p.currentPos }));

    // Calculate movement constraints
    const offsetX = VIEWPORT_MARGIN_X;
    const offsetY = VIEWPORT_MARGIN_Y;
    const winW = window.innerWidth;
    const winH = window.innerHeight;

    let minDx = -Infinity;
    let maxDx = Infinity;
    let minDy = -Infinity;
    let maxDy = Infinity;

    groupMembers.forEach(p => {
        const currentX = p.currentPos.x;
        const currentY = p.currentPos.y;

        const pMinDx = -offsetX - currentX;
        const pMaxDx = (winW - p.width - offsetX) - currentX;
        
        const pMinDy = (-offsetY + HEADER_RESERVED_SPACE) - currentY;
        const pMaxDy = (winH - p.height - offsetY) - currentY;

        minDx = Math.max(minDx, pMinDx);
        maxDx = Math.min(maxDx, pMaxDx);
        minDy = Math.max(minDy, pMinDy);
        maxDy = Math.min(maxDy, pMaxDy);
    });

    dragRef.current = {
      active: true,
      pieceId: pieceId,
      groupId: piece.groupId,
      startPointer: { x: e.clientX, y: e.clientY },
      startPiecePos: startPosMap,
      constraints: { minDx, maxDx, minDy, maxDy }
    };

    setDraggingGroupId(piece.groupId);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;

    let dx = e.clientX - dragRef.current.startPointer.x;
    let dy = e.clientY - dragRef.current.startPointer.y;

    // Apply Constraints
    const { minDx, maxDx, minDy, maxDy } = dragRef.current.constraints;
    dx = Math.max(minDx, Math.min(dx, maxDx));
    dy = Math.max(minDy, Math.min(dy, maxDy));

    setPieces(prev => prev.map(p => {
      if (p.groupId === dragRef.current.groupId) {
        const start = dragRef.current.startPiecePos.get(p.id);
        if (start) {
          return {
            ...p,
            currentPos: { x: start.x + dx, y: start.y + dy }
          };
        }
      }
      return p;
    }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    
    const movedGroupId = dragRef.current.groupId;
    dragRef.current = { 
        active: false, 
        pieceId: null, 
        groupId: null, 
        startPointer: {x:0,y:0}, 
        startPiecePos: new Map(),
        constraints: { minDx: 0, maxDx: 0, minDy: 0, maxDy: 0 }
    };
    setDraggingGroupId(null);
    
    checkSnapping(movedGroupId);
  };

  const arePiecesPhysicallyAdjacent = (p1: PuzzlePiece, p2: PuzzlePiece): boolean => {
      const epsilon = 5;
      const dx = p1.currentPos.x - p2.currentPos.x;
      const dy = p1.currentPos.y - p2.currentPos.y;
      const w = p1.width;
      const h = p1.height;

      // P1 is Left of P2 (P1 Right connects to P2 Left)
      if (Math.abs(p1.currentPos.x + w - p2.currentPos.x) < epsilon && Math.abs(dy) < epsilon) return true;
      // P1 is Right of P2 (P1 Left connects to P2 Right)
      if (Math.abs(p2.currentPos.x + w - p1.currentPos.x) < epsilon && Math.abs(dy) < epsilon) return true;
      // P1 is Top of P2 (P1 Bottom connects to P2 Top)
      if (Math.abs(dx) < epsilon && Math.abs(p1.currentPos.y + h - p2.currentPos.y) < epsilon) return true;
      // P1 is Bottom of P2 (P1 Top connects to P2 Bottom)
      if (Math.abs(dx) < epsilon && Math.abs(p2.currentPos.y + h - p1.currentPos.y) < epsilon) return true;

      return false;
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
      // Allow interaction if playing or won (to break puzzle)
      if (gameState.status !== 'playing' && gameState.status !== 'won') return;
      
      const pieceId = getPieceAtPosition(e.clientX, e.clientY);
      if (pieceId === null) return;

      // If we are double clicking, we might be breaking a "won" puzzle.
      // So revert status to playing if it was won.
      if (gameState.status === 'won') {
          setGameState(prev => ({...prev, status: 'playing'}));
          setShowWinMessage(false);
      }

      setPieces(prev => {
          const piece = prev.find(p => p.id === pieceId);
          if (!piece) return prev;
          
          const oldGroupId = piece.groupId;
          const groupMembers = prev.filter(p => p.groupId === oldGroupId);
          if (groupMembers.length <= 1) return prev; // already alone

          // 1. Assign new group ID to the detached piece and move it
          let nextGroupId = Math.max(...prev.map(p => p.groupId)) + 1;
          const newDetachedGroupId = nextGroupId++;

          let updatedPieces = prev.map(p => {
              if (p.id === pieceId) {
                  return {
                      ...p,
                      groupId: newDetachedGroupId,
                      currentPos: { x: p.currentPos.x + 20, y: p.currentPos.y + 20 },
                      isSolved: false // Reset solved status
                  };
              }
              return p;
          });

          // 2. Connectivity Check for the REMAINING members of the old group
          const remainingMembers = updatedPieces.filter(p => p.groupId === oldGroupId);
          
          if (remainingMembers.length > 0) {
              const visited = new Set<number>();
              const clusters: PuzzlePiece[][] = [];

              for (const member of remainingMembers) {
                  if (visited.has(member.id)) continue;

                  // BFS to find all connected pieces
                  const cluster: PuzzlePiece[] = [];
                  const queue = [member];
                  visited.add(member.id);

                  while (queue.length > 0) {
                      const current = queue.shift()!;
                      cluster.push(current);

                      // Find neighbors in remainingMembers that are spatially adjacent
                      const neighbors = remainingMembers.filter(n => 
                          !visited.has(n.id) && arePiecesPhysicallyAdjacent(current, n)
                      );

                      for (const n of neighbors) {
                          visited.add(n.id);
                          queue.push(n);
                      }
                  }
                  clusters.push(cluster);
              }

              // If more than 1 cluster, we have splits.
              if (clusters.length > 1) {
                  updatedPieces = updatedPieces.map(p => {
                      if (p.groupId !== oldGroupId) return p;

                      // Find which cluster this piece belongs to
                      const clusterIndex = clusters.findIndex(c => c.some(cp => cp.id === p.id));
                      
                      if (clusterIndex > 0) {
                          return { 
                              ...p, 
                              groupId: nextGroupId + clusterIndex - 1,
                              isSolved: false // Reset solved for split chunks
                          }; 
                      }
                      // Cluster 0 keeps oldGroupId. 
                      return { ...p, isSolved: false };
                  });
              } else {
                   // Only one cluster left (minus the detached piece).
                   updatedPieces = updatedPieces.map(p => {
                       if (p.groupId === oldGroupId) return { ...p, isSolved: false };
                       return p;
                   });
              }
          }

          return updatedPieces;
      });
  };

  // --- Snapping and Win Logic ---

  const checkSnapping = (activeGroupId: number | null) => {
    if (activeGroupId === null) return;

    setPieces(currentPieces => {
      const activeGroup = currentPieces.filter(p => p.groupId === activeGroupId);
      const others = currentPieces.filter(p => p.groupId !== activeGroupId);
      
      let bestMerge: {
          targetPieceId: number;
          delta: Point;
      } | null = null;

      // 1. Find the FIRST valid snap connection between any piece in activeGroup and any piece in others
      for (const activePiece of activeGroup) {
          if (bestMerge) break;

          for (const other of others) {
              const dx = activePiece.currentPos.x - other.currentPos.x;
              const dy = activePiece.currentPos.y - other.currentPos.y;
              const w = activePiece.width;
              const h = activePiece.height;

              // Check 4 geometric sides
              
              // Right of Active meets Left of Other
              // Active: [..] | Other: [..]
              // Distance: (Ax + w) - Ox approx 0, Ay - Oy approx 0
              if (
                  Math.abs((activePiece.currentPos.x + w) - other.currentPos.x) < SNAP_DISTANCE &&
                  Math.abs(activePiece.currentPos.y - other.currentPos.y) < SNAP_DISTANCE &&
                  areEdgesCompatible(activePiece.shape.right, other.shape.left)
              ) {
                   bestMerge = {
                       targetPieceId: other.id,
                       delta: { 
                           x: other.currentPos.x - w - activePiece.currentPos.x, 
                           y: other.currentPos.y - activePiece.currentPos.y 
                       }
                   };
                   break;
              }

              // Left of Active meets Right of Other
              // Other: [..] | Active: [..]
              if (
                  Math.abs(activePiece.currentPos.x - (other.currentPos.x + w)) < SNAP_DISTANCE &&
                  Math.abs(activePiece.currentPos.y - other.currentPos.y) < SNAP_DISTANCE &&
                  areEdgesCompatible(activePiece.shape.left, other.shape.right)
              ) {
                  bestMerge = {
                       targetPieceId: other.id,
                       delta: { 
                           x: other.currentPos.x + w - activePiece.currentPos.x, 
                           y: other.currentPos.y - activePiece.currentPos.y 
                       }
                   };
                   break;
              }

              // Bottom of Active meets Top of Other
              if (
                  Math.abs(activePiece.currentPos.x - other.currentPos.x) < SNAP_DISTANCE &&
                  Math.abs((activePiece.currentPos.y + h) - other.currentPos.y) < SNAP_DISTANCE &&
                  areEdgesCompatible(activePiece.shape.bottom, other.shape.top)
              ) {
                  bestMerge = {
                       targetPieceId: other.id,
                       delta: { 
                           x: other.currentPos.x - activePiece.currentPos.x, 
                           y: other.currentPos.y - h - activePiece.currentPos.y 
                       }
                   };
                   break;
              }

              // Top of Active meets Bottom of Other
              if (
                  Math.abs(activePiece.currentPos.x - other.currentPos.x) < SNAP_DISTANCE &&
                  Math.abs(activePiece.currentPos.y - (other.currentPos.y + h)) < SNAP_DISTANCE &&
                  areEdgesCompatible(activePiece.shape.top, other.shape.bottom)
              ) {
                  bestMerge = {
                       targetPieceId: other.id,
                       delta: { 
                           x: other.currentPos.x - activePiece.currentPos.x, 
                           y: other.currentPos.y + h - activePiece.currentPos.y 
                       }
                   };
                   break;
              }
          }
      }

      if (bestMerge) {
          const { targetPieceId, delta } = bestMerge;
          const targetGroupPiece = currentPieces.find(p => p.id === targetPieceId)!;
          const targetGroupId = targetGroupPiece.groupId;
          const targetGroup = currentPieces.filter(p => p.groupId === targetGroupId);

          // 2. VALIDATE THE MERGE
          // Ensure that if we move activeGroup by delta, ALL touching edges are compatible.
          if (validateGroupMerge(activeGroup, targetGroup, delta)) {
              
              // Apply Merge
              const nextPieces = currentPieces.map(p => {
                  if (p.groupId === activeGroupId) {
                      return {
                          ...p,
                          groupId: targetGroupId,
                          currentPos: { x: p.currentPos.x + delta.x, y: p.currentPos.y + delta.y }
                      };
                  }
                  return p;
              });

              // Check Win Condition immediately after update
              checkWinCondition(nextPieces);

              return nextPieces;
          }
      }
      
      return currentPieces;
    });
  };

  const areEdgesCompatible = (e1: EdgeType, e2: EdgeType) => {
      // 1 (Tab) + -1 (Slot) = 0 -> OK
      // 0 (Flat) + 0 (Flat) = 0 -> OK (Border pieces snapping together)
      // 1 + 1 = 2 -> NO
      // -1 + -1 = -2 -> NO
      return e1 + e2 === 0;
  };

  const validateGroupMerge = (activeGroup: PuzzlePiece[], targetGroup: PuzzlePiece[], delta: Point): boolean => {
      const epsilon = 5; // tolerance
      
      for (const activePiece of activeGroup) {
          const proposedX = activePiece.currentPos.x + delta.x;
          const proposedY = activePiece.currentPos.y + delta.y;
          const w = activePiece.width;
          const h = activePiece.height;

          for (const targetPiece of targetGroup) {
              const tx = targetPiece.currentPos.x;
              const ty = targetPiece.currentPos.y;

              // Check adjacency for this specific pair
              
              // Active Right vs Target Left
              if (Math.abs((proposedX + w) - tx) < epsilon && Math.abs(proposedY - ty) < epsilon) {
                  if (!areEdgesCompatible(activePiece.shape.right, targetPiece.shape.left)) return false;
              }
              // Active Left vs Target Right
              if (Math.abs(proposedX - (tx + w)) < epsilon && Math.abs(proposedY - ty) < epsilon) {
                  if (!areEdgesCompatible(activePiece.shape.left, targetPiece.shape.right)) return false;
              }
              // Active Bottom vs Target Top
              if (Math.abs(proposedX - tx) < epsilon && Math.abs((proposedY + h) - ty) < epsilon) {
                  if (!areEdgesCompatible(activePiece.shape.bottom, targetPiece.shape.top)) return false;
              }
              // Active Top vs Target Bottom
              if (Math.abs(proposedX - tx) < epsilon && Math.abs(proposedY - (ty + h)) < epsilon) {
                  if (!areEdgesCompatible(activePiece.shape.top, targetPiece.shape.bottom)) return false;
              }
          }
      }
      return true;
  };

  const checkWinCondition = (currentPieces: PuzzlePiece[]) => {
      const uniqueGroups = new Set(currentPieces.map(p => p.groupId));
      
      // 1. Must be all one group
      if (uniqueGroups.size !== 1) return;

      // 2. Must verify that the relative positions match the solved positions
      const anchor = currentPieces[0];
      const anchorSolvedX = anchor.solvedPos.x;
      const anchorSolvedY = anchor.solvedPos.y;
      const anchorCurrentX = anchor.currentPos.x;
      const anchorCurrentY = anchor.currentPos.y;
      
      const offsetX = anchorCurrentX - anchorSolvedX;
      const offsetY = anchorCurrentY - anchorSolvedY;
      
      const tolerance = 5; // Pixels

      const isCorrect = currentPieces.every(p => {
          const expectedX = p.solvedPos.x + offsetX;
          const expectedY = p.solvedPos.y + offsetY;
          return Math.abs(p.currentPos.x - expectedX) < tolerance && 
                 Math.abs(p.currentPos.y - expectedY) < tolerance;
      });

      if (isCorrect) {
          const distToBoard = Math.hypot(offsetX, offsetY);
          
          if (distToBoard < SNAP_DISTANCE) {
             setPieces(prev => prev.map(p => ({
                 ...p,
                 currentPos: { x: p.solvedPos.x, y: p.solvedPos.y },
                 isSolved: true
             })));
          } else {
              setPieces(prev => prev.map(p => ({...p, isSolved: true})));
          }

          setGameState(prev => ({...prev, status: 'won'}));
          // 强制重新渲染Confetti组件
          setConfettiKey(prev => prev + 1);
          setShowWinMessage(true);
          
          // Stop the timer when the game is won
          setIsTimerRunning(false);
          
          // Auto-hide win message after effect ends to let user continue
          setTimeout(() => setShowWinMessage(false), 6000);
      }
  };

  // Timer effect
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    
    if (isTimerRunning) {
      intervalId = setInterval(() => {
        if (startTime) {
          setElapsedTime(Date.now() - startTime);
        }
      }, 10); // Update every 10ms for smoother display
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isTimerRunning, startTime]);

  // Initialize with first image in easy mode
  useEffect(() => {
    // Set to easy mode (4 pieces on short side)
    setTargetShortSideCount(4);
    
    // Load the first task image
    const img = new Image();
    const src = '/assets/images/tasks/1.webp';
    img.src = src;
    
    img.onload = () => {
      loadImage(src);
    };
  }, []);

  // 添加治愈功能函数
  const healPuzzle = () => {
    // 停止计时器
    setIsTimerRunning(false);
    
    // 计算未解决的拼图块数量
    const unsolvedPieces = pieces.filter(piece => !piece.isSolved).length;
    
    // 根据未解决的拼图块数量计算动画持续时间 (1-5秒)
    // 最少1秒，最多5秒
    const animationDuration = Math.min(5000, Math.max(1000, unsolvedPieces * 100));
    
    // 设置动画持续时间
    setHealAnimationDuration(animationDuration);
    
    // 先将所有拼图块合并到一个组中
    setPieces(prevPieces => {
      const unifiedGroupId = prevPieces.length > 0 ? prevPieces[0].groupId : 0;
      return prevPieces.map(piece => ({
        ...piece,
        groupId: unifiedGroupId
      }));
    });
    
    // 触发动画，将所有拼图块移动到解决位置
    // 使用setTimeout确保状态更新已经应用后再改变位置
    setTimeout(() => {
      setIsScattering(true);
      
      // 短暂延迟后将所有拼图块移动到解决位置并标记为已解决
      setTimeout(() => {
        setPieces(prevPieces => 
          prevPieces.map(piece => ({
            ...piece,
            currentPos: { ...piece.solvedPos },
            isSolved: true
          }))
        );
        
        // 更新游戏状态为已完成
        setGameState(prev => ({ ...prev, status: 'won' }));
        
        // 强制重新渲染Confetti组件
        setConfettiKey(prev => prev + 1);
        
        // 显示胜利信息
        setShowWinMessage(true);
      }, 50);
      
      // 动画结束后关闭动画状态
      setTimeout(() => {
        setIsScattering(false);
      }, animationDuration);
      
      // 6秒后隐藏胜利信息
      setTimeout(() => setShowWinMessage(false), 6000);
    }, 0);
  };

  return (
    <div 
      className="flex flex-col h-screen text-white overflow-hidden"
      style={{ touchAction: 'none', backgroundColor: 'transparent' }}
    >
      {/* Main Board */}
      <main 
        className="flex-1 relative overflow-hidden" 
        ref={boardRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        style={{ backgroundColor: 'transparent' }}
      >
        {/* 幻视按钮 */}
        {(gameState.status === 'playing' || gameState.status === 'won') && (
          <button
            className="absolute top-10 left-32 z-40 flex items-center cursor-pointer hover:opacity-80 transition-opacity duration-200 bg-transparent border-none"
            style={{ color: '#a582fe' }}
            onClick={() => setShowReferenceImage(!showReferenceImage)}
          >
            <img 
              src="/assets/images/magic-1.webp" 
              alt="Magic" 
              className="h-12"
              style={{ 
                filter: 'none',
                forcedColorAdjust: 'none',
                colorScheme: 'dark'
              }}
            />
            <span className="text-1xl font-bold">【幻视】</span>
          </button>
        )}

        {/* 治愈按钮 */}
        {(gameState.status === 'playing' || gameState.status === 'won') && (
          <button
            className="absolute top-10 left-64 z-40 flex items-center cursor-pointer hover:opacity-80 transition-opacity duration-200 bg-transparent border-none"
            style={{ color: '#908d8e' }}
            onClick={healPuzzle}
          >
            <img 
              src="/assets/images/magic-2.webp" 
              alt="Magic" 
              className="h-12"
              style={{ 
                filter: 'none',
                forcedColorAdjust: 'none',
                colorScheme: 'dark'
              }}
            />
            <span className="text-1xl font-bold">【治愈】</span>
          </button>
        )}

        {/* 疑问按钮 */}
        {(gameState.status === 'playing' || gameState.status === 'won') && (
          <button
            className="absolute top-10 right-56 z-40 flex items-center cursor-pointer hover:opacity-80 transition-opacity duration-200 bg-transparent border-none"
            style={{ color: '#b4a049' }}
            onClick={() => setShowRules(true)}
          >
            <img 
              src="/assets/images/question.webp" 
              alt="Magic" 
              className="h-12"
              style={{ 
                filter: 'none',
                forcedColorAdjust: 'none',
                colorScheme: 'dark'
              }}
            />
            <span className="text-1xl font-bold">【规则】</span>
          </button>
        )}

        {/* Image Selection Button */}
        {(gameState.status === 'playing' || gameState.status === 'won' || gameState.status === 'preview') && (
          <img 
            src="/assets/images/select.webp" 
            alt="Select" 
            onClick={() => setShowTaskSelector(true)}
            className="absolute top-2 left-4 z-40 w-24 h-24 cursor-pointer hover:opacity-80 transition-opacity duration-200"
            style={{ 
              filter: 'none',
              forcedColorAdjust: 'none',
              colorScheme: 'dark'
            }}
          />
        )}
        
        {/* Timer Display */}
        {(gameState.status === 'playing' || gameState.status === 'won' || gameState.status === 'preview') && (
          <div 
            className="absolute top-0 right-4 z-40 text-white text-2xl font-bold flex items-center"
            style={{
              backgroundImage: 'url(/assets/images/counter.webp)',
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
              width: '190px',
              height: '130px',
              fontFamily: 'Num-Regular, monospace',
              filter: 'none',
              forcedColorAdjust: 'none',
              colorScheme: 'dark'
            }}
          >
            <div style={{ 
              paddingLeft: '30%', 
              width: '100%',
              textAlign: 'left'

            }}>
              {(() => {
                const totalCentiseconds = Math.floor(elapsedTime / 10);
                const minutes = Math.floor(totalCentiseconds / 6000);
                const seconds = Math.floor((totalCentiseconds % 6000) / 100);
                const centiseconds = totalCentiseconds % 100;
                
                return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${centiseconds.toString().padStart(2, '0')}`;
              })()}
            </div>
          </div>
        )}

        {/* Ghost Image (Playing Guide) */}
        {(gameState.status === 'playing' || gameState.status === 'won') && gameState.imageUrl && showReferenceImage && (
            <img 
                src={gameState.imageUrl}
                alt=""
                style={{
                    position: 'absolute',
                    top: gameState.boardOrigin.y,
                    left: gameState.boardOrigin.x,
                    width: gameState.imageSize.width,
                    height: gameState.imageSize.height,
                    opacity: 0.15,
                    pointerEvents: 'none',
                    filter: 'grayscale(50%)',
                    display: 'block'
                }}
            />
        )}

        {/* Render Puzzle Groups */}
        {(gameState.status === 'playing' || gameState.status === 'won') && pieces.length > 0 && (
           <>
              {uniqueGroupIds.map(groupId => {
                  const groupPieces = pieces.filter(p => p.groupId === groupId);
                  const isDragging = draggingGroupId === groupId;
                  const isSolvedGroup = groupPieces[0].isSolved;
                  
                  return (
                      <div 
                        key={groupId}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            pointerEvents: 'none', // Allow clicks to pass through to container hit test
                            zIndex: isDragging ? 100 : (isSolvedGroup ? 0 : 10),
                            // Apply shadow to the group container for depth.
                            // The highlight color is now handled by the Canvas stroke in JigsawPiece.
                            // Drop shadow helps separate the group from the board.
                            filter: isDragging 
                                ? 'drop-shadow(0 15px 25px rgba(0,0,0,0.6))' 
                                : (isSolvedGroup ? 'none' : 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))'),
                            transition: 'filter 0.2s',
                            willChange: 'filter'
                        }}
                      >
                          {groupPieces.map(piece => {
                             // Check neighbors IN THE SAME GROUP to hide internal borders
                             // We use strict equality on currentPos to be robust against "incorrect" snaps
                             const epsilon = 5;
                             const w = piece.width;
                             const h = piece.height;
                             const { x, y } = piece.currentPos;
                             
                             // Helper to find a neighbor in this group
                             const hasNeighborAt = (tx: number, ty: number) => {
                                 return groupPieces.some(gp => 
                                    Math.abs(gp.currentPos.x - tx) < epsilon &&
                                    Math.abs(gp.currentPos.y - ty) < epsilon
                                 );
                             };

                             const connectedSides = {
                                 right: hasNeighborAt(x + w, y),
                                 left: hasNeighborAt(x - w, y),
                                 bottom: hasNeighborAt(x, y + h),
                                 top: hasNeighborAt(x, y - h)
                             };

                             return (
                               <JigsawPiece
                                 key={piece.id}
                                 piece={piece}
                                 imageSrc={gameState.imageUrl!}
                                 pieceSize={getPieceSize()}
                                 fullImageSize={gameState.imageSize}
                                 tabSize={getTabSize()}
                                 isDragging={isDragging}
                                 connectedSides={connectedSides}
                                 animatePosition={isScattering}
                                 animationDuration={healAnimationDuration}
                               />
                             );
                          })}
                      </div>
                  );
              })}
           </>
        )}

        {/* Confetti Effect */}
        {gameState.status === 'won' && <Confetti key={confettiKey} />}

        {/* Preview Overlay */}
        {gameState.status === 'preview' && pieces.length > 0 && (
            <div 
                className="absolute shadow-2xl bg-black"
                style={{
                    top: gameState.boardOrigin.y,
                    left: gameState.boardOrigin.x,
                    width: gameState.imageSize.width,
                    height: gameState.imageSize.height
                }}
            >
               <PreviewCanvas 
                 pieces={pieces}
                 width={gameState.imageSize.width}
                 height={gameState.imageSize.height}
                 pieceSize={getPieceSize()}
                 tabSize={getTabSize()}
               />
               <img 
                 src={gameState.imageUrl!} 
                 alt="Preview" 
                 className="opacity-50 block w-full h-full"
               />
               <div className="absolute inset-0 flex items-center justify-center">
                 <button 
                   onClick={startGame}
                   className="text-white px-8 py-4 text-2xl font-bold flex items-center justify-center animate-bounce border-0 cursor-pointer"
                   style={{
                     backgroundImage: 'url(/assets/images/button.webp)',
                     backgroundSize: '100% 100%',
                     backgroundRepeat: 'no-repeat',
                     width: '250px',
                     height: '80px'
                   }}
                 >
                   <div className="flex items-center">
                     <PlayIcon />
                     <span className="ml-2">开始游戏</span>
                   </div>
                 </button>
               </div>
            </div>
        )}



        {/* Win Overlay */}
        {gameState.status === 'won' && showWinMessage && (
             <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-[200] pointer-events-none animate-in fade-in duration-500">
                 <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-2xl text-center shadow-2xl">
                     <h2 className="text-4xl font-bold text-white mb-2 drop-shadow-md">拼图完成!</h2>
                     <p className="text-indigo-200">干得漂亮!</p>
                 </div>
             </div>
        )}

        {/* Task Image Selector */}
        {showTaskSelector && (
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              // 防止点击弹窗背景时事件冒泡
              e.stopPropagation();
              setShowTaskSelector(false);
            }}
          >
            <div 
              className="bg-slate-800 rounded-xl p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto border border-slate-700"
              style={{ 
                backgroundImage: 'url(/assets/images/background2.webp)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundColor: 'rgba(30, 41, 59, 0.9)'
              }}
              onClick={(e) => {
                // 防止点击弹窗内容时关闭弹窗
                e.stopPropagation();
              }}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">选择图片</h2>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowTaskSelector(false);
                  }}
                  className="text-slate-400 hover:text-white text-3xl z-50 relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-700 transition-colors"
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto p-2">
                {Array.from({ length: 9 }, (_, i) => i + 1).map((id) => (
                  <div 
                    key={id}
                    className="aspect-[2/1] rounded-lg overflow-hidden cursor-pointer transform transition-transform hover:scale-105 bg-slate-700"
                    onClick={() => {
                      const img = new Image();
                      img.src = `/assets/images/tasks/${id}.webp`;
                      img.onload = () => {
                        setShowTaskSelector(false);
                        loadImage(img.src);
                      }}
                    }
                  >
                    <img 
                      src={`/assets/images/tasks/${id}.webp`} 
                      alt={`图片 ${id}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
              {/* Custom Image Upload Section */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-white mb-3">上传自己的图片</h3>
                <label className="flex flex-col items-center justify-center w-full aspect-[3/1] border-2 border-dashed border-slate-400 rounded-lg cursor-pointer bg-slate-800/50 hover:bg-slate-700/50 transition-colors">
                  <div className="flex flex-col items-center justify-center">
                    <UploadIcon />
                    <p className="text-sm text-slate-300 mt-1">点击上传图片</p>
                    <p className="text-xs text-slate-400 mt-1">支持 JPG, PNG, WEBP 格式</p>
                  </div>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      handleImageUpload(e);
                      setShowTaskSelector(false);
                    }}
                  />
                </label>
              </div>
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-white mb-3">难度等级</h3>
                <div className="flex gap-3">
                  <button 
                    onClick={() => {
                      setTargetShortSideCount(3);
                    }}
                    className={`flex-1 py-2 rounded-lg transition-colors ${
                      targetShortSideCount === 3 
                        ? 'bg-stone-600 text-white' 
                        : 'bg-stone-200 text-stone-800 hover:bg-stone-300'
                    }`}
                  >
                    简单
                  </button>
                  <button 
                    onClick={() => {
                      setTargetShortSideCount(4);
                    }}
                    className={`flex-1 py-2 rounded-lg transition-colors ${
                      targetShortSideCount === 4 
                        ? 'bg-stone-600 text-white' 
                        : 'bg-stone-200 text-stone-800 hover:bg-stone-300'
                    }`}
                  >
                    普通
                  </button>
                  <button 
                    onClick={() => {
                      setTargetShortSideCount(6);
                    }}
                    className={`flex-1 py-2 rounded-lg transition-colors ${
                      targetShortSideCount === 6 
                        ? 'bg-stone-600 text-white' 
                        : 'bg-stone-200 text-stone-800 hover:bg-stone-300'
                    }`}
                  >
                    困难
                  </button>
                  <div className="flex flex-1">
                    <input
                      type="number"
                      min="2"
                      max="50"
                      value={targetShortSideCount}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (value >= 2 && value <= 50) {
                          setTargetShortSideCount(value);
                        } else if (e.target.value === '' || value < 2) {
                          setTargetShortSideCount(2);
                        } else if (value > 50) {
                          setTargetShortSideCount(50);
                        }
                      }}
                      className="flex-1 py-2 rounded-lg bg-stone-200 text-stone-800 px-3 w-full"
                    />
                  </div>
                </div>
                {/* <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => setShowReferenceImage(!showReferenceImage)}
                    className={`flex items-center gap-2 py-2 px-4 rounded-lg transition-colors ${
                      showReferenceImage 
                        ? 'bg-stone-600 text-white' 
                        : 'bg-stone-200 text-stone-800 hover:bg-stone-300'
                    }`}
                  >
                    <span>{showReferenceImage ? '隐藏' : '显示'}参考图片</span>
                  </button>
                </div> */}
              </div>
            </div>
          </div>
        )}

        {/* Rules Popup */}
        {showRules && (
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              // 防止点击弹窗背景时事件冒泡
              e.stopPropagation();
              setShowRules(false);
            }}
          >
            <div 
              className="bg-stone-100 rounded-xl p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto border border-stone-300"
              style={{ 
                backgroundImage: 'url(/assets/images/background2.webp)',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundColor: '#fdfdfd'
              }}
              onClick={(e) => {
                // 防止点击弹窗内容时关闭弹窗
                e.stopPropagation();
              }}
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-stone-800">游戏规则</h2>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRules(false);
                  }}
                  className="text-stone-500 hover:text-stone-800 text-3xl z-50 relative w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-200 transition-colors"
                >
                  ×
                </button>
              </div>
              <div className="text-stone-700 space-y-4">
                <div className="bg-stone-200/50 p-4 rounded-lg">
                  <h3 className="text-lg font-bold mb-2 text-stone-800">基本玩法</h3>
                  <p>1. 拖拽拼图块到正确位置，当拼图块靠近正确位置时会自动吸附</p>
                  <p>2. 相邻的拼图块会自动连接成组，可以整体移动</p>
                  <p>3. 双击已连接的拼图组可以将其分离</p>
                </div>
                
                <div className="bg-stone-200/50 p-4 rounded-lg">
                  <h3 className="text-lg font-bold mb-2 text-stone-800">操作说明</h3>
                  <p>1. 点击【幻视】按钮可以显示/隐藏参考图像</p>
                  <p>2. 点击【治愈】按钮可以自动完成拼图</p>
                  <p>3. 点击左上角选图按钮可以更换图片和难度</p>
                </div>
                
                <div className="bg-stone-200/50 p-4 rounded-lg">
                  <h3 className="text-lg font-bold mb-2 text-stone-800">难度说明</h3>
                  <p>1. 简单：3片</p>
                  <p>2. 普通：4片</p>
                  <p>3. 困难：6片</p>
                  <p>4. 自定义：可以输入2-50之间的数字</p>
                </div>
                
                <div className="bg-stone-200/50 p-4 rounded-lg">
                  <h3 className="text-lg font-bold mb-2 text-stone-800">计时规则</h3>
                  <p>1. 开始游戏后计时器会自动开始计时</p>
                  <p>2. 完成拼图后计时器会停止</p>
                  <p>3. 时间格式为：分:秒:毫秒</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {gameState.status === 'idle' && !showTaskSelector && (
            <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                <div className="text-center">
                    <p className="text-2xl font-light mb-2">上传图片开始游戏</p>
                    <p className="text-sm opacity-50">支持格式: JPG, PNG, WEBP</p>
                </div>
            </div>
        )}
        
        {/* Image Selection Button */}
        {gameState.status === 'idle' && (
          <img 
            src="/assets/images/select.webp" 
            alt="Select" 
            onClick={() => setShowTaskSelector(true)}
            className="absolute top-2 left-4 z-40 w-24 h-24 cursor-pointer hover:opacity-80 transition-opacity duration-200"
            style={{ 
              filter: 'none',
              forcedColorAdjust: 'none',
              colorScheme: 'dark'
            }}
          />
        )}
      </main>
    </div>
  );
}
