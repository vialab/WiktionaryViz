
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from constants import ft
from services.aligner import align_segments, symbol
from api_routes.word_data import build_ancestry_chain

router = APIRouter()

@router.get("/ancestry-chain")
async def ancestry_chain(word: str = Query(...), lang_code: str = Query(...)):
    """
    Returns the ancestry chain for a word and language for timeline visualization.
    """
    chain = await build_ancestry_chain(word, lang_code)
    return JSONResponse(content={"ancestry_chain": chain})


@router.get("/phonetic-drift-detailed")
async def phonetic_drift_detailed(
    ipa1: str = Query(...), ipa2: str = Query(...)
):
    """
    Returns segment-by-segment aligned differences and direction of phonological feature changes.
    """
    try:
        segs1 = ft.ipa_segs(ipa1)
        segs2 = ft.ipa_segs(ipa2)
        alignment = align_segments(segs1, segs2, ft)

        diffs = []
        for s1, s2 in alignment:
            if s1 and s2:
                f1 = ft.fts(s1)
                f2 = ft.fts(s2)
                if not f1 or not f2:
                    diff = {"from": s1, "to": s2, "status": "unknown"}
                else:
                    changing = f1.differing_specs(f2)
                    changes = {feat: f"{symbol(f1[feat])} → {symbol(f2[feat])}" for feat in changing}
                    diff = {"from": s1, "to": s2, "changes": changes}
            elif s1 and not s2:
                diff = {"from": s1, "to": None, "status": "deletion"}
            elif s2 and not s1:
                diff = {"from": None, "to": s2, "status": "insertion"}
            diffs.append(diff)

        return {
            "ipa1": ipa1,
            "ipa2": ipa2,
            "alignment": diffs
        }

    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
