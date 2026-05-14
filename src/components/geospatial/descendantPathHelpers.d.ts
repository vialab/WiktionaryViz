export type AggregatedTreeNode = {
  word?: string
  name?: string
  lang_code?: string | null
  expansion?: string | null
  aggregated?: boolean
  count?: number
  children?: AggregatedTreeNode[]
}

export type DescNode = {
  word?: string
  lang_code?: string | null
  expansion?: string | null
  aggregated?: boolean
  count?: number
}

export declare function flattenPathsFromTree(
  node: AggregatedTreeNode | null | undefined,
  acc?: DescNode[],
): DescNode[][]

export declare function fallbackPoint(
  base: [number, number],
  pathIndex: number,
  pointIndex: number,
  direction?: 1 | -1,
): [number, number]