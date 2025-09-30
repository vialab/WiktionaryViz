// Shared visual constants for region + edge styling (attested vs proto)
export const COLORS = {
  regionAttestedFill: '#1f8af2',
  regionAttestedStroke: '#1f8af2',
  regionProtoFill: '#e11d48',
  regionProtoStroke: '#e11d48',
}

export const EDGES = {
  attested: { weight: 3, dashArray: undefined as string | undefined, color: '#3b82f6' },
  proto: { weight: 3, dashArray: '6 6', color: '#e11d48' },
}

export const isProto = (code: string | null | undefined): boolean => {
  if (!code) return false
  return /-pro$/.test(code)
}

export const regionStyleFor = (lang_code: string) =>
  isProto(lang_code)
    ? {
        color: COLORS.regionProtoStroke,
        weight: 2,
        fillColor: COLORS.regionProtoFill,
        fillOpacity: 0.25,
      }
    : {
        color: COLORS.regionAttestedStroke,
        weight: 2,
        fillColor: COLORS.regionAttestedFill,
        fillOpacity: 0.25,
      }

export const edgeStyleBetween = (a: string, b: string) =>
  isProto(a) || isProto(b) ? EDGES.proto : EDGES.attested
