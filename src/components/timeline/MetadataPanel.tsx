import React from 'react';
import { NodeData } from './useTimelineData';

export const MetadataPanel: React.FC<{ card: NodeData }> = ({ card }) => (
  <div className="mt-4 p-4 rounded-lg bg-gray-100 shadow text-gray-800">
    <div className="font-bold text-lg">{card.word} ({card.lang_code})</div>
    {card.pronunciation && <div className="text-sm">IPA: {card.pronunciation}</div>}
    {card.tooltip && <div className="mt-2 text-xs">{card.tooltip}</div>}
    {/* Add more metadata as needed */}
  </div>
);
