import json, subprocess, sys, os, glob, re
S=sys.argv[1]
src=open(f"{S}/run-commit.py",encoding="utf-8").read(); JUDGE=eval(re.search(r'JUDGE=(\(.*?\))\n', src, re.S).group(1))
cases={c["slug"]:c for c in (json.loads(l) for l in open(f"{S}/cases.jsonl",encoding="utf-8"))}
def judge(request, goal):
    env=dict(os.environ, MAX_THINKING_TOKENS="0")
    r=subprocess.run(["claude","-p","--model","sonnet","--no-session-persistence","--tools","","--strict-mcp-config","--output-format","json","--system-prompt",JUDGE,f"Conversation:\n{request[:5000]}\n\nCandidate Goal:\n{goal}"],capture_output=True,text=True,timeout=180,env=env,stdin=subprocess.DEVNULL)
    j=json.loads(r.stdout,strict=False).get("result","").strip().strip("`"); j=j[j.find("{"):j.rfind("}")+1]; return json.loads(j,strict=False)
for f in sorted(glob.glob(f"{S}/rounds/*.jsonl")):
    rows=[json.loads(l) for l in open(f,encoding="utf-8")]
    for r in rows:
        if r.get("goal") and not r.get("score2"):
            try: r["score2"]=judge(cases[r["slug"]]["request"], r["goal"])
            except Exception as e: r["score2"]={"error":str(e)[:100]}
    open(f,"w",encoding="utf-8").write("".join(json.dumps(r,ensure_ascii=False)+"\n" for r in rows)); print("rejudged",os.path.basename(f),flush=True)
