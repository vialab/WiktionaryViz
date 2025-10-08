declare module 'bubblesets' {
  export class BubbleSet {
    constructor()
    static addPadding<T extends { x: number; y: number; width: number; height: number }>(
      rects: T[],
      pad: number,
    ): T[]
    createOutline(
      rects: Array<{ x: number; y: number; width: number; height: number }>,
      otherRects: Array<{ x: number; y: number; width: number; height: number }>,
      lines: Array<{ x1: number; y1: number; x2: number; y2: number } | null> | null,
    ): Array<{ x: number; y: number }>
  }

  export class PointPath {
    constructor(points: Array<{ x: number; y: number }>)
    transform(transforms: Array<unknown>): PointPath
    toString(): string
  }

  export class ShapeSimplifier {
    constructor(epsilon: number)
  }

  export class BSplineShapeGenerator {}
}
