import urllib.request, urllib.error, re, json, time, subprocess
from urllib.parse import urlparse
urls={
 "Axiom": "https://axiom.trade/pulse?chain=sol",
 "FOMO": "https://fomoo.family/",
 "J7_Video": "https://j7tracker.io/",
 "J7_Alternate": "https://j7track.com/"
}
def visit(name,url):
 print(f"START {name} {url}",flush=True)
 try:
  req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36"})
  with urllib.request.urlopen(req,timeout=25) as r:
   data=r.read(300000).decode("utf-8","replace")
   print("HTTP",name,r.status,r.geturl(),"BYTES",len(data),flush=True)
   print("TITLE",name,re.findall(r"<title[^>]*>(.*?)</title>",data,flags=re.I|re.S)[:1],flush=True)
   print("APP_MARKERS",name,dict((key,bool(re.search(key,data,flags=re.I))) for key in ["sign in","login","Pulse","Final Stretch","migrated","tracker","trading","wallet","deploy"]),flush=True)
 except Exception as e:print("ERROR",name,repr(e),flush=True)
for n,u in urls.items():visit(n,u)
try:
 from playwright.sync_api import sync_playwright
 with sync_playwright() as pw:
  browser=pw.chromium.launch(headless=True,args=["--disable-dev-shm-usage"])
  for name,url in urls.items():
   page=browser.new_page(viewport={"width":1366,"height":768})
   try:
    response=page.goto(url,wait_until="domcontentloaded",timeout=30000)
    page.wait_for_timeout(3500)
    content=page.locator("body").inner_text(timeout=12000)[:3200]
    print("BROWSER",name,"HTTP",response.status if response else None,"URL",page.url,"TITLE",page.title(),"TEXT",json.dumps(content),flush=True)
    inputs=page.locator("input").count()
    print("BROWSER_INPUTS",name,inputs,"BUTTONS",page.locator("button").count(),flush=True)
   except Exception as e: print("BROWSER_ERROR",name,repr(e),flush=True)
   finally: page.close()
  browser.close()
except Exception as e: print("PLAYWRIGHT_ERROR",repr(e),flush=True)
