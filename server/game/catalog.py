"""Quest archetype catalog and questline definitions.

Templates are *archetypes*, not fixed quests: they carry placeholders that are
filled from the player model, and they are tiered so the same activity evolves
as the player levels (§8):

  tier 1  "Study mathematics for 20 minutes."
  tier 2  "Complete a 45-minute mathematics session and solve 10 problems."
  tier 3  "Find a difficult concept, research it, explain it in your own words."
  tier 4  "Apply a mathematical concept to a real-world problem."
"""

from __future__ import annotations

from typing import Any

TIER_LEVELS = {1: 1, 2: 10, 3: 25, 4: 50}

PROOF_TEXT = "text"
PROOF_PHOTO = "photo"
PROOF_VIDEO = "video"
PROOF_DOC = "document"
PROOF_LINK = "link"
PROOF_REFLECTION = "reflection"
PROOF_STRUCTURED = "structured"


def _t(key, domain, kind, tier, difficulty, minutes, title, description,
       proof, criteria, completion, tags=(), skills=(), requirements=(),
       cooldown_hours=20, repeatable=True) -> dict:
    return {
        "key": key, "domain": domain, "kind": kind, "tier": tier,
        "difficulty": difficulty, "minutes": minutes, "title": title,
        "description": description, "proof_types": list(proof),
        "evaluation_criteria": list(criteria), "completion_criteria": completion,
        "tags": list(tags), "skills": list(skills), "requirements": list(requirements),
        "cooldown_hours": cooldown_hours, "repeatable": repeatable,
        "min_level": TIER_LEVELS[tier],
    }


# ---------------------------------------------------------------- PHYSICAL --
PHYSICAL: list[dict] = [
    _t("phys_walk", "physical", "daily", 1, 1, 20,
       "Movement: {activity}",
       "Spend 20 unbroken minutes moving — {activity} counts. Comfortable effort, "
       "nothing heroic. The point is that today contains movement.",
       [PROOF_TEXT, PROOF_STRUCTURED],
       ["Describes an actual movement session", "Duration is plausible"],
       "20+ minutes of continuous movement",
       tags=("base",), skills=("phys_foundation",)),
    _t("phys_mobility", "physical", "daily", 1, 1, 12,
       "Mobility routine",
       "Work through a short mobility routine: hips, shoulders, spine, ankles. "
       "Move slowly, breathe, stop short of pain.",
       [PROOF_TEXT, PROOF_STRUCTURED],
       ["Names the areas worked", "No pain-through-it language"],
       "A completed mobility sequence",
       tags=("base", "mobility"), skills=("phys_mobility",)),
    _t("phys_recovery", "physical", "daily", 1, 1, 15,
       "Recovery block",
       "Deliberate recovery: a walk, stretching, breathing, or an early night. "
       "Recovery is training — it is not a day off.",
       [PROOF_TEXT, PROOF_REFLECTION],
       ["Describes a genuine recovery activity", "Reflection on how the body feels"],
       "A recovery activity plus a note on how you felt",
       tags=("base",), skills=("phys_recovery",)),
    # Named exercises. The generic movement archetypes above ask for "a session";
    # these ask for a specific thing you can film yourself doing, which is what
    # makes video proof meaningful and the tier-1 pool deep enough to draw from.
    _t("phys_run", "physical", "daily", 1, 2, 25,
       "Go for a run",
       "Run for 25 minutes at a pace you can hold. Walk when you need to — the "
       "target is time on your feet, not speed. Record the distance or the route.",
       [PROOF_TEXT, PROOF_VIDEO, PROOF_STRUCTURED],
       ["A real run described", "Distance or duration reported", "Pace is sustainable, not punishing"],
       "25 minutes of running, with the distance or route recorded",
       tags=("base", "endurance"), skills=("phys_endurance",)),
    _t("phys_pushups", "physical", "daily", 1, 2, 10,
       "Push-up sets",
       "Three sets of push-ups, taken close to — not past — failure, with a minute "
       "of rest between them. Knees down or hands elevated both count. Log the reps.",
       [PROOF_TEXT, PROOF_VIDEO, PROOF_STRUCTURED],
       ["Sets and reps reported", "Form described honestly", "Progression, not exhaustion"],
       "3 sets of push-ups with the rep count logged",
       tags=("base", "strength"), skills=("phys_strength",)),
    _t("phys_squats", "physical", "daily", 1, 2, 10,
       "Bodyweight squats",
       "Three sets of bodyweight squats — heels down, knees tracking over toes, "
       "as deep as you can go with control. Count them.",
       [PROOF_TEXT, PROOF_VIDEO, PROOF_STRUCTURED],
       ["Sets and reps reported", "Depth and control described"],
       "3 sets of squats with the rep count logged",
       tags=("base", "strength"), skills=("phys_strength",)),
    _t("phys_plank", "physical", "daily", 1, 2, 8,
       "Plank holds",
       "Three plank holds, each to the point where your form starts to sag — that "
       "is the honest end of the set, not the clock. Log the seconds.",
       [PROOF_TEXT, PROOF_VIDEO, PROOF_STRUCTURED],
       ["Hold times reported", "Stopped on form, not on ego"],
       "3 plank holds with the times logged",
       tags=("base", "strength"), skills=("phys_strength",)),
    _t("phys_circuit", "physical", "daily", 2, 3, 25,
       "Bodyweight circuit",
       "Four rounds of a circuit you build yourself: push-ups, squats, a plank and "
       "one cardio burst. Rest a minute between rounds. Log what you chose.",
       [PROOF_TEXT, PROOF_VIDEO, PROOF_STRUCTURED],
       ["The circuit is described exercise by exercise", "Rounds completed reported"],
       "4 rounds of a self-built circuit, logged",
       tags=("strength", "endurance"), skills=("phys_strength", "phys_endurance")),
    _t("phys_intervals", "physical", "daily", 2, 3, 25,
       "Interval session: {activity}",
       "Alternate hard and easy: eight rounds of one minute working at {activity} "
       "and two minutes easy. Hard should be hard — but you finish every round.",
       [PROOF_TEXT, PROOF_VIDEO, PROOF_STRUCTURED],
       ["Round structure reported", "All rounds completed", "Effort described, not just endured"],
       "8 intervals completed and logged",
       tags=("endurance",), skills=("phys_endurance",)),
    _t("phys_session", "physical", "daily", 2, 2, 35,
       "Fitness session: {activity}",
       "A structured 35-minute session with a warm-up, a main block of {activity}, "
       "and a cool-down. Track what you actually did.",
       [PROOF_TEXT, PROOF_STRUCTURED],
       ["Structure is described (warm-up / main / cool-down)", "Specific and plausible"],
       "A structured session logged with its parts",
       tags=("endurance", "strength"), skills=("phys_endurance",)),
    _t("phys_skill", "physical", "daily", 2, 2, 30,
       "Practise a movement skill",
       "Pick one skill — balance, a sport technique, coordination drill — and "
       "practise it deliberately for 30 minutes. Note what improved.",
       [PROOF_TEXT, PROOF_REFLECTION],
       ["Names a specific skill", "Describes what changed"],
       "Deliberate practice of a named skill",
       tags=("coordination",), skills=("phys_coordination",)),
    _t("phys_progressive", "physical", "daily", 3, 3, 45,
       "Progressive session",
       "Run a 45-minute session that is measurably harder than last week's — "
       "more time, more control, or more quality. Record the comparison.",
       [PROOF_TEXT, PROOF_STRUCTURED, PROOF_REFLECTION],
       ["Compares against a previous session", "Progression is sustainable, not extreme"],
       "A session plus a comparison to your previous one",
       tags=("strength", "endurance"), skills=("phys_endurance", "phys_strength")),
    _t("phys_weekly", "physical", "weekly", 1, 3, 150,
       "Four movement sessions this week",
       "Complete four separate movement sessions before the week ends. Different "
       "kinds count — the target is frequency, not intensity.",
       [PROOF_TEXT, PROOF_STRUCTURED],
       ["Four distinct sessions described", "Spread across different days"],
       "4 sessions logged across the week",
       tags=("base",), cooldown_hours=140),
    _t("phys_capability", "physical", "milestone", 2, 4, 240,
       "Capability milestone: {activity}",
       "Set a capability target in {activity} you cannot hit today — a distance, a "
       "duration, a technique — then train toward it and record the attempt.",
       [PROOF_TEXT, PROOF_STRUCTURED, PROOF_REFLECTION],
       ["A concrete capability target", "Evidence of the attempt", "Honest outcome"],
       "A named capability target attempted and recorded",
       tags=("endurance", "strength", "coordination"), cooldown_hours=336),
    _t("phys_event", "physical", "epic", 3, 5, 600,
       "Enter and complete an event",
       "Enter a real event — a race, a match, a class series, a club challenge — "
       "prepare for it over several weeks, and complete it.",
       [PROOF_TEXT, PROOF_PHOTO, PROOF_LINK, PROOF_REFLECTION],
       ["Names a real event", "Evidence of participation", "Reflection on preparation"],
       "A real event entered and completed",
       tags=("endurance",), cooldown_hours=2000, repeatable=False),
]

# ---------------------------------------------------------------- ACADEMIC --
ACADEMIC: list[dict] = [
    _t("acad_focus_block", "academic", "daily", 1, 1, 20,
       "20 minutes of focused study: {subject}",
       "One 20-minute block on {subject} with no phone, no tabs, no music with words. "
       "Write down what you covered when the timer stops.",
       [PROOF_TEXT, PROOF_STRUCTURED],
       ["Names what was studied", "Specific rather than generic"],
       "20 focused minutes plus a note on what you covered",
       tags=("base", "focus"), skills=("acad_foundation",)),
    _t("acad_read", "academic", "daily", 1, 1, 25,
       "Read a chapter",
       "Read a full chapter or article on {subject}. Afterwards, write three "
       "sentences on what it actually said — without looking back.",
       [PROOF_TEXT, PROOF_REFLECTION, PROOF_STRUCTURED],
       ["Summary shows the text was read", "Written from memory, not copied"],
       "A chapter read and summarised from memory",
       tags=("base", "memory"), skills=("acad_memory",)),
    # Exercise for the mind. The study archetypes above are about covering
    # material; these are drills — the mental equivalent of push-ups, where the
    # rep count is the point and the subject barely matters.
    _t("acad_mental_math", "academic", "daily", 1, 2, 15,
       "Mental arithmetic drill",
       "Fifteen minutes of arithmetic in your head only — no calculator, no paper, "
       "no phone. Two-digit multiplication, percentages, running totals; if "
       "{subject} hands you numbers, use those. Log how many you attempted and "
       "how many you got right.",
       [PROOF_TEXT, PROOF_STRUCTURED],
       ["Attempted and correct counts reported", "Worked mentally, not on paper"],
       "15 minutes of mental arithmetic with your score logged",
       tags=("base", "focus"), skills=("acad_problem_solving",)),
    _t("acad_memory_drill", "academic", "daily", 1, 2, 15,
       "Memory drill: {subject}",
       "Memorise something real from {subject} — twenty terms, a formula sheet, a "
       "timeline, a passage. Study it, walk away for ten minutes, then write it out "
       "from memory and mark what you dropped.",
       [PROOF_TEXT, PROOF_PHOTO, PROOF_STRUCTURED],
       ["What was memorised is named", "Recall score reported", "Gaps identified"],
       "A set memorised and recalled from memory, with the score",
       tags=("base", "memory"), skills=("acad_memory",)),
    _t("acad_focus_train", "academic", "daily", 1, 1, 12,
       "Attention training",
       "Twelve minutes on one thing and nothing else — the breath, a single page of "
       "{subject}, a single problem. Every time your mind wanders, notice it and "
       "come back. The wandering is not failure; the noticing is the rep.",
       [PROOF_TEXT, PROOF_REFLECTION],
       ["A genuine sustained-attention session", "Honest about how often attention drifted"],
       "12 minutes of single-point attention plus what you noticed",
       tags=("base", "focus"), skills=("acad_foundation",)),
    _t("acad_puzzle", "academic", "daily", 1, 2, 20,
       "Solve a hard puzzle",
       "Twenty minutes on a puzzle you have no ready method for — a logic grid, a "
       "chess problem, a competition question from {subject}. Getting stuck is the "
       "exercise. Write down how you attacked it, not just the answer.",
       [PROOF_TEXT, PROOF_PHOTO, PROOF_REFLECTION],
       ["A specific puzzle named", "The approach is described, not just the answer"],
       "A hard puzzle attempted with your reasoning written down",
       tags=("base", "problem_solving"), skills=("acad_problem_solving",)),
    _t("acad_problems", "academic", "daily", 2, 2, 40,
       "Problem set: {subject}",
       "Complete a 40-minute problem set in {subject} — at least eight problems. "
       "Mark which ones you got wrong and why.",
       [PROOF_TEXT, PROOF_PHOTO, PROOF_STRUCTURED],
       ["Problem count reported", "Errors identified, not hidden"],
       "8+ problems attempted with errors reviewed",
       tags=("problem_solving",), skills=("acad_problem_solving",)),
    _t("acad_recall", "academic", "daily", 2, 2, 25,
       "Active recall session",
       "Close the book. Write down everything you remember about a topic in "
       "{subject}, then check it and mark the gaps.",
       [PROOF_TEXT, PROOF_PHOTO, PROOF_REFLECTION],
       ["Recall attempt is present", "Gaps are named"],
       "A recall attempt plus the gaps you found",
       tags=("memory",), skills=("acad_memory",)),
    _t("acad_explain", "academic", "daily", 3, 3, 35,
       "Explain it without notes",
       "Take a concept from {subject} you *think* you understand and explain it out "
       "loud or in writing with no notes. Where you stall is where you don't know it.",
       [PROOF_TEXT, PROOF_REFLECTION],
       ["Explanation is in the player's own words", "Identifies where understanding broke"],
       "A no-notes explanation plus what it exposed",
       tags=("teaching", "critical"), skills=("acad_communication",)),
    _t("acad_research", "academic", "daily", 3, 3, 50,
       "Research task: {subject}",
       "Pick a question in {subject} you can't answer. Find three sources, judge how "
       "reliable they are, and write a short answer citing them.",
       [PROOF_TEXT, PROOF_LINK, PROOF_DOC],
       ["A real question", "Multiple sources", "Sources evaluated, not just listed"],
       "A researched answer with evaluated sources",
       tags=("research", "critical"), skills=("acad_research",)),
    _t("acad_teach", "academic", "daily", 3, 3, 40,
       "Teach someone what you learned",
       "Teach a concept from {subject} to another person. Their questions will find "
       "the holes. Record what they asked.",
       [PROOF_TEXT, PROOF_REFLECTION],
       ["Names who was taught (no personal details needed)", "Reports their questions"],
       "A concept taught and the questions it raised",
       tags=("teaching",), skills=("acad_communication",)),
    _t("acad_apply", "academic", "daily", 4, 4, 60,
       "Apply {subject} to a real problem",
       "Take a concept from {subject} and use it on a problem that exists outside "
       "your coursework. Show the working and the result.",
       [PROOF_TEXT, PROOF_DOC, PROOF_LINK, PROOF_REFLECTION],
       ["A genuine real-world problem", "Concept is actually applied", "Result reported"],
       "A concept applied to a real problem, with working",
       tags=("critical", "research")),
    _t("acad_weekly", "academic", "weekly", 1, 3, 180,
       "Four focused study sessions",
       "Complete four separate focused sessions this week across your subjects. "
       "Consistency beats one heroic night.",
       [PROOF_TEXT, PROOF_STRUCTURED],
       ["Four distinct sessions", "Spread across days"],
       "4 study sessions logged across the week",
       tags=("base", "focus"), cooldown_hours=140),
    _t("acad_revision", "academic", "milestone", 2, 4, 300,
       "Master a difficult topic",
       "Choose the topic in {subject} you most want to avoid. Work it until you can "
       "teach it: notes, problems, explanation, then a self-test.",
       [PROOF_TEXT, PROOF_DOC, PROOF_PHOTO, PROOF_REFLECTION],
       ["The topic was genuinely difficult", "Multiple study modes used", "Self-test result"],
       "A hard topic taken to the point where you can teach it",
       tags=("memory", "critical"), cooldown_hours=336),
    _t("acad_epic", "academic", "epic", 3, 5, 900,
       "Complete a course or qualification",
       "Finish an entire course, module or qualification in {subject} — start to "
       "certificate — and document what you can now do that you couldn't before.",
       [PROOF_TEXT, PROOF_DOC, PROOF_LINK, PROOF_REFLECTION],
       ["A real course", "Evidence of completion", "Capability change described"],
       "A complete course finished and documented",
       cooldown_hours=2000, repeatable=False),
]

# ----------------------------------------------------------------- PASSION --
PASSION: list[dict] = [
    _t("pass_explore", "passion", "daily", 1, 1, 30,
       "Explore: {curious}",
       "Spend 30 minutes inside {curious} — watch, read, try, poke at it. You are "
       "not committing to anything. You are collecting evidence about yourself.",
       [PROOF_TEXT, PROOF_REFLECTION],
       ["Describes what was actually explored", "An honest reaction, positive or negative"],
       "30 minutes exploring a field plus your reaction",
       tags=("explore",), skills=("pass_curiosity",), cooldown_hours=12),
    _t("pass_practice", "passion", "daily", 1, 2, 30,
       "Practise {passion}",
       "Thirty minutes of deliberate practice in {passion} — working on the part "
       "you're worst at, not the part you enjoy most.",
       [PROOF_TEXT, PROOF_PHOTO, PROOF_STRUCTURED],
       ["Names what was practised", "Targets a weakness, not a comfort zone"],
       "30 minutes of deliberate practice",
       tags=("craft",), skills=("pass_craft",)),
    _t("pass_fundamental", "passion", "daily", 1, 1, 25,
       "Learn one fundamental of {passion}",
       "Pick one fundamental in {passion} that everyone good at it already knows, "
       "and learn it properly today. Not the whole field — one thing, understood.",
       [PROOF_TEXT, PROOF_REFLECTION],
       ["A specific fundamental named", "Shows it was understood, not just watched"],
       "One fundamental learned and explained in your own words",
       tags=("craft",), skills=("pass_craft",)),
    _t("pass_rough_draft", "passion", "daily", 1, 2, 25,
       "Make something rough in {passion}",
       "Twenty-five minutes, one rough attempt at something in {passion}, finished "
       "badly rather than left perfect and unstarted. Nobody has to see it.",
       [PROOF_TEXT, PROOF_PHOTO, PROOF_VIDEO],
       ["Something was actually attempted", "It reached an end, however rough"],
       "One rough finished attempt",
       tags=("craft", "explore"), skills=("pass_craft",)),
    _t("pass_study", "passion", "daily", 2, 2, 45,
       "Study how {passion} works",
       "Go one level deeper: how does {passion} actually work under the surface? "
       "Read, watch, take it apart. Write down the mechanism you learned.",
       [PROOF_TEXT, PROOF_LINK, PROOF_REFLECTION],
       ["A specific mechanism or technique named", "Genuine depth"],
       "A mechanism or technique understood and written up",
       tags=("craft", "research")),
    _t("pass_small_build", "passion", "daily", 2, 3, 60,
       "Build something small in {passion}",
       "Make one small, finished thing in {passion} in an hour. Finished beats "
       "ambitious — a rough complete thing teaches more than a perfect fragment.",
       [PROOF_TEXT, PROOF_PHOTO, PROOF_LINK, PROOF_DOC],
       ["Something was actually produced", "It is finished, not abandoned"],
       "One small finished artefact",
       tags=("project", "craft"), skills=("pass_builder",)),
    _t("pass_critique", "passion", "daily", 3, 3, 40,
       "Study the best work in {passion}",
       "Find work in {passion} that is far better than yours. Break down *why* it "
       "works, then name the one thing you'll steal for your next attempt.",
       [PROOF_TEXT, PROOF_LINK, PROOF_REFLECTION],
       ["Specific work referenced", "Analysis goes past 'it's good'", "One concrete takeaway"],
       "A critique with one concrete technique to adopt",
       tags=("craft", "critical")),
    _t("pass_share", "passion", "daily", 3, 3, 45,
       "Put your work in front of someone",
       "Show something you made in {passion} to a person who will tell you the "
       "truth. Record the feedback, especially the parts you didn't want to hear.",
       [PROOF_TEXT, PROOF_LINK, PROOF_REFLECTION],
       ["Real feedback reported", "Includes critical feedback, not just praise"],
       "Work shared and feedback recorded",
       tags=("project",), skills=("pass_documenter",)),
    _t("pass_teach", "passion", "daily", 4, 4, 60,
       "Teach {passion} to someone else",
       "Run a short session teaching someone the basics of {passion}. Teaching is "
       "the fastest audit of what you actually know.",
       [PROOF_TEXT, PROOF_PHOTO, PROOF_REFLECTION],
       ["A real session described", "What the learner struggled with"],
       "A teaching session delivered and reflected on",
       tags=("teaching", "project")),
    _t("pass_weekly", "passion", "weekly", 1, 3, 150,
       "Three sessions on {passion}",
       "Three separate sessions on {passion} this week. Momentum in a passion is "
       "built by returning to it, not by one long burst.",
       [PROOF_TEXT, PROOF_STRUCTURED],
       ["Three distinct sessions", "Progress across the week"],
       "3 sessions logged across the week",
       tags=("craft",), cooldown_hours=140),
    _t("pass_project", "passion", "milestone", 2, 4, 300,
       "Complete your first {passion} project",
       "Take one project in {passion} from idea to finished, documented result. "
       "Not a practice piece — something that exists when you're done.",
       [PROOF_TEXT, PROOF_PHOTO, PROOF_DOC, PROOF_LINK, PROOF_REFLECTION],
       ["A complete project, not a fragment", "Documentation present",
        "Describes what was hard"],
       "A finished, documented project",
       tags=("project",), skills=("pass_builder",), cooldown_hours=336),
    _t("pass_epic", "passion", "epic", 3, 5, 1200,
       "Build, document and present a full {passion} prototype",
       "The long one: design it, build it, test it, document it, and present it to "
       "an audience. Weeks of work condensed into one questline.",
       [PROOF_TEXT, PROOF_PHOTO, PROOF_DOC, PROOF_LINK, PROOF_REFLECTION],
       ["Evidence across design, build and test", "Real documentation",
        "Evidence it was presented"],
       "A complete prototype built, documented and presented",
       tags=("project",), cooldown_hours=2000, repeatable=False),
    _t("pass_compete", "passion", "epic", 4, 5, 1200,
       "Enter a competition or exhibition",
       "Put your {passion} work into a competition, exhibition, showcase or public "
       "release. External stakes change how you work.",
       [PROOF_TEXT, PROOF_LINK, PROOF_PHOTO, PROOF_REFLECTION],
       ["A real external event or release", "Evidence of entry", "Outcome and reflection"],
       "Work entered into a real external event",
       tags=("project",), cooldown_hours=2000, repeatable=False),
]

ALL_TEMPLATES: list[dict] = PHYSICAL + ACADEMIC + PASSION
TEMPLATES_BY_KEY = {t["key"]: t for t in ALL_TEMPLATES}


# ------------------------------------------------------------------ CHAINS --
def _step(title, description, difficulty, minutes, proof, completion, kind="daily") -> dict:
    return {"title": title, "description": description, "difficulty": difficulty,
            "minutes": minutes, "proof_types": list(proof), "completion": completion,
            "kind": kind}


CHAINS: dict[str, dict] = {
    "creation": {
        "key": "creation",
        "name": "{passion} Questline",
        "domain": "passion",
        "min_level": 12,
        "description": "Explore, research, design, build, test, document, present.",
        "achievement": "master_builder",
        "steps": [
            _step("Explore {passion}", "Spend an hour finding out what people actually do "
                  "in {passion}, and which corner of it pulls at you.", 1, 60,
                  [PROOF_TEXT, PROOF_REFLECTION], "An hour of exploration plus your reaction"),
            _step("Research the mechanisms", "Pick your corner and learn how it works. "
                  "Three sources minimum. Write the mechanism down.", 2, 60,
                  [PROOF_TEXT, PROOF_LINK], "A written explanation of how it works"),
            _step("Design your project", "Sketch what you're going to make. Constraints, "
                  "materials, steps, and what 'done' looks like.", 2, 60,
                  [PROOF_TEXT, PROOF_PHOTO, PROOF_DOC], "A design with a definition of done"),
            _step("Build the prototype", "Make the first version. It will be wrong. "
                  "That's what version one is for.", 3, 180,
                  [PROOF_PHOTO, PROOF_TEXT, PROOF_LINK], "A working (or failing) first build"),
            _step("Test and iterate", "Find out where it breaks, fix the worst thing, "
                  "and record what changed.", 3, 120,
                  [PROOF_TEXT, PROOF_PHOTO, PROOF_REFLECTION], "Test results and one iteration"),
            _step("Document the project", "Write it up properly: what it does, how it "
                  "works, what you'd do differently.", 3, 90,
                  [PROOF_DOC, PROOF_LINK, PROOF_TEXT], "Documentation another person could follow",
                  kind="milestone"),
            _step("Present your project", "Show it to real people and answer their "
                  "questions. Record what they asked.", 4, 60,
                  [PROOF_TEXT, PROOF_PHOTO, PROOF_LINK, PROOF_REFLECTION],
                  "Evidence of presenting it and the questions raised", kind="milestone"),
        ],
    },
    "mastery": {
        "key": "mastery",
        "name": "{subject} Mastery Line",
        "domain": "academic",
        "min_level": 12,
        "description": "Diagnose, study, drill, explain, apply, test.",
        "achievement": None,
        "steps": [
            _step("Diagnose the gap", "Test yourself across {subject} and find the topic "
                  "you're genuinely weakest at. Name it precisely.", 2, 45,
                  [PROOF_TEXT, PROOF_PHOTO], "A named weak topic and the evidence"),
            _step("Build the foundation", "Study that topic from the beginning. No "
                  "skipping to the hard part.", 2, 60,
                  [PROOF_TEXT, PROOF_PHOTO], "Notes covering the fundamentals"),
            _step("Drill it", "Twenty problems on the weak topic. Mark every error and "
                  "categorise why it happened.", 3, 60,
                  [PROOF_TEXT, PROOF_PHOTO, PROOF_STRUCTURED], "20 problems with error analysis"),
            _step("Explain it cold", "Explain the topic with no notes to someone who "
                  "doesn't know it.", 3, 30,
                  [PROOF_TEXT, PROOF_REFLECTION], "A no-notes explanation"),
            _step("Apply it", "Use the topic on a problem outside your syllabus.", 4, 60,
                  [PROOF_TEXT, PROOF_DOC], "A real application with working"),
            _step("Prove it", "Sit a full test on the topic under real conditions and "
                  "record the result honestly.", 4, 90,
                  [PROOF_TEXT, PROOF_PHOTO, PROOF_STRUCTURED], "A timed test with the result",
                  kind="milestone"),
        ],
    },
    "capability": {
        "key": "capability",
        "name": "Capability Line: {activity}",
        "domain": "physical",
        "min_level": 12,
        "description": "Baseline, plan, build, sustain, retest.",
        "achievement": None,
        "steps": [
            _step("Establish a baseline", "Measure where you actually are in {activity} "
                  "today. No judgement, just a number.", 1, 30,
                  [PROOF_TEXT, PROOF_STRUCTURED], "A recorded baseline measurement"),
            _step("Set a safe target and plan", "Pick a target you could reach in six "
                  "weeks and sketch the weekly plan to get there.", 2, 30,
                  [PROOF_TEXT, PROOF_DOC], "A target plus a written plan"),
            _step("Build the base", "Three sessions following the plan. Log each.", 2, 90,
                  [PROOF_TEXT, PROOF_STRUCTURED], "3 sessions logged"),
            _step("Sustain it", "Another three sessions, plus one deliberate recovery "
                  "day. Consistency, not escalation.", 3, 120,
                  [PROOF_TEXT, PROOF_STRUCTURED], "3 sessions plus a recovery day"),
            _step("Retest", "Repeat the baseline test and compare. Improvement or not, "
                  "record it truthfully.", 3, 45,
                  [PROOF_TEXT, PROOF_STRUCTURED, PROOF_REFLECTION],
                  "The retest result against your baseline", kind="milestone"),
        ],
    },
}


def fill(text: str, tokens: dict[str, str]) -> str:
    """Fill template placeholders, falling back to sensible generic wording."""
    out = text
    defaults = {
        "subject": "your main subject",
        "activity": "walking",
        "passion": "your passion path",
        "curious": "something new",
    }
    for token, default in defaults.items():
        value = (tokens.get(token) or "").strip() or default
        out = out.replace("{" + token + "}", value)
    return out


def templates_for(domain: str | None = None, kinds: tuple[str, ...] | None = None,
                  max_tier: int = 4) -> list[dict]:
    result: list[dict] = []
    for template in ALL_TEMPLATES:
        if domain and template["domain"] != domain:
            continue
        if kinds and template["kind"] not in kinds:
            continue
        if template["tier"] > max_tier:
            continue
        result.append(template)
    return result


def tier_for_level(level: int) -> int:
    tier = 1
    for candidate, min_level in TIER_LEVELS.items():
        if level >= min_level:
            tier = max(tier, candidate)
    return tier


def chain_definition(key: str) -> dict[str, Any] | None:
    return CHAINS.get(key)
