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


def test_select_reverse_root_key_prefers_candidate_with_children():
    descendants_api._reverse_descendant_graph = {
        "lewk-_ine-pro": {"light_en"},
        "light_en": set(),
    }

    selected = descendants_api._select_reverse_root_key("*lewk-", "ine-pro")

    assert selected == "lewk-_ine-pro"


def test_reverse_tree_node_from_key_walks_graph_without_page_entry():
    descendants_api._reverse_descendant_graph = {
        "lewk-_ine-pro": {"light_en", "licht_nl"},
        "light_en": set(),
        "licht_nl": set(),
    }

    budget = {"remaining": 20, "truncated": False}
    tree = descendants_api._reverse_tree_node_from_key("lewk-_ine-pro", max_depth=4, node_budget=budget)

    assert tree["word"] == "lewk-"
    assert tree["lang_code"] == "ine-pro"
    assert sorted((child["word"], child["lang_code"]) for child in tree["children"]) == [
        ("licht", "nl"),
        ("light", "en"),
    ]


def test_immediate_descendants_for_proto_root_are_bounded_and_one_level_only():
    descendants_api._reverse_descendant_graph = {
        "lewk-_ine-pro": {"light_en", "licht_nl", "sanskrit_ksa"},
        "light_en": set(),
        "licht_nl": set(),
        "sanskrit_ksa": set(),
    }

    children = descendants_api._immediate_descendants_for_node("*lewk-", "ine-pro", max_children=2)

    assert len(children) == 2
    assert {item["word"] for item in children} == {"light", "licht"}
    assert all(item["lang_code"] in {"en", "nl"} for item in children)


def test_immediate_descendants_prefers_exact_root_key_when_available():
    descendants_api._reverse_descendant_graph = {
        "*žaːm_aav-pro": {"*saːm_aav-pro"},
        "*saːm_aav-pro": {"saːm_en"},
        "saːm_en": set(),
    }

    children = descendants_api._immediate_descendants_for_node("*žaːm", "aav-pro", max_children=10, root_key="*žaːm_aav-pro")

    assert len(children) == 1
    assert children[0]["word"] == "*saːm"
    assert children[0]["lang_code"] == "aav-pro"


def test_select_reverse_root_key_handles_starred_proto_roots():
    descendants_api._reverse_descendant_graph = {
        "*ŋaːm_aav-pro": {"*kəːm_aav-pro"},
        "*kəːm_aav-pro": set(),
    }

    selected = descendants_api._select_reverse_root_key("ŋaːm", "aav-pro")

    assert selected == "*ŋaːm_aav-pro"
