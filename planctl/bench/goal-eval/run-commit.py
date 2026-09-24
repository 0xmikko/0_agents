import json, subprocess, sys, os, time, tempfile, shutil, re
S=sys.argv[1]; N=int(sys.argv[2]); MODEL=sys.argv[3]; ONLY=sys.argv[4].split(",") if len(sys.argv)>4 and sys.argv[4] else []
VARS=sys.argv[5].split(",") if len(sys.argv)>5 and sys.argv[5] else []
REPO="/mnt/movies/dev/home/Coding/magnis-app"
cases=[c for c in (json.loads(l) for l in open(f"{S}/cases.jsonl",encoding="utf-8")) if c["approvedGoal"] and c.get("how")=="creator" and (not ONLY or c["slug"] in ONLY)][:N]
variants={k:v for k,v in json.load(open(f"{S}/variants.json")).items() if not VARS or k in VARS}
PREAMBLE=("You are inside a Git checkout of the Magnis repository at exactly one commit. The plan must be based on this commit only: read the code, the docs and the history before it as much as you need. "
 "Looking into the future is forbidden and will be checked: no other branches, no other checkouts, no network, no `gh`. Nothing beyond this commit exists for you.\n\n")
JUDGE=("You judge one candidate Goal of an implementation plan against the owner's conversation that asked for the plan. The conversation is the only source of truth; score the candidate and nothing else. Score 0, 1 or 2 and return JSON only: "
 "{\"covers\": <0-2 every ask in the conversation is promised by the candidate>, \"noCreep\": <0-2, 2 means the candidate promises nothing the conversation did not ask for>, \"measurable\": <0-2 every outcome has a number, count, time or observable state>, "
 "\"executable\": <0-2 an executing agent could tell when it is done and when it drifts>, \"reason\": \"<one sentence about the candidate>\"}")
def git(*a, cwd=REPO): return subprocess.run(["git","-C",cwd,*a],capture_output=True,text=True).stdout.strip()
def base_of(slug):
    first=git("log","--diff-filter=A","--format=%H","--",f"docs/plans/{slug}.md").split("\n")[-1]
    return git("rev-parse",f"{first}^")
def make_clone(slug, base):
    d=tempfile.mkdtemp(prefix=f"goal-eval-{slug}-"); ref=f"eval/{slug}"
    git("branch","-f",ref,base)
    subprocess.run(["git","clone","-q","--single-branch","--branch",ref,REPO,d],check=True,capture_output=True)
    git("branch","-D",ref)
    subprocess.run(["git","-C",d,"remote","remove","origin"],capture_output=True)
    for f in (".claude/settings.json",".claude/settings.local.json",".mcp.json"):
        p=os.path.join(d,f)
        if os.path.exists(p): os.remove(p)
    return d
def judge(request, goal, approved):
    env=dict(os.environ, MAX_THINKING_TOKENS="0")
    r=subprocess.run(["claude","-p","--model",MODEL,"--no-session-persistence","--tools","","--strict-mcp-config","--output-format","json","--system-prompt",JUDGE,
                      f"Conversation:\n{request[:5000]}\n\nCandidate Goal:\n{goal}"],capture_output=True,text=True,timeout=180,env=env,stdin=subprocess.DEVNULL)
    j=json.loads(r.stdout,strict=False).get("result","").strip().strip("`"); j=j[j.find("{"):j.rfind("}")+1]; return json.loads(j,strict=False)
def audit(events, clone):
    bad=[]; calls=0
    for e in events:
        if e.get("type")!="assistant": continue
        for b in (e.get("message") or {}).get("content") or []:
            if b.get("type")!="tool_use": continue
            calls+=1; name=b.get("name"); inp=b.get("input") or {}; txt=json.dumps(inp,ensure_ascii=False)
            if name=="Bash":
                cmd=inp.get("command","")
                if re.search(r"\bgh\b|\bcurl\b|\bwget\b|git fetch|git remote|git worktree|--all\b", cmd): bad.append(("command",cmd[:160]))
            for m in re.finditer(r"/(?:mnt/movies/dev/home|home/dev)/Coding/[^\s\"']+", txt):
                if not m.group(0).startswith(clone): bad.append(("path",m.group(0)[:160]))
    return calls, bad
out=open(f"{S}/rounds/"+("-".join(ONLY) if ONLY else "all")+".jsonl","a",encoding="utf-8")
for c in cases:
    base=base_of(c["slug"])
    for name,instr in variants.items():
        clone=make_clone(c["slug"], base); t0=time.time(); events=[]; goal=""; err=None
        try:
            env=dict(os.environ, MAX_THINKING_TOKENS="2048")
            r=subprocess.run(["claude","-p","--model",MODEL,"--no-session-persistence","--strict-mcp-config","--output-format","stream-json","--verbose","--max-turns","25",
                              "--system-prompt",PREAMBLE+instr, f"Owner request, the conversation before the plan was asked for:\n{c['request'][:6000]}"],
                             capture_output=True,text=True,timeout=1500,env=env,stdin=subprocess.DEVNULL,cwd=clone)
            for line in r.stdout.split("\n"):
                if not line.strip(): continue
                try: events.append(json.loads(line))
                except Exception: pass
            res=[e for e in events if e.get("type")=="result"]; raw=(res[-1].get("result") or "").strip() if res else ""
            m=re.search(r"<goal>(.*?)</goal>", raw, re.S); goal=(m.group(1).strip() if m else raw)
        except Exception as e: err=str(e)[:200]
        gen=round(time.time()-t0,1); calls,bad=audit(events, clone)
        try: score=judge(c["request"],goal,c["approvedGoal"]) if goal else {"error":"no goal"}
        except Exception as e: score={"error":str(e)[:200]}
        rec={"slug":c["slug"],"base":base[:9],"variant":name,"goal":goal,"score":score,"genSec":gen,"toolCalls":calls,"violations":bad,"error":err}
        out.write(json.dumps(rec,ensure_ascii=False)+"\n"); out.flush()
        print(c["slug"],name,"total",sum(int(score.get(k,0)) for k in ("covers","noCreep","measurable","executable")) if "error" not in score else "ERR",f"{gen}s calls={calls} violations={len(bad)}",flush=True)
        shutil.rmtree(clone, ignore_errors=True)
