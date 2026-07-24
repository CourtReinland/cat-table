let meta = #{
    name: "indie-sprint",
    description: "Thin studio loop: load job, implement, test, art-critique, human gate",
    when_to_use: "Run one catalog job through implement + typecheck + art judgment for a title",
    phases: [
        #{ title: "Load", detail: "load job package" },
        #{ title: "Plan", detail: "checklist from goal + acceptance" },
        #{ title: "Implement", detail: "scoped code edits only" },
        #{ title: "Test", detail: "typecheck / build" },
        #{ title: "Art", detail: "art-critique panel on scoped assets" },
        #{ title: "Gate", detail: "report + human approval" },
    ],
};

let job_schema = #{
    "type": "object",
    "required": ["ok", "job_id", "title_id", "goal", "only_edit", "acceptance"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "job_id": #{ "type": "string" },
        "title_id": #{ "type": "string" },
        "goal": #{ "type": "string" },
        "job_path": #{ "type": "string" },
        "only_edit": #{ "type": "array", "items": #{ "type": "string" } },
        "do_not_edit": #{ "type": "array", "items": #{ "type": "string" } },
        "asset_ids": #{ "type": "array", "items": #{ "type": "string" } },
        "slot_ids": #{ "type": "array", "items": #{ "type": "string" } },
        "acceptance": #{ "type": "array", "items": #{ "type": "string" } },
        "error": #{ "type": "string" },
    },
};

let plan_schema = #{
    "type": "object",
    "required": ["checklist", "files_to_touch", "art_in_scope"],
    "properties": #{
        "checklist": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 12 },
        "files_to_touch": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 12 },
        "art_in_scope": #{ "type": "boolean" },
        "risks": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 8 },
    },
};

let impl_schema = #{
    "type": "object",
    "required": ["ok", "changed_files", "summary"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "changed_files": #{ "type": "array", "items": #{ "type": "string" }, "maxItems": 20 },
        "summary": #{ "type": "string" },
        "skipped": #{ "type": "boolean" },
        "error": #{ "type": "string" },
    },
};

let test_schema = #{
    "type": "object",
    "required": ["ok", "typecheck_ok", "log_tail"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "typecheck_ok": #{ "type": "boolean" },
        "build_ok": #{ "type": "boolean" },
        "log_tail": #{ "type": "string" },
        "error": #{ "type": "string" },
    },
};

let scope_schema = #{
    "type": "object",
    "required": ["bible_ok", "bible_path", "bible_summary", "targets"],
    "properties": #{
        "bible_ok": #{ "type": "boolean" },
        "bible_path": #{ "type": "string" },
        "bible_summary": #{ "type": "string" },
        "targets": #{
            "type": "array",
            "maxItems": 16,
            "items": #{
                "type": "object",
                "required": ["asset_id", "image_path"],
                "properties": #{
                    "asset_id": #{ "type": "string" },
                    "slot_id": #{ "type": "string" },
                    "image_path": #{ "type": "string" },
                    "kind": #{ "type": "string" },
                    "label": #{ "type": "string" },
                },
            },
        },
    },
};

let judge_schema = #{
    "type": "object",
    "required": ["asset_id", "overall", "recommended_status", "blind_description", "rubrics", "opened_image"],
    "properties": #{
        "asset_id": #{ "type": "string" },
        "slot_id": #{ "type": "string" },
        "image_path": #{ "type": "string" },
        "opened_image": #{ "type": "boolean" },
        "overall": #{ "type": "string", "enum": ["pass", "fail", "unverified"] },
        "recommended_status": #{ "type": "string", "enum": ["draft", "review", "blocked"] },
        "blind_description": #{ "type": "string" },
        "rubrics": #{
            "type": "array",
            "maxItems": 12,
            "items": #{
                "type": "object",
                "required": ["id", "pass", "evidence"],
                "properties": #{
                    "id": #{ "type": "string" },
                    "pass": #{ "type": "boolean" },
                    "evidence": #{ "type": "string" },
                    "weight": #{ "type": "string" },
                },
            },
        },
    },
};

let skeptic_schema = #{
    "type": "object",
    "required": ["asset_id", "opened_image", "confirmed_issues"],
    "properties": #{
        "asset_id": #{ "type": "string" },
        "opened_image": #{ "type": "boolean" },
        "confirmed_issues": #{
            "type": "array",
            "maxItems": 8,
            "items": #{
                "type": "object",
                "required": ["issue", "evidence"],
                "properties": #{
                    "issue": #{ "type": "string" },
                    "evidence": #{ "type": "string" },
                },
            },
        },
        "clean": #{ "type": "boolean" },
    },
};

let write_schema = #{
    "type": "object",
    "required": ["ok", "path", "verdict_summary", "pass_count", "fail_count"],
    "properties": #{
        "ok": #{ "type": "boolean" },
        "path": #{ "type": "string" },
        "verdict_summary": #{ "type": "string" },
        "pass_count": #{ "type": "integer" },
        "fail_count": #{ "type": "integer" },
        "message": #{ "type": "string" },
    },
};

// --- args ---
let job_id = if args == () { () } else { args.job_id };
let catalog_root = if args == () { () } else { args.catalog_root };
let game_root = if args == () { () } else { args.game_root };
let art_max = if args == () || args.art_max_assets == () { 7 } else { args.art_max_assets };
let skip_human = if args == () || args.skip_human_gate == () { false } else { args.skip_human_gate };

if job_id == () {
    pause("verification", "Pass args.job_id (e.g. job.cat_table.sprint_smoke)");
}
if catalog_root == () {
    catalog_root = "/Users/capricorn/SakuraSoft/catalog";
}
if game_root == () {
    game_root = "/Users/capricorn/Projects/cat-table";
}

phase("Load");
let load_prompt = "";
load_prompt += "Load a Sakura catalog job package. Run: ";
load_prompt += "cd /Users/capricorn/SakuraSoft/tools/sakura && uv run sakura job load --catalog ";
load_prompt += catalog_root + " --id " + job_id + " ";
load_prompt += "Parse the JSON. Extract job fields. ";
load_prompt += "only_edit from job.constraints.only_edit (array of path prefixes). ";
load_prompt += "do_not_edit from job.constraints.do_not_edit. ";
load_prompt += "asset_ids from job.scope.asset_ids if present else []. ";
load_prompt += "slot_ids from job.scope.slot_ids if present else []. ";
load_prompt += "acceptance from job.acceptance. ok=true if job found.";

let load_r = agent(load_prompt, #{
    label: "load-job",
    capability_mode: "execute",
    output_schema: job_schema,
});

if load_r == () || !load_r.success || load_r.output == () || load_r.output.ok != true {
    complete(#{ summary: "Failed to load job " + job_id, ok: false });
}

let title_id = load_r.output.title_id;
let goal = load_r.output.goal;
let only_edit = load_r.output.only_edit;
let asset_ids = if load_r.output.asset_ids != () { load_r.output.asset_ids } else { [] };
log("Loaded " + job_id + " for " + title_id);

phase("Plan");
let plan_prompt = "";
plan_prompt += "You are the sprint planner. READ the job goal and game repo. ";
plan_prompt += "Goal: " + goal + " ";
plan_prompt += "Game root: " + game_root + " ";
plan_prompt += "only_edit paths: " + json_encode(only_edit) + " ";
plan_prompt += "Use read_file/grep on the game repo as needed. ";
plan_prompt += "Return a short checklist, files_to_touch (must be under only_edit), art_in_scope=true if asset scope non-empty. ";
plan_prompt += "Do not edit files yet.";

let plan_r = agent(plan_prompt, #{
    label: "plan",
    capability_mode: "read-only",
    output_schema: plan_schema,
});

let art_in_scope = asset_ids.len() > 0;
if plan_r != () && plan_r.success && plan_r.output != () && plan_r.output.art_in_scope == true {
    art_in_scope = true;
}

phase("Implement");
let only_edit_json = json_encode(only_edit);
let impl_prompt = "";
impl_prompt += "You are the implementer for an indie sprint. ";
impl_prompt += "Game root: " + game_root + " ";
impl_prompt += "Catalog root: " + catalog_root + " ";
impl_prompt += "Goal: " + goal + " ";
impl_prompt += "HARD CONSTRAINT: only modify files whose paths are under these only_edit prefixes: ";
impl_prompt += only_edit_json + " ";
impl_prompt += "Paths may be relative to game_root (e.g. src/data/content.ts) or catalog paths under catalog_root. ";
impl_prompt += "Do NOT edit anything else. Do NOT git push. Do NOT merge. ";
impl_prompt += "Make the smallest change that satisfies the goal. ";
impl_prompt += "After edits, run git status / git diff in game_root and catalog as needed. ";
impl_prompt += "Return changed_files as repo-relative paths, ok=true if done, summary of the change. ";
impl_prompt += "If goal is already satisfied, ok=true skipped=true with explanation.";

let impl_r = agent(impl_prompt, #{
    label: "implement",
    capability_mode: "all",
    output_schema: impl_schema,
});

let impl_ok = false;
let changed = [];
let impl_summary = "implement failed";
if impl_r != () && impl_r.success && impl_r.output != () {
    impl_ok = impl_r.output.ok == true;
    impl_summary = impl_r.output.summary;
    if impl_r.output.changed_files != () { changed = impl_r.output.changed_files; }
}

// Script-side path filter (anti-drift)
let drift = [];
let ci = 0;
while ci < changed.len() {
    let f = changed[ci];
    let allowed = false;
    let oi = 0;
    while oi < only_edit.len() {
        let pref = only_edit[oi];
        // allow if file contains the prefix or ends with it
        if pref != () && (f == pref || f.sub_string(0, pref.len()) == pref || f.contains(pref)) {
            allowed = true;
        }
        oi += 1;
    }
    // always allow critique writes under cat-table critiques if in only_edit list
    if !allowed {
        drift.push(f);
    }
    ci += 1;
}
if drift.len() > 0 {
    log("DRIFT: files outside only_edit: " + json_encode(drift));
    impl_ok = false;
}

phase("Test");
let test_prompt = "";
test_prompt += "Run automated checks in the game repo. cwd=" + game_root + " ";
test_prompt += "1) npm run typecheck ";
test_prompt += "2) If typecheck passes, optionally npm run build (skip if typecheck fails). ";
test_prompt += "Return typecheck_ok, build_ok if run, ok=true only if typecheck_ok, log_tail last 30 lines. ";
test_prompt += "Do not start a long dev server.";

let test_r = agent(test_prompt, #{
    label: "test",
    capability_mode: "execute",
    output_schema: test_schema,
});

let test_ok = false;
let typecheck_ok = false;
if test_r != () && test_r.success && test_r.output != () {
    typecheck_ok = test_r.output.typecheck_ok == true;
    test_ok = test_r.output.ok == true && typecheck_ok;
}

// --- Art gate (embedded, judgment only) ---
let art_verdict = "skipped";
let art_pass = 0;
let art_fail = 0;
let critique_path = "";

if art_in_scope && asset_ids.len() > 0 {
    phase("Art");
    let max_n = art_max;
    if max_n > 8 { max_n = 8; }
    if max_n < 1 { max_n = 1; }

    // Build CLI asset flags
    let asset_flags = "";
    let ai = 0;
    while ai < asset_ids.len() && ai < max_n {
        asset_flags += " --asset " + asset_ids[ai];
        ai += 1;
    }

    let sc_prompt = "";
    sc_prompt += "Scope art-critique for sprint. ";
    sc_prompt += "Read art bible for " + title_id + " under " + catalog_root + "/titles/ (slug underscores to hyphens). ";
    sc_prompt += "Run: cd /Users/capricorn/SakuraSoft/tools/sakura && uv run sakura critique targets --catalog ";
    sc_prompt += catalog_root + " --title " + title_id + asset_flags + " --max " + max_n.to_string() + " ";
    sc_prompt += "Return bible_ok, bible_path, bible_summary, targets with real image_path only.";

    let sc_r = agent(sc_prompt, #{
        label: "art-scope",
        capability_mode: "execute",
        output_schema: scope_schema,
    });

    if sc_r != () && sc_r.success && sc_r.output != () && sc_r.output.bible_ok == true {
        let work = [];
        let targets = sc_r.output.targets;
        let ti = 0;
        while ti < targets.len() && work.len() < max_n {
            let t = targets[ti];
            if t != () && t.image_path != () && t.image_path != "" {
                work.push(t);
            }
            ti += 1;
        }

        if work.len() > 0 {
            let bible_path = sc_r.output.bible_path;
            let bible_summary = sc_r.output.bible_summary;

            let judge_jobs = [];
            let ji = 0;
            while ji < work.len() {
                let t = work[ji];
                let jp = "";
                jp += "ART DIRECTOR judge (fail-closed). Do NOT generate art. ";
                jp += "Open image: " + t.image_path + " Open bible: " + bible_path + " ";
                jp += "Asset " + t.asset_id + ". Blind describe, score all single_asset rubrics with evidence. ";
                jp += "overall=fail if high-weight fail or empty evidence or image not opened. ";
                jp += "recommended_status review only on pass; never approved. opened_image must be honest.";
                judge_jobs.push(#{
                    prompt: jp,
                    label: "judge:" + t.asset_id,
                    capability_mode: "read-only",
                    output_schema: judge_schema,
                });
                ji += 1;
            }
            let judge_results = parallel(judge_jobs);

            let skeptic_jobs = [];
            let si = 0;
            while si < work.len() {
                let t = work[si];
                let sp = "";
                sp += "ADVERSARIAL skeptic. Assume fail. Open " + t.image_path + " and " + bible_path + ". ";
                sp += "Return confirmed_issues with evidence, or empty if clean after real inspection. opened_image required.";
                skeptic_jobs.push(#{
                    prompt: sp,
                    label: "skeptic:" + t.asset_id,
                    capability_mode: "read-only",
                    output_schema: skeptic_schema,
                });
                si += 1;
            }
            let skeptic_results = parallel(skeptic_jobs);

            let items = [];
            let ai2 = 0;
            while ai2 < work.len() {
                let t = work[ai2];
                let j = if ai2 < judge_results.len() { judge_results[ai2] } else { () };
                let s = if ai2 < skeptic_results.len() { skeptic_results[ai2] } else { () };
                let overall = "unverified";
                let rec = "draft";
                let blind = "";
                let rubrics = [];
                let skeptic_confirmed = [];
                let judge_ok = false;
                let skeptic_ok = false;

                if j != () && j.success && j.output != () {
                    judge_ok = j.output.opened_image == true;
                    if judge_ok {
                        overall = j.output.overall;
                        rec = j.output.recommended_status;
                        blind = j.output.blind_description;
                        if j.output.rubrics != () { rubrics = j.output.rubrics; }
                    }
                }
                if s != () && s.success && s.output != () {
                    skeptic_ok = s.output.opened_image == true;
                    if s.output.confirmed_issues != () { skeptic_confirmed = s.output.confirmed_issues; }
                    if skeptic_ok && skeptic_confirmed.len() > 0 {
                        overall = "fail";
                        rec = "blocked";
                    }
                } else if overall == "pass" {
                    overall = "unverified";
                    rec = "draft";
                }
                if rec == "approved" { rec = "review"; }
                if overall == "pass" { art_pass += 1; } else { art_fail += 1; }
                let slot_s = if t.slot_id != () { t.slot_id } else { "" };
                items.push(#{
                    asset_id: t.asset_id,
                    slot_id: slot_s,
                    image_path: t.image_path,
                    overall: overall,
                    recommended_status: rec,
                    blind_description: blind,
                    rubrics: rubrics,
                    skeptic_confirmed: skeptic_confirmed,
                    judge_ok: judge_ok,
                    skeptic_ok: skeptic_ok,
                });
                ai2 += 1;
            }

            art_verdict = "mixed";
            if art_fail == 0 && art_pass > 0 { art_verdict = "pass"; }
            if art_pass == 0 { art_verdict = "fail"; }

            let items_json = json_encode(items);
            let write_prompt = "";
            write_prompt += "Write critique YAML and run sakura critique write. ";
            write_prompt += "title_id=" + title_id + " job_id=" + job_id + " workflow=indie-sprint ";
            write_prompt += "verdict_summary=" + art_verdict + " status=complete ";
            write_prompt += "created_at from date -u. items JSON: " + items_json + " ";
            write_prompt += "id critique.ct.sprint_smoke or similar. ";
            write_prompt += "cd /Users/capricorn/SakuraSoft/tools/sakura && uv run sakura critique write --catalog ";
            write_prompt += catalog_root + " --file <yaml>. Never approved. Return path and counts.";

            let wr = agent(write_prompt, #{
                label: "write-critique",
                capability_mode: "execute",
                output_schema: write_schema,
            });
            if wr != () && wr.success && wr.output != () && wr.output.path != () {
                critique_path = wr.output.path;
            }
        } else {
            art_verdict = "no_targets";
        }
    } else {
        art_verdict = "bible_or_scope_failed";
    }
} else {
    log("No art scope on job — skipping art gate");
}

phase("Gate");
let report = "";
report += "# Indie sprint — " + job_id + "\n\n";
report += "- Title: " + title_id + "\n";
report += "- Implement ok: " + impl_ok.to_string() + " — " + impl_summary + "\n";
report += "- Changed: " + json_encode(changed) + "\n";
report += "- Drift outside only_edit: " + json_encode(drift) + "\n";
report += "- Typecheck: " + typecheck_ok.to_string() + " test_ok=" + test_ok.to_string() + "\n";
report += "- Art verdict: " + art_verdict + " (" + art_pass.to_string() + " pass / " + art_fail.to_string() + " fail)\n";
report += "- Critique: " + critique_path + "\n";
report += "\nHuman: accept code change, promote art to approved yourself if you agree.\n";
let report_path = write_scratch_file("indie-sprint-report.md", report);

// mark job review if mostly ok
if impl_ok && test_ok {
    let mark_prompt = "Run: cd /Users/capricorn/SakuraSoft/tools/sakura && uv run sakura job mark --catalog ";
    mark_prompt += catalog_root + " --id " + job_id + " --status review ";
    mark_prompt += "Return the CLI message as your final answer text.";
    agent(mark_prompt, #{ label: "mark-job", capability_mode: "execute" });
}

let summary_msg = "Sprint " + job_id + " impl=" + impl_ok.to_string() + " test=" + test_ok.to_string() + " art=" + art_verdict;
log(summary_msg);

if skip_human != true {
    await_user("user", summary_msg + " Resume after you review code + critique.");
}

complete(#{
    summary: summary_msg,
    ok: impl_ok && test_ok && (art_verdict == "pass" || art_verdict == "skipped" || art_verdict == "mixed"),
    job_id: job_id,
    title_id: title_id,
    impl_ok: impl_ok,
    test_ok: test_ok,
    art_verdict: art_verdict,
    art_pass: art_pass,
    art_fail: art_fail,
    critique_path: critique_path,
    report_path: report_path,
    drift: drift,
    changed_files: changed,
});
