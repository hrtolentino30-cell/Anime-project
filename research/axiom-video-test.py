import urllib.request, urllib.error, json, re, sys, time, statistics, datetime, collections
from concurrent.futures import ThreadPoolExecutor

UA={"User-Agent":"Mozilla/5.0 (compatible; market-research/1.0)","Accept":"application/json"}
def get(url, timeout=18):
  request=urllib.request.Request(url,headers=UA)
  with urllib.request.urlopen(request,timeout=timeout) as r:return json.load(r)
def log(*x):print(*x,flush=True)
log("TEST_START_UTC",datetime.datetime.now(datetime.timezone.utc).isoformat())
pools=[]
for page in range(1,9):
  try:
    ds=get(f"https://api.geckoterminal.com/api/v2/networks/solana/new_pools?page={page}")
    pools+=ds.get("data",[])
    log("POOL_PAGE",page,len(ds.get("data",[])))
    time.sleep(0.15)
  except Exception as e:log("POOL_PAGE_ERROR",page,str(e)[:160])
log("TOTAL_SOURCE_POOLS",len(pools))
log("SAMPLE_POOL_RELATIONSHIP",json.dumps(pools[0].get("relationships",{}))[:850] if pools else "none")

records={}
for p in pools:
  a=p.get("attributes",{})
  rel=p.get("relationships",{})
  base=(rel.get("base_token",{}).get("data") or {}).get("id","").removeprefix("solana_")
  dex=(rel.get("dex",{}).get("data") or {}).get("id","")
  addr=a.get("address")
  if not base or not addr:continue
  records[addr]={"mint":base,"pool":addr,"dex":dex,"name":a.get("name"),"created":a.get("pool_created_at"),"fdv":a.get("fdv_usd"),"gecko_market_cap":a.get("market_cap_usd"),"price":a.get("base_token_price_usd"),"gecko_24hvol":(a.get("volume_usd") or {}).get("h24")}
log("MATCHABLE_POOLS",len(records))
mints=list(dict.fromkeys(r["mint"] for r in records.values()))
pairs=[]
for i in range(0,len(mints),30):
  url="https://api.dexscreener.com/tokens/v1/solana/"+",".join(mints[i:i+30])
  try:
    ob=get(url)
    if isinstance(ob,list):pairs+=ob
    log("TOKEN_BATCH",i//30+1,"TOKENS",len(mints[i:i+30]),"PAIRS",len(ob) if isinstance(ob,list) else "nonarray")
  except Exception as e:log("TOKEN_BATCH_ERROR",i,str(e)[:150])
  time.sleep(.3)
pair_by_pool={str(p.get("pairAddress")):p for p in pairs}
eligible=[]
counts=collections.Counter()
for addr,r in records.items():
  p=pair_by_pool.get(addr)
  if not p:
    counts["no_dex_match"]+=1
    continue
  mc=p.get("marketCap")
  if mc is None:counts["unknown_mcap"]+=1
  vol=(p.get("volume") or {}).get("h24")
  if vol is None:counts["unknown_volume"]+=1
  d=(p.get("dexId") or "").lower()
  migrated=("pumpswap" in d or "raydium" in d or "meteora" in d or "bonk" in d)
  final=("pumpfun" in d or "pump" == d)
  if not (migrated or final):
    counts["unknown_stage"]+=1
    continue
  if final and mc is not None and float(mc)>=10000:stage="final_stretch_proxy";counts["final_cap_pass"]+=1
  elif migrated and vol is not None and float(vol)>=30000:stage="migrated_proxy";counts["migrated_volume_pass"]+=1
  else:
    counts["fails_video_numeric_filter"]+=1
    continue
  price=p.get("priceUsd")
  if not price or float(price)<=0:counts["no_price"]+=1;continue
  liq=float((p.get("liquidity") or {}).get("usd") or 0)
  rec={"token":(p.get("baseToken") or {}).get("symbol"),"mint":r["mint"],"pair":p.get("pairAddress"),"pool":addr,"dex":d,"stage":stage,"mc_usd":mc,"vol_24h_usd":vol,"liq_usd":liq,"price0":float(price),"url":p.get("url"),"created":r["created"],"global_fees_sol":None,"tracked_wallet_signal":None,"viral_signal":None}
  eligible.append(rec)
eligible=sorted(eligible,key=lambda x:(x["stage"]!="migrated_proxy",-float(x["vol_24h_usd"] or 0)))
eligible=list({x["mint"]:x for x in reversed(eligible)}.values())[::-1]
log("FILTER_COUNTS",json.dumps(counts))
log("NUMERIC_CANDIDATES",len(eligible))
for c in eligible[:15]:log("CANDIDATE",json.dumps(c))
selected=eligible[:20]
if selected:
  log("BEGIN_PAPER_OBSERVATION",len(selected),"mode=NO_POSITION_NO_TRADES")
  time.sleep(120)
  now=datetime.datetime.now(datetime.timezone.utc).isoformat()
  batch_mints=list(dict.fromkeys(x["mint"] for x in selected))
  pp=[]
  for i in range(0,len(batch_mints),30):
    try:
      ob=get("https://api.dexscreener.com/tokens/v1/solana/"+",".join(batch_mints[i:i+30]))
      pp+=(ob if isinstance(ob,list) else [])
    except Exception as e:log("REPRICE_ERROR",str(e)[:100])
  latest={str(p.get("pairAddress")):p for p in pp}
  vals=[]
  for c in selected:
    p=latest.get(c["pair"]);price1=float(p.get("priceUsd") or 0) if p else 0
    if price1:
      pct=100*(price1/c["price0"]-1)
      z={"token":c["token"],"stage":c["stage"],"mc_usd":c["mc_usd"],"vol_24h_usd":c["vol_24h_usd"],"price0":c["price0"],"price1":price1,"mark_to_market_2min_pct":round(pct,3),"pair":c["pair"],"url":c["url"]}
      vals.append(pct)
      log("PAPER_MARK",json.dumps(z))
    else:log("MISSING_SECOND_QUOTE",c["token"],c["pair"])
  log("RESULT",json.dumps({"timestamp_utc":now,"source_pools":len(pools),"numeric_candidates":len(eligible),"sample_observed":len(vals),"mean_2min_pct":round(statistics.mean(vals),3) if vals else None,"median_2min_pct":round(statistics.median(vals),3) if vals else None,"positive":sum(x>0 for x in vals),"negative":sum(x<0 for x in vals),"verified_global_fee_count":0,"verified_wallet_signal_count":0,"verified_narrative_signal_count":0,"exact_strategy_trade_count":0,"limitations":"Numeric-stage proxy only; global fees/wallet list/social narrative/exit rules unavailable; 2m marks are NOT executed trading returns."}))
else:
  log("RESULT",json.dumps({"source_pools":len(pools),"numeric_candidates":len(eligible),"exact_strategy_trade_count":0,"reason":"No observable pairs passing numeric proxy."}))
log("TEST_COMPLETE")
