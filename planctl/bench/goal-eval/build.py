import json, sys, os, re, subprocess
S=sys.argv[1]; REPO="/mnt/movies/dev/home/Coding/magnis-app"
CODEX="/mnt/movies/dev/home/agent-memory/codex/sessions/"; CLAUDE=os.path.expanduser("~/.claude/projects/")
CYR=re.compile("[а-яА-Я]")
pairs={}
for f,base in (("codex-pairs.txt",CODEX),("claude-pairs.txt",CLAUDE)):
    for line in open(os.path.join(S,f)):
        p,s=line.rstrip("\n").split(" ",1); pairs.setdefault(s,[]).append(base+p)
def goal_of(slug):
    body=open(f"{REPO}/docs/plans/{slug}.md",encoding="utf-8").read()
    m=re.search(r"^(##+) [^\n]*[Gg]oal[^\n]*\n(.*?)(?=^#{1,2} |\Z)", body, re.S|re.M)
    return (m.group(2).strip() if m else "")
def parse_user(rec):
    p=rec.get("payload") or {}; m=rec.get("message")
    if p.get("type")=="message" and p.get("role")=="user":
        return " ".join(c.get("text","") for c in (p.get("content") or []) if isinstance(c,dict))
    if isinstance(m,dict) and m.get("role")=="user":
        c=m.get("content"); return c if isinstance(c,str) else " ".join(x.get("text","") for x in c if isinstance(x,dict) and x.get("type")=="text")
    return None
def is_toolcall(rec, slug):
    p=rec.get("payload") or {}; m=rec.get("message")
    if p.get("type") in ("function_call","custom_tool_call","local_shell_call"): return f"docs/plans/{slug}" in json.dumps(p,ensure_ascii=False)
    if isinstance(m,dict) and m.get("role")=="assistant":
        for b in m.get("content") or []:
            if isinstance(b,dict) and b.get("type")=="tool_use" and f"docs/plans/{slug}" in json.dumps(b.get("input"),ensure_ascii=False): return True
    return False
def creator(slug):
    best=None
    for f in pairs.get(slug,[]):
        if not f.endswith('.jsonl') or not os.path.exists(f): continue
        owners=[]
        for line in open(f,encoding="utf-8",errors="replace"):
            if f"docs/plans/{slug}" not in line and '"role":"user"' not in line and '"role": "user"' not in line: continue
            try: rec=json.loads(line)
            except Exception: continue
            ts=rec.get("timestamp","")
            u=parse_user(rec)
            if u is not None:
                t=u.strip()
                instruction = t.startswith(("<","You are ","# ","---","Task name:","Message Type:")) or "$ARGUMENTS" in t or "user-invocable" in t or "planctl renders" in t or "<skill>" in t or "## Task" in t
                short_invoke = ("blueprint" in t.lower()) and len(t)<600
                if len(t)>=25 and not instruction and (CYR.search(t) or short_invoke): owners.append((ts,t))
                continue
            if is_toolcall(rec, slug):
                if owners and (best is None or ts<best[0]): best=(ts,f,owners[-6:])
                break
    return best
cases=[]; rows=[]
for line in open(os.path.join(S,"approved-plans.txt")):
    slug=line.split()[0]; goal=goal_of(slug)
    if not goal: continue
    b=creator(slug)
    if b:
        ts,f,thread=b; req="\n---\n".join(t[:1500] for _,t in thread)
        cases.append({"slug":slug,"session":os.path.basename(f),"createdAt":ts[:16],"messages":len(thread),"how":"creator","request":req,"approvedGoal":goal})
        rows.append(f"| {slug} | {ts[:10]} | {len(thread)} | {thread[-1][1][:240].replace('|','/').replace(chr(10),' ')}… | {goal[:200].replace('|','/').replace(chr(10),' ')}… |")
    else:
        rows.append(f"| {slug} | — | — | *no session shows a tool call creating this plan after an owner message* | {goal[:160].replace('|','/').replace(chr(10),' ')}… |")
with open(os.path.join(S,"goal-eval","cases.jsonl"),"w",encoding="utf-8") as fo:
    for c in cases: fo.write(json.dumps(c,ensure_ascii=False)+"\n")
md=["# Goal dataset: owner request → approved Goal","",f"{len(cases)} of {len(rows)} approved plans with a Goal have a creating session: the first tool call that wrote the plan file, preceded by the owner's messages in that session.","","| Plan | Created | Owner messages | Last owner message (start) | Approved Goal (start) |","|---|---|---|---|---|",*rows]
open(os.path.join(S,"goal-eval","dataset.md"),"w",encoding="utf-8").write("\n".join(md)+"\n")
print("cases",len(cases),"of",len(rows))
