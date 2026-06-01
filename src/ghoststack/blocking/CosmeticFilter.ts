/**
 * GhostStack Cosmetic Filter — hides empty ad containers after blocking.
 * @module CosmeticFilter
 */
export class CosmeticFilter {
  /** Get injection script for cosmetic filtering */
  getInjectionScript(): string {
    return `(function(){
const _gs_css=document.createElement('style');
_gs_css.textContent=\`
  [id*="ad-"]:empty,[id*="ads-"]:empty,[id*="banner"]:empty,
  [class*="ad-container"]:empty,[class*="ad-wrapper"]:empty,
  [class*="advertisement"]:empty,[class*="sponsored"]:empty,
  iframe[src*="doubleclick"],iframe[src*="googlesyndication"],
  iframe[src*="amazon-adsystem"],div[data-ad],div[data-google-query-id],
  ins.adsbygoogle{display:none!important;height:0!important;min-height:0!important;overflow:hidden!important;}
\`;
document.head.appendChild(_gs_css);
const _gs_observer=new MutationObserver(()=>{
  document.querySelectorAll('[id*="ad-"]:empty,[class*="ad-"]:empty,[class*="banner"]:empty').forEach(el=>{
    if(!el.children.length&&el.offsetHeight>0)el.style.display='none';
  });
});
_gs_observer.observe(document.body||document.documentElement,{childList:true,subtree:true});
})();`
  }
}
