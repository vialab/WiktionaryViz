// Central type for etymology lineage nodes
export interface EtymologyNode {
  word: string;
  lang_code: string;
  romanization: string | null;
  position: [number, number] | null;
  next: EtymologyNode | null;
  expansion: string;
}
