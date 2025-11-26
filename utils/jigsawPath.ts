import { EdgeType, Size, PieceShape } from '../types';

/**
 * Draws a jigsaw path on a canvas context.
 * 
 * @param ctx The Canvas rendering context
 * @param width The width of the piece bounding box (excluding tabs)
 * @param height The height of the piece bounding box (excluding tabs)
 * @param shape The shape configuration (top, right, bottom, left)
 * @param tabSize The size of the tabs (approx 20-25% of piece size)
 */
export const drawJigsawPath = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  shape: { top: EdgeType; right: EdgeType; bottom: EdgeType; left: EdgeType },
  tabSize: number
) => {
   // Legacy wrapper if needed, but we primarily use renderPiecePath now
   const path = createJigsawPath(width, height, shape, tabSize);
   ctx.stroke(path);
};

// Re-implementing with a robust parameterized path generator
// Coordinates are relative to Top-Left of the piece rect (not including tabs)
export const createJigsawPath = (
    width: number, 
    height: number, 
    shape: { top: EdgeType; right: EdgeType; bottom: EdgeType; left: EdgeType },
    tabSize: number
): Path2D => {
    const path = new Path2D();
    renderPiecePath(path, width, height, shape, tabSize);
    return path;
}


// ----------------------------------------------------------------------
// THIRD ATTEMPT: The definitive procedural curve generation
// ----------------------------------------------------------------------

// Base curve definition for a tab (0 to 100 on X axis, Y varies)
// Returns array of command: [cmd, x, y, x, y, ...]
// cmd: L = LineTo, C = BezierCurveTo
const getTabPath = (sign: number): any[] => {
    const s = sign; // 1 for out, -1 for in
    
    if (s === 0) return [['L', 1, 0]];

    const h = -s; // Height multiplier. Negative Y is "Up" in canvas.

    // "2/3 Circle" / Round Tab Shape
    // Designed to look like a circle on a small neck.
    // X range: 0 to 1 (Piece edge length)
    // Y range: scaled by tabSize
    
    // We want a shape roughly centered at 0.5.
    // Base width: 0.2 (0.4 to 0.6)
    // Max width: 0.3 (0.35 to 0.65)
    // Height: ~1.0
    
    return [
        // 1. Line to start of neck
        ['L', 0.40, 0], 
        
        // 2. Curve: Left side of the "Ball" (Bulging out left)
        ['C', 
         0.40, h * 0.2,   // CP1: Neck going straight out
         0.33, h * 0.5,   // CP2: Bulge left (Undercut)
         0.42, h * 0.9    // End: Top left shoulder
        ],
        
        // 3. Curve: Top Dome (Circular top)
        ['C',
         0.45, h * 1.2,   // CP1: Peak Left
         0.55, h * 1.2,   // CP2: Peak Right
         0.58, h * 0.9    // End: Top right shoulder
        ],
        
        // 4. Curve: Right side of the "Ball" (Bulging out right)
        ['C',
         0.67, h * 0.5,   // CP1: Bulge right (Undercut)
         0.60, h * 0.2,   // CP2: Neck going straight in
         0.60, 0          // End: Base of neck
        ],
        
        // 5. Line to end of edge
        ['L', 1.0, 0]
    ];
};

export const renderPiecePath = (
    ctx: CanvasRenderingContext2D | Path2D,
    width: number,
    height: number,
    shape: PieceShape,
    tabSize: number // actual pixel size of tab protrusion
) => {
    const originX = 0;
    const originY = 0;

    // Helper to transform abstract 0-1 coords to actual canvas coords
    const execute = (cmds: any[], len: number, rot: number, offsetX: number, offsetY: number) => {
        // Rotation matrix
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        
        const tx = (x: number, y: number) => offsetX + (x * len * cos) - (y * tabSize * sin);
        const ty = (x: number, y: number) => offsetY + (x * len * sin) + (y * tabSize * cos);

        cmds.forEach(op => {
            const type = op[0];
            if (type === 'L') {
                ctx.lineTo(tx(op[1], op[2]), ty(op[1], op[2]));
            } else if (type === 'C') {
                ctx.bezierCurveTo(
                    tx(op[1], op[2]), ty(op[1], op[2]),
                    tx(op[3], op[4]), ty(op[3], op[4]),
                    tx(op[5], op[6]), ty(op[5], op[6])
                );
            }
        });
    };

    if (ctx instanceof Path2D) {
       ctx.moveTo(originX, originY);
    } else {
       ctx.moveTo(originX, originY);
    }

    // TOP: (0,0) -> (w, 0). Rotation 0.
    execute(getTabPath(shape.top), width, 0, originX, originY);

    // RIGHT: (w,0) -> (w, h). Rotation 90 deg (PI/2).
    execute(getTabPath(shape.right), height, Math.PI/2, originX + width, originY);

    // BOTTOM: (w,h) -> (0, h). Rotation 180 deg (PI).
    // Note: shape.bottom is relative to the piece center. 
    // If bottom is '1' (out), it points DOWN. 
    // In our path logic, negative Y is "Out/Left" relative to line direction. 
    // Walking right-to-left (180deg), "Left" is Down. So -1 * -1 = +1 (Down).
    execute(getTabPath(shape.bottom), width, Math.PI, originX + width, originY + height);

    // LEFT: (0,h) -> (0,0). Rotation 270 deg (3PI/2).
    execute(getTabPath(shape.left), height, Math.PI * 1.5, originX, originY + height);
    
    if (ctx instanceof CanvasRenderingContext2D) {
        ctx.closePath();
    } else {
        ctx.closePath();
    }
};

/**
 * Draws strokes ONLY on edges that are NOT connected.
 * This hides internal borders between merged pieces.
 */
export const renderPieceEdges = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    shape: PieceShape,
    tabSize: number,
    connected: { top: boolean; right: boolean; bottom: boolean; left: boolean }
) => {
    const originX = 0;
    const originY = 0;

    // Helper to transform abstract 0-1 coords to actual canvas coords
    const execute = (cmds: any[], len: number, rot: number, offsetX: number, offsetY: number) => {
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        
        const tx = (x: number, y: number) => offsetX + (x * len * cos) - (y * tabSize * sin);
        const ty = (x: number, y: number) => offsetY + (x * len * sin) + (y * tabSize * cos);

        cmds.forEach(op => {
            const type = op[0];
            if (type === 'L') {
                ctx.lineTo(tx(op[1], op[2]), ty(op[1], op[2]));
            } else if (type === 'C') {
                ctx.bezierCurveTo(
                    tx(op[1], op[2]), ty(op[1], op[2]),
                    tx(op[3], op[4]), ty(op[3], op[4]),
                    tx(op[5], op[6]), ty(op[5], op[6])
                );
            }
        });
    };

    ctx.beginPath();
    
    // We strictly sequence the moves to avoid "dots".
    // If a side is connected, we MOVE to the end of that side.
    // If a side is NOT connected, we DRAW to the end of that side.

    // TOP: (0,0) -> (w,0)
    ctx.moveTo(originX, originY); 
    if (!connected.top) {
        execute(getTabPath(shape.top), width, 0, originX, originY);
    } else {
        ctx.moveTo(originX + width, originY);
    }

    // RIGHT: (w,0) -> (w,h)
    if (!connected.right) {
        execute(getTabPath(shape.right), height, Math.PI/2, originX + width, originY);
    } else {
        ctx.moveTo(originX + width, originY + height);
    }

    // BOTTOM: (w,h) -> (0,h)
    if (!connected.bottom) {
        execute(getTabPath(shape.bottom), width, Math.PI, originX + width, originY + height);
    } else {
        ctx.moveTo(originX, originY + height);
    }

    // LEFT: (0,h) -> (0,0)
    if (!connected.left) {
        execute(getTabPath(shape.left), height, Math.PI * 1.5, originX, originY + height);
    } else {
        // ctx.moveTo(originX, originY); // optional closing move
    }
    
    ctx.stroke();
};