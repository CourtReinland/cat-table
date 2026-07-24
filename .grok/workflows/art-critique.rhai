let meta = #{
    name: "art-critique",
    description: "Fail-closed art bible critique for a catalog title (never auto-approves)",
    when_to_use: "Judge whether title art matches the art bible; write a critique record for human review",
    phases: [
        #{ title: "Scope", detail: "resolve assets + load art bible" },
        #{ title: "Judge", detail: "parallel blind rubric judges" },
        #{ title: "Skeptic", detail: "adversarial reject panel" },
        #{ title: "Write", detail: "critique YAML + human gate" },
    ],
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
        "error": #{ "type": "string" },
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
let title_id = if args == () { () } else { args.title_id };
let catalog_root = if args == () { () } else { args.catalog_root };
let max_assets = if args == () || args.max_assets == () { 8 } else { args.max_assets };
let skip_human = if args == () || args.skip_human_gate == () { false } else { args.skip_human_gate };

if title_id == () {
    pause("verification", "Pass args.title_id (e.g. title.cat_table)");
}
if catalog_root == () {
    catalog_root = "/Users/capricorn/SakuraSoft/catalog";
}

let max_n = max_assets;
if type_of(max_n) != "i64" && type_of(max_n) != "int" {
    // validate_only / loose JSON may yield float
    max_n = 8;
}
if max_n > 12 {
    max_n = 12;
}
if max_n < 1 {
    max_n = 1;
}

phase("Scope");
let scope_prompt = "";
scope_prompt += "You are scoping an art-critique run. Use shell/tools. ";
scope_prompt += "1) Confirm file exists: " + catalog_root + " and title art bible under titles/ for " + title_id + ". ";
scope_prompt += "Title folder slug: replace title. prefix, underscores to hyphens (title.cat_table -> cat-table). ";
scope_prompt += "2) Read the art_bible.yaml fully. Summarize pillars in bible_summary (short). ";
scope_prompt += "3) Run: cd /Users/capricorn/SakuraSoft/tools/sakura && uv run sakura critique targets ";
scope_prompt += "--catalog " + catalog_root + " --title " + title_id + " --max " + max_n.to_string() + " ";
scope_prompt += "4) Parse JSON targets. Keep only entries with non-null image_path and no error. ";
scope_prompt += "5) Return bible_ok true only if art_bible exists and is readable. ";
scope_prompt += "Return structured targets list with asset_id, slot_id if any, image_path, kind, label. ";
scope_prompt += "Do not invent paths. Empty targets only after running the CLI.";

let scope_r = agent(scope_prompt, #{
    label: "scope",
    capability_mode: "execute",
    output_schema: scope_schema,
});

if scope_r == () || !scope_r.success || scope_r.output == () {
    complete(#{ summary: "Scope agent failed", ok: false });
}
if scope_r.output.bible_ok != true {
    pause("verification", "Art bible missing or unreadable for " + title_id + ". Run: sakura critique init --title " + title_id);
}

let targets = scope_r.output.targets;
if targets == () || targets.len() == 0 {
    complete(#{ summary: "No image targets to critique", ok: true, targets: 0 });
}

// Cap again in script
let work = [];
let ti = 0;
while ti < targets.len() && work.len() < max_n {
    let t = targets[ti];
    if t != () && t.image_path != () && t.image_path != "" && t.asset_id != () {
        work.push(t);
    }
    ti += 1;
}
if work.len() == 0 {
    complete(#{ summary: "No valid image_path targets", ok: false });
}
log("Critiquing " + work.len().to_string() + " assets for " + title_id);

phase("Judge");
let bible_path = scope_r.output.bible_path;
let bible_summary = scope_r.output.bible_summary;
let judge_jobs = [];
let ji = 0;
while ji < work.len() {
    let t = work[ji];
    let jp = "";
    jp += "You are an ART DIRECTOR judge (fail-closed). Do NOT generate art. ";
    jp += "Open and read the image with read_file: " + t.image_path + " ";
    jp += "Open art bible: " + bible_path + " ";
    jp += "Bible summary (verify against full file): " + bible_summary + " ";
    jp += "Asset: " + t.asset_id + " ";
    if t.slot_id != () { jp += "Slot: " + t.slot_id + " "; }
    jp += "Procedure: (1) Blind-describe the image first. ";
    jp += "(2) Score EVERY single_asset rubric from the bible with pass bool + evidence quoting pixels AND bible. ";
    jp += "(3) overall=fail if any high-weight rubric fails OR any evidence empty OR you did not open image. ";
    jp += "(4) recommended_status=review only if overall=pass; else blocked or draft. NEVER approved. ";
    jp += "(5) opened_image=true only if you actually opened the image file. ";
    jp += "No free-form 'looks good'. Skeptical default.";
    judge_jobs.push(#{
        prompt: jp,
        label: "judge:" + t.asset_id,
        capability_mode: "read-only",
        output_schema: judge_schema,
    });
    ji += 1;
}
let judge_results = parallel(judge_jobs);

phase("Skeptic");
let skeptic_jobs = [];
let si = 0;
while si < work.len() {
    let t = work[si];
    let sp = "";
    sp += "You are an ADVERSARIAL art skeptic. Assume this asset FAILS the art bible until proven otherwise. ";
    sp += "Open image: " + t.image_path + " ";
    sp += "Open art bible: " + bible_path + " ";
    sp += "Asset: " + t.asset_id + " ";
    sp += "Find concrete visual issues vs pillars/forbidden/rubrics. ";
    sp += "Each confirmed issue needs issue + evidence from the pixels. ";
    sp += "If after real inspection you find none, return confirmed_issues=[] and clean=true with opened_image=true. ";
    sp += "Do not invent issues. Do not generate art. opened_image=false if you skipped the file.";
    skeptic_jobs.push(#{
        prompt: sp,
        label: "skeptic:" + t.asset_id,
        capability_mode: "read-only",
        output_schema: skeptic_schema,
    });
    si += 1;
}
let skeptic_results = parallel(skeptic_jobs);

// Aggregate in script (fail closed)
let items = [];
let pass_count = 0;
let fail_count = 0;
let ai = 0;
while ai < work.len() {
    let t = work[ai];
    let j = if ai < judge_results.len() { judge_results[ai] } else { () };
    let s = if ai < skeptic_results.len() { skeptic_results[ai] } else { () };

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
            // high-weight fails
            let ri = 0;
            while ri < rubrics.len() {
                let r = rubrics[ri];
                if r != () && r.pass == false && (r.weight == "high" || r.weight == ()) {
                    overall = "fail";
                }
                if r != () && (r.evidence == () || r.evidence == "") {
                    overall = "fail";
                }
                ri += 1;
            }
            if overall == "pass" && rec != "review" { rec = "review"; }
            if overall != "pass" && rec == "review" { rec = "blocked"; }
        } else {
            overall = "unverified";
            rec = "draft";
        }
    }

    if s != () && s.success && s.output != () {
        skeptic_ok = s.output.opened_image == true;
        if s.output.confirmed_issues != () {
            skeptic_confirmed = s.output.confirmed_issues;
        }
        if skeptic_ok && skeptic_confirmed.len() > 0 {
            overall = "fail";
            rec = "blocked";
        }
    } else {
        // fail closed on missing skeptic
        if overall == "pass" {
            overall = "unverified";
            rec = "draft";
        }
    }

    // never approved
    if rec == "approved" { rec = "review"; }

    if overall == "pass" {
        pass_count += 1;
    } else {
        fail_count += 1;
    }

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
    ai += 1;
}

let verdict = "mixed";
if fail_count == 0 && pass_count > 0 { verdict = "pass"; }
if pass_count == 0 { verdict = "fail"; }

phase("Write");
let items_json = json_encode(items);
let write_prompt = "";
write_prompt += "Write an art critique record using the sakura CLI. ";
write_prompt += "1) Create a temp YAML file under /tmp or the title critiques dir with this content shape. ";
write_prompt += "id: critique.ct.auto (use critique.ct. + a short unique slug from title and pass/fail counts). ";
write_prompt += "title_id: " + title_id + " ";
write_prompt += "status: complete ";
write_prompt += "verdict_summary: " + verdict + " ";
write_prompt += "art_bible_version: 1 ";
write_prompt += "workflow: art-critique ";
write_prompt += "created_at: use UTC ISO timestamp from `date -u +%Y-%m-%dT%H:%M:%SZ` ";
write_prompt += "created_by: workflow.art-critique ";
write_prompt += "items: the following JSON array converted carefully to YAML (recommended_status never approved): ";
write_prompt += items_json + " ";
write_prompt += "2) Run: cd /Users/capricorn/SakuraSoft/tools/sakura && uv run sakura critique write --catalog ";
write_prompt += catalog_root + " --file <that.yaml> ";
write_prompt += "3) Return ok, path from CLI, verdict_summary, pass_count=" + pass_count.to_string();
write_prompt += " fail_count=" + fail_count.to_string() + ". ";
write_prompt += "Do not run apply-status. Do not set approved.";

let write_r = agent(write_prompt, #{
    label: "write-critique",
    capability_mode: "execute",
    output_schema: write_schema,
});

let critique_path = "";
let write_ok = false;
if write_r != () && write_r.success && write_r.output != () {
    write_ok = write_r.output.ok == true;
    if write_r.output.path != () { critique_path = write_r.output.path; }
}

let report = "";
report += "# Art critique — " + title_id + "\n\n";
report += "Verdict: **" + verdict + "** (" + pass_count.to_string() + " pass / " + fail_count.to_string() + " fail-or-unverified)\n\n";
report += "Critique file: `" + critique_path + "`\n\n";
report += "Human-only: promote to approved via Studio bind status or `sakura bind status`.\n";
report += "Agents may only recommend draft|review|blocked.\n\n";
report += "## Items\n";
let ri2 = 0;
while ri2 < items.len() {
    let it = items[ri2];
    report += "- " + it.asset_id + ": " + it.overall + " → recommended `" + it.recommended_status + "`\n";
    ri2 += 1;
}
let report_path = write_scratch_file("art-critique-report.md", report);

let summary_msg = "Art critique " + verdict + " — " + pass_count.to_string() + " pass, " + fail_count.to_string() + " fail. File: " + critique_path;
log(summary_msg);

if skip_human != true {
    await_user("verification", summary_msg + " Review the critique, then resume. Promote approved assets yourself.");
}

complete(#{
    summary: summary_msg,
    ok: write_ok,
    verdict: verdict,
    pass_count: pass_count,
    fail_count: fail_count,
    critique_path: critique_path,
    report_path: report_path,
    title_id: title_id,
});
