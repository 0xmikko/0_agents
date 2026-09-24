import json, subprocess, sys, os
S=sys.argv[1]
SYS=("You check whether a conversation is the one that asked for a given plan. Return JSON only: {\"match\": \"yes\"|\"partial\"|\"no\", \"reason\": \"<one sentence>\"}. "
     "yes = the conversation asks for the work the approved Goal describes; partial = related but the Goal covers much more or something else; no = unrelated.")
out=open(f"{S}/attribution.jsonl","w",encoding="utf-8")
for c in (json.loads(l) for l in open(f"{S}/cases.jsonl",encoding="utf-8")):
    if c.get("how")!="creator": continue
    env=dict(os.environ, MAX_THINKING_TOKENS="0")
    r=subprocess.run(["claude","-p","--model","sonnet","--no-session-persistence","--tools","","--strict-mcp-config","--output-format","json","--system-prompt",SYS,
                      f"Conversation:\n{c['request'][:5000]}\n\nApproved Goal of plan '{c['slug']}':\n{c['approvedGoal'][:2500]}"],capture_output=True,text=True,timeout=180,env=env,stdin=subprocess.DEVNULL)
    try:
        j=json.loads(r.stdout,strict=False).get("result","").strip().strip("`"); j=j[j.find("{"):j.rfind("}")+1]; v=json.loads(j,strict=False)
    except Exception as e: v={"match":"error","reason":str(e)[:100]}
    out.write(json.dumps({"slug":c["slug"],**v},ensure_ascii=False)+"\n"); out.flush(); print(c["slug"],v.get("match"),"|",v.get("reason","")[:120],flush=True)
