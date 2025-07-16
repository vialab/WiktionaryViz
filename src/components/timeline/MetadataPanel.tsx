import React from 'react';
import { NodeData } from './useTimelineData';

export const MetadataPanel: React.FC<{ card: NodeData }> = ({ card }) => (
  <div className="mt-4 p-6 rounded-xl bg-[#252525] border-2 border-[#D4AF37] shadow text-[#F5F5F5] max-w-lg mx-auto">
    <div className="font-bold text-2xl mb-2 text-[#D4AF37]">{card.word} <span className="text-base text-[#B79F58]">({card.lang_code})</span></div>
    {card.pronunciation && <div className="text-sm mb-2 text-[#B79F58]">IPA: {card.pronunciation}</div>}
    {card.tooltip && <div className="mt-2 text-xs text-[#B79F58]">{card.tooltip}</div>}
    {/* Add more metadata as needed */}
  </div>
);
