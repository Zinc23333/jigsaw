export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

// 1 = Tab (Protrusion), -1 = Slot (Concave), 0 = Edge (Flat)
export type EdgeType = 1 | -1 | 0;

export interface PieceShape {
  top: EdgeType;
  right: EdgeType;
  bottom: EdgeType;
  left: EdgeType;
}

export interface PuzzlePiece {
  id: number;
  row: number;
  col: number;
  shape: PieceShape;
  // Position relative to the puzzle board (0,0 is top-left of the original image area)
  currentPos: Point;
  // The correct position where this piece belongs (relative to top-left of assembled puzzle)
  solvedPos: Point;
  width: number;
  height: number;
  // Which group of pieces this belongs to. Initially, every piece is its own group.
  groupId: number;
  isSolved: boolean;
}

export interface GameState {
  status: 'idle' | 'loading' | 'preview' | 'playing' | 'won';
  imageUrl: string | null;
  imageSize: Size;
  gridSize: { rows: number; cols: number };
}
