import os
import sys
import types

fastapi_mod = types.ModuleType("fastapi")

class _Query:
    def __init__(self, *args, **kwargs):
        pass

fastapi_mod.Query = _Query
fastapi_mod.APIRouter = lambda *args, **kwargs: types.SimpleNamespace(get=lambda *a, **k: (lambda f: f))
sys.modules.setdefault("fastapi", fastapi_mod)

responses_mod = types.ModuleType("fastapi.responses")

class _JSONResponse:
    def __init__(self, *args, **kwargs):
        pass

responses_mod.JSONResponse = _JSONResponse
sys.modules.setdefault("fastapi.responses", responses_mod)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api_routes import descendants as descendants_api


def test_light_entry_exposes_root_template_for_proto_chain():
    entry = {
        "word": "light",
        "lang_code": "en",
        "etymology_templates": [
            {
                "name": "root",
                "args": {"1": "en", "2": "ine-pro", "3": "*lewk-"},
            },
            {
                "name": "etymon",
                "args": {"1": "en", "2": ":inh", "3": "enm:light<id:illumination>"},
            },
        ],
    }

    parents = descendants_api._candidate_parent_nodes(None, entry, max_per_step=8)
    assert any(parent["word"] == "*lewk-" for parent in parents)


def test_proto_form_matches_index_entry_without_star():
    descendants_api.index = {"lewk-_ine-pro": {"word": "*lewk-", "lang_code": "ine-pro"}}

    matches = descendants_api._find_index_keys_for_word("*lewk-", "ine-pro", max_keys=10)

    assert matches == ["lewk-_ine-pro"]
