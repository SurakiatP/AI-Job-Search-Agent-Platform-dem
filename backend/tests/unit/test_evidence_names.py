"""Names are claims (FR-C02): extraction rules and the gates that use them."""
from uuid import uuid4

from job_search_platform.services.applications import gate_answers
from job_search_platform.services.evidence import apply_gated, claims
from job_search_platform.services.skill_coverage import extract_skills


def _names(text, vocabulary=None):
    return {c for c in claims(text, vocabulary) if c.startswith("name:")}


def test_mid_sentence_capitalized_words_are_names():
    assert _names("Worked at Acme Corp in Bangkok") == {"name:acme", "name:corp", "name:bangkok"}


def test_sentence_line_and_bullet_starts_are_exempt():
    assert _names("Built tools. Shipped fast! Why? Because it works") == set()
    assert _names("Led the team\n- Managed budgets\n* Hired people\n• Mentored staff") == set()


def test_short_acronyms_and_stopwords_are_not_names():
    assert _names("Used AWS and SQL since January with I and May") == set()
    assert _names("Left at NASAA") == {"name:nasaa"} and _names("Left at GOOGLE") == {"name:google"}


def test_dictionary_skills_are_skills_not_names():
    assert "skill:Python" in claims("Wrote Python") and _names("Wrote Python and Docker") == set()


def test_bank_vocabulary_matches_thai_and_latin_after_normalize():
    vocab = {"บริษัท ตัวอย่าง", "acme"}
    assert _names("ทำงานที่ บริษัท ตัวอย่าง มา 2 ปี", vocab) == {"name:บริษัท ตัวอย่าง"}
    assert _names("worked at ACME", vocab) == {"name:acme"}
    assert _names("worked at acmeist", vocab) == set()


def test_apply_gated_rejects_invented_employer_and_allows_cited_or_existing():
    fid = uuid4()
    facts = {fid: claims("Backend developer at Acme")}
    base = "Developer\nEmployed by Initech"
    edits = [{"find": "Developer", "text": "Senior Engineer at Google", "evidence_ids": [str(fid)]}]
    _, applied, rejected = apply_gated(base, edits, facts)
    assert not applied and rejected == edits
    ok = [{"find": "Developer", "text": "Developer at Acme", "evidence_ids": [str(fid)]}]
    assert apply_gated(base, ok, facts)[1] == ok
    existing = [{"find": "Developer", "text": "Developer, Initech alumnus", "evidence_ids": [str(fid)]}]
    assert apply_gated(base, existing, facts)[1] == existing


def test_gate_answers_turns_boolean_and_choice_into_suggestions():
    fid = uuid4()
    facts = {fid: claims("Wrote services")}
    questions = [{"id": "auth", "label": "Authorised?", "required": True, "kind": "boolean"},
                 {"id": "lvl", "label": "Level", "required": False, "kind": "choice", "choices": ["junior", "senior"]},
                 {"id": "bad", "label": "Bad", "required": True, "kind": "boolean"}]
    answers = [{"question_id": "auth", "answer": True, "evidence_ids": [str(fid)]},
               {"question_id": "lvl", "answer": "senior", "evidence_ids": [str(fid)]},
               {"question_id": "bad", "answer": "yes", "evidence_ids": [str(fid)]}]
    entries, missing = gate_answers(answers, questions, facts)
    assert [(e["answer"], e["reason"], e.get("suggestion")) for e in entries] == [
        (None, "needs_confirmation", True), (None, "needs_confirmation", "senior"), (None, "invalid_answer", None)]
    assert entries[0]["evidence_ids"] == [str(fid)] and "suggestion" not in entries[2]
    assert missing == ["auth", "bad"]


def test_gate_answers_rejects_invented_name_in_text():
    fid = uuid4()
    facts = {fid: claims("Wrote services at Acme")}
    q = [{"id": "why", "label": "Why", "required": True, "kind": "text"}]
    bad = gate_answers([{"question_id": "why", "answer": "I led teams at Google", "evidence_ids": [str(fid)]}], q, facts)[0]
    assert bad[0]["reason"] == "unsupported_claim"
    good = gate_answers([{"question_id": "why", "answer": "I wrote services at Acme", "evidence_ids": [str(fid)]}], q, facts)[0]
    assert good[0]["answer"] is not None


def _answer(text, fact_text):
    fid = uuid4()
    q = [{"id": "q", "label": "Q", "required": True, "kind": "text"}]
    entry = gate_answers([{"question_id": "q", "answer": text, "evidence_ids": [str(fid)]}], q,
                         {fid: claims(fact_text)})[0][0]
    return entry["answer"] is not None


def test_one_word_answers_are_checked_against_cited_facts():  # I1
    for text in ("Google", "Current employer: Google"):
        assert not _answer(text, "Wrote services at Acme")
    assert _answer("Google", "Worked at Google") and _answer("Current employer: Google", "Worked at Google")



def test_short_acronyms_are_names_unless_allowlisted():  # I2
    assert _names("Worked at KBTG and PTT and AIS and LINE") == {f"name:{n}" for n in ("kbtg", "ptt", "ais", "line")}
    assert _names("Built REST APIs and ETL on GCP, SaaS for B2B") == set()
    fid = uuid4()
    edits = [{"find": "Engineer", "text": "Software Engineer at SCB", "evidence_ids": [str(fid)]}]
    assert apply_gated("Engineer", edits, {fid: claims("Wrote services")})[2] == edits
    for text in ("SCB", "KBTG"):
        assert not _answer(text, "Wrote services at Acme")
    assert _answer("SCB", "Engineer at SCB")


def test_heading_lines_starting_with_a_name_are_checked():  # I3
    for line in ("**Google** — Senior Engineer", "### Google, Bangkok", "Google | Remote", "Google", "Google (2020)"):
        assert "name:google" in _names(line), line
    assert _names("Led a team") == set() and _names("Built APIs") == set()


def test_semicolon_ends_a_sentence():  # M1
    assert _names("Built APIs; Led migration") == set()
