// Central type for etymology lineage nodes
export interface EtymologyNode {
  word: string;
  lang_code: string;
  romanization: string | null;
  position: [number, number] | null;
  next: EtymologyNode | null;
  expansion: string;
  // TODO (Highlighting): optional list of associated country ISO_A3 codes for map highlighting.
  // countries?: string[];
  // TODO (Timeline / future chronology): year or era range metadata to drive temporal scrubber scaling.
  // era?: number | string;
}
