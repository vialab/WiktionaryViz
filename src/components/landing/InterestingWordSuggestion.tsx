import React from "react";
import { RotateCcw } from "lucide-react";
import { InterestingWord } from "@/hooks/useInterestingWord";

interface InterestingWordSuggestionProps {
  interestingWord: InterestingWord | null;
  category: string;
  loading: boolean;
  onRefresh: () => void;
  onSelect: (word: string) => void;
}

/**
 * Displays a suggestion for an interesting word, with refresh and select options.
 */
const InterestingWordSuggestion: React.FC<InterestingWordSuggestionProps> = ({
  interestingWord,
  category,
  loading,
  onRefresh,
  onSelect,
}) => {
  if (!interestingWord) return null;
  return (
    <div className="mt-6 bg-[#252525FF] p-4 rounded-md text-[#F5F5F5] relative">
      <button
        className="absolute top-2 right-2 text-[#B79F58] hover:text-[#D4AF37] transition"
        onClick={onRefresh}
        title="Refresh suggestion"
        disabled={loading}
      >
        <RotateCcw size={18} />
      </button>
      <p className="text-sm text-[#B79F58]">
        Try exploring a word from <span className="text-[#D4AF37] font-medium">{category}</span>:
      </p>
      <button
        className="mt-2 px-4 py-1 bg-[#D4AF37] hover:bg-[#B79F58] text-black rounded-full text-sm font-medium transition"
        onClick={() => onSelect(interestingWord.word)}
        disabled={loading}
      >
        {interestingWord.word}
      </button>
      <p className="text-xs mt-2 italic text-[#B79F58]">{interestingWord.reason}</p>
    </div>
  );
};

export default InterestingWordSuggestion;
