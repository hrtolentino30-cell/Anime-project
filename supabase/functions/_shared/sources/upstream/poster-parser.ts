import{clean,firstMeta,load}from'./parser.ts';import{UpstreamClient}from'./client.ts';

function srcOf($:any,el:any){const n=$(el);return n.attr('data-src')??n.attr('data-lazy-src')??n.attr('data-original')??n.attr('src')??undefined}
function looksWrong(src:string|undefined){return !src||/\b(?:logo|avatar|icon|episode|thumb(?:nail)?|character|cast)\b/i.test(src)}

/** Select artwork only from the anime's primary detail/cover area. Never scan recommendation/sidebar images. */
export function parsePrimaryPoster(html:string,client:UpstreamClient){
 const $=load(html);
 const selectors=['.animefull .bigcover img','.bigcontent .thumbook .thumb img','.bigcontent .thumb img','.bigcover img','.animefull .poster img','.postbody .poster img','article .poster img'];
 for(const selector of selectors){const el=$(selector).first();if(!el.length)continue;const src=srcOf($,el);if(src&&!looksWrong(src))return client.absolute(src)}
 // OpenGraph is page-scoped and therefore safer than choosing an arbitrary image from recommendations.
 const og=clean(firstMeta($,{property:'og:image'}));
 return og&&!looksWrong(og)?client.absolute(og):undefined;
}
