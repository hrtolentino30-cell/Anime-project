import urllib.request,json,re,datetime,time,html
def probe(name,url,bytes_max=2000000):
  print("PROBE",name,url,flush=True)
  try:
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (compatible; ResearchOnly/1.0)","Accept":"application/json,text/html"})
    with urllib.request.urlopen(req,timeout=25) as r:
      data=r.read(bytes_max);ctype=r.headers.get('Content-Type','');print("STATUS",r.status,"BYTES",len(data),"TYPE",ctype,flush=True)
    if "json" in ctype:
      ob=json.loads(data)
      if isinstance(ob,list):print("ARRAY_ITEMS",len(ob),"FIRST",json.dumps(ob[0])[:900] if ob else "",flush=True)
      elif isinstance(ob,dict):print("DICT_KEYS",list(ob.keys()),"ITEM",json.dumps((ob.get('data') or ob.get('pairs') or ob) if name=="gecko" else ob)[:1300],flush=True)
    else:
      if name=="launchtape":
        allx=re.findall(r'(?:href|src)="([^"]+)"',data.decode('utf-8','ignore'))
        print("LINKS",json.dumps([html.unescape(x) for x in allx if ".csv" in x or "api" in x or "github" in x or "download" in x])[:6500],flush=True)
      else:print("CONTENT",data[:300],flush=True)
  except Exception as e: print("ERROR",repr(e),flush=True)
probe("dexprofiles","https://api.dexscreener.com/token-profiles/latest/v1")
probe("gecko","https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page=1")
probe("shrine","https://replay.shrine.trade/pump/index.json")
probe("launchtape","https://launchtape.io/")
