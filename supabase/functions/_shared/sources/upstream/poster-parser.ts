import{clean,firstMeta,load}from'./parser.ts';import{UpstreamClient}from'./client.ts';

function srcOf($:any,el:any){const n=$(el);return n.attr('data-src')??n.attr('data-lazy-src')??n.attr('data-original')??n.attr('src')??undefined}
function normalize(value:string|undefined){return(value??'').toLowerCase().replace(/\s+/g,' ').trim()}
function looksWrong(src:string|undefined){return !src||/\b(?:logo|avatar|icon|episode|thumbnail|character|cast)\b/i.test(src)}

/** Select only artwork demonstrably belonging to this anime page. */
export function parsePrimaryPoster(html:string,client:UpstreamClient){
 const $=load(html),title=clean($('h1').first().text())??clean(firstMeta($,{property:'og:title'})),normalizedTitle=normalize(title);
 // The upstream anime page's primary cover carries the anime title as its alt text.
 // This is much stronger evidence than dimensions/classes and prevents recommendation art from leaking in.
 if(normalizedTitle){
  const exact=$('img[alt]').filter((_:number,el:any)=>normalize($(el).attr('alt'))===normalizedTitle).first();
  if(exact.length){const src=srcOf($,exact);if(src&&!looksWrong(src))return client.absolute(src)}
 }
 // Theme-specific primary cover containers, scoped before any generic fallback.
 const selectors=['.animefull .bigcover img','.bigcontent .thumbook img','.bigcontent .thumb img','.bigcover img','.animefull .poster img','.postbody .poster img','article .poster img'];
 for(const selector of selectors){const el=$(selector).first();if(!el.length)continue;const src=srcOf($,el);if(src&&!looksWrong(src))return client.absolute(src)}
 // OpenGraph is page-scoped. Use it only when no title-bound/detail-cover image exists.
 const og=clean(firstMeta($,{property:'og:image'}));
 return og&&!looksWrong(og)?client.absolute(og):undefined;
}
