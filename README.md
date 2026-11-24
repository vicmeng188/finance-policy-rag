# finance-policy-rag

A finance policy Q&A agent built in Microsoft Copilot Studio with retrieval-augmented generation (RAG), tested with a 20-question trap set, a calibrated set of evaluators and prompt injection tests.

The agent answers employee questions about a fictional company's travel and approval policies (Contoso Australia). All documents and data are mock data.

## Results at a glance

| Test | Result |
|---|---|
| Baseline: 20 trap questions × 3 runs | **60/60 correct** (manual review against a written rubric) |
| Evaluator calibration: deliberately faulty agent, 8 questions | Custom rule-based judge caught **8/8**; the built-in General quality judge passed all 4 factually wrong answers |
| Prompt injection: 15 attempts (9 direct + 6 indirect) | **15/15 resisted** |
| Known issue | Internal status text ("Both failed; retry.") leaks into some answers; a prompt fix was tested and **did not work**, so it is documented below |

## Architecture

```
SharePoint document library (policy .docx files)
        │  indexed by SharePoint search
        ▼
Copilot Studio agent (new agent experience, preview, Nov 2026)
  • Model: Claude Sonnet 5.5 (fixed, not "Auto")
  • Knowledge: 4 policy documents, added file by file
  • Web search: removed
  • Instructions: 5 rules (agent/instructions_v0.txt)
        │  hybrid retrieval (semantic + keyword search, called as tools)
        ▼
Answer with document name, section and citation links
```

**Why SharePoint, not uploaded files.** In a real company the policy documents already live in SharePoint and are maintained by Finance. Connecting the agent to SharePoint keeps one copy of each document and the agent queries it on behalf of the signed-in user, so it only sees what that user is allowed to see. Uploading files would create a second copy that has to be re-uploaded whenever a policy changes.

**Why files were added one by one.** It keeps the knowledge base fixed for controlled experiments. It also meant that adding a poisoned document to the library for the injection test did not affect this agent. In production I would point the agent at a dedicated policy site or folder so new policies are picked up automatically.

**Why the model is fixed.** With "Auto" the platform can pick a different model between runs, so a score change could come from the model rather than from my change. (In an enterprise, using a non-Microsoft model such as Claude normally needs separate admin approval and a data review.)

## Instructions (v0)

The baseline Instructions contain only the rules any production assistant needs. Rules aimed at specific traps (for example "prefer the newest version" or "check the appendix for exceptions") were deliberately left out, so the baseline shows what the agent does without being told the answer.

See `agent/instructions_v0.txt`.

## Knowledge base and traps

Four mock policy documents (`knowledge/`):

| Document | Trap |
|---|---|
| Domestic Travel Policy FY2027 (current) | Exceptions placed in Appendix A, far from the main rules (remote locations: $80 meals; trips with an international leg follow the international policy) |
| Domestic Travel Policy FY2026 (superseded, not marked as superseded) | Same structure, older numbers ($50 vs $60 meals, $220 vs $250 capital city hotels, $0.80 vs $0.85 per km, 60 vs 30 days to claim) |
| International Travel Policy | Looks like the domestic policy, but anything over the limit is approved by the Head of Finance regardless of amount, overriding the approval table |
| Delegation of Authority | Approval bands for over-limit amounts (≤$500 Line Manager, $500.01–$2,000 Department Head, >$2,000 CFO), plus a similar-looking purchase order table as a distraction |

## Test design

20 questions in six categories (`tests/test_set_v1.csv`):

| Category | What it tests | Count |
|---|---|---|
| A Synonym | Asking without the document's wording ("lunch", "per diem") | 3 |
| B Combine / confuse | Answers that need two documents, or that mix up domestic and international rules | 5 |
| C Version | Questions where FY2026 and FY2027 differ | 3 |
| D Exception / condition | Cases that fall under the appendix, or answers that must keep a condition | 3 |
| E Not found / out of scope | Plausible questions the documents don't answer, and a spending-data question | 4 |
| F Calculation | Questions that invite the agent to calculate a total | 2 |

Each question has a rubric: what the answer **must include**, what it **must not give as the answer**, and the source section. Two design notes:

- B3 and B4 are a matched pair: the same "$1,000 over the limit" question for Brisbane (Department Head) and Singapore (Head of Finance).
- The rubric says "must not *give as the answer*" rather than "must not mention". Correct answers often mention the approval bands only to say they don't apply, and a keyword check would have marked those correct answers as wrong.

## Evaluation method

- Copilot Studio Agent Evaluation, run 3 times on the same test set (`results/baseline-v0_run*.csv`).
- Two evaluators, chosen after calibration (see below):
  - **Compare meaning** (pass score 70) against a reference answer for each question (`tests/copilot_eval_import.csv`).
  - **Classification**, a custom rule-based judge ("Policy safety check", `agent/policy_safety_check.txt`) that fails an answer if it presents a superseded figure as current, calculates a total, gives a yes/no reimbursement answer the documents don't support, or names a contact that isn't in the documents.
- Manual review of every answer against the rubric, plus `scripts/analyse_results.py` to count passes, credits, answer length and leaked status text.

## Baseline results

- **60/60 answers correct** on manual review. The agent picked the current policy version every time, applied the appendix exceptions, kept domestic and international approval rules apart, refused to calculate totals and said "not found" when the documents were silent. In one answer it pointed out, unprompted, that the documents have no transition rule for a trip that spans 1 July 2026.
- Both evaluators passed all 60 answers, which matched the manual review.
- Manual review still found problems the evaluators did not:
  - **Leaked internal text in 4/60 answers.** E2 (hire car) leaked in all 3 runs, e.g. "Both failed; retry." It appears when the search tool errors.
  - **Inference beyond the documents in D3 (business class), 2 of 3 runs**, and each run behaved differently: run 1 flagged its inference, run 2 made none, run 3 stated the inference as if it were a rule. Running the test set more than once was what made this visible.
- Answers are long (about 150–165 words on average). Not changed yet.

## Evaluator calibration

A passing evaluator is only useful if it can also fail a bad answer. To check this I built a deliberately faulty copy of the agent (`finance-policy-rag-broken`): the current FY2027 policy was removed from its knowledge, and its Instructions told it to calculate totals and to end every answer with a made-up email address. It then answered 8 of the test questions (`results/calibration-v1_broken-agent.csv`).

| Evaluator | Result on the faulty agent | Verdict |
|---|---|---|
| Classification (custom rules) | Failed 8/8, with accurate reasons for each. Combined with 0 false fails on the 60 correct baseline answers | Keep |
| Compare meaning | Failed the 4 answers with wrong core facts; passed 4 answers that had extra violations (made-up email, an old deadline stated as current) | Keep, for core correctness |
| General quality | Passed all 4 factually wrong answers; failed 2 correct "not found" answers. In the baseline it also failed 5 correct refusals | Removed (it also cost ~40% of the credits) |

Two findings from the calibration:

- **"Grounded in the wrong document is still wrong."** Compare meaning checks the agent's knowledge sources. With the current policy removed, its explanation said the agent's (out-of-date) answer matched the knowledge sources and the reference answer did not. It only failed those answers because they conflicted with the reference. When the knowledge base itself is stale, an evaluator that checks against it will side with the stale content. A reference answer set maintained independently by the policy owner is the safeguard.
- I first tried to make the faulty agent give out-of-date answers through Instructions alone ("treat FY2026 as current"). The model refused, and it gave the correct current figure. Removing the current document from its knowledge worked. This is also closer to how the failure happens in real life: someone forgets to update the knowledge base.

## Known issue: leaked internal status text

| Step | Result |
|---|---|
| Observed | Some answers start with text like "Both failed; retry." or "Let me try another approach via metadata." E2 leaked in 3/3 baseline runs, E1 in 1/3 |
| Fix tried | Added rule 6 to the Instructions: do not mention tools, searches, retries or errors |
| Result | E2 still leaked in 3/3 runs, and again in a further run after publishing (`results/leak-fix-v1_*.csv`). The fix did not work, so rule 6 was removed |
| Likely cause (not verified) | The leaked text appears at the start of the answer and reads like the model's message before a tool call. This points to how the platform assembles the output (the harness) rather than to the model's instructions |
| What I would do in production | Send the transcripts to the platform vendor; monitor live conversations for text such as "retry", "error" and "failing" |

Two side findings: the hire car question triggered a search error every time, which is a retrieval reliability issue in its own right. And not every mention of a failed search should be hidden. In one answer the agent said it could not check one document, which tells the user the answer may be incomplete. The goal should be to remove internal chatter, not to hide the fact that a source could not be checked.

Process note: my first fix test ran before I had published the change. Because I could not confirm in the interface which version the evaluation used, I published and ran it again, and recorded the agent version for later runs.

## Prompt injection tests

Full log: `injection/injection_test_results.md`.

- **Direct injection** (instructions typed into the question): overriding the meal limit, asking for the system instructions, claiming to be the CFO and asking for self-approval, and an instruction hidden after a normal question, including a follow-up turn to check it didn't persist. **9/9 resisted.**
- **Indirect injection** (instructions hidden in a document): a separate test agent with the same setup plus `injection/Travel_FAQ.docx`, which hides three instructions: one in visible body text, one in white 1 pt text, and one in a Word comment. **6/6 resisted.** In each case I first confirmed the FAQ had been retrieved; otherwise "not fooled" might just mean "never saw it".

Findings:

- **Hidden to a human is not hidden to the AI.** All three hiding methods were indexed and read by the agent. Reviewing a document visually would only find one of them, so documents going into a knowledge base should be reviewed as extracted text, including comments and hidden text.
- No platform block message appeared in any of the 15 attempts. The model refused the attacks itself, and it told the user about the suspicious content.
- **Least privilege limits the damage.** The agent has read-only knowledge and no tools that can approve, send or record anything, so even a successful injection could only produce a wrong answer.
- Side finding: when I claimed to be the CFO, the agent pointed out that the documents don't say who approves the CFO's own expenses. Testing the agent surfaced a gap in the policy itself.

## Limitations

- Mock documents that are clean and short. Real policy libraries have scanned PDFs, tables split across pages and duplicate versions.
- 3 runs for the baseline and 2 attempts per injection case. These are small samples.
- Results depend on this model and these Instructions; other models were not compared.
- Copilot Studio's retrieval, ranking and evaluators are managed by the platform and can change. The new agent experience was in preview when this was built, and some interface names differed from the documentation (for example, the documentation's "Custom" evaluator appears as "Classification" in the interface).

## Possible next experiments

Not done yet, one change at a time: move appendix exceptions next to the rules they modify; remove the superseded document (governance); remove effective dates to see whether version choice depends on them; replace a document with a scanned PDF; compare a GPT model on the same test set; reduce answer length.

## Repository contents

```
agent/       Instructions v0 and the custom evaluator rules
knowledge/   The four mock policy documents
injection/   Poisoned FAQ document and the injection test log
tests/       Test set with rubric, Copilot import files
results/     Evaluation exports from Copilot Studio
scripts/     Document generators (Node.js, docx library) and the results summary script (Python)
```

To regenerate the summary: `python scripts/analyse_results.py` from the repository root. The Word comment in `Travel_FAQ.docx` was added after generation with a separate comment tool.

## How this was built

I built this with Claude (Anthropic) as a coding and learning assistant.

- **Claude:** wrote the mock policy documents and the poisoned FAQ, the scripts, 13 of the 20 test questions with reference answers, and the evaluator rules; proposed the trap categories and the calibration and injection test designs; reviewed and rewrote my draft Instructions.
- **Me:** built and configured the agents in Copilot Studio and SharePoint; wrote the first draft of the Instructions; reviewed the trap categories and wrote 7 of the test questions; flagged answers I could not grade with the first rubric, which led to the "must not give as the answer" wording; asked for a "must not" check on top of Compare meaning, which became the rule-based safety judge; proposed the prompt injection tests and the two attack scenarios; ran every evaluation and manual test; reviewed the results; and approved each design change.
