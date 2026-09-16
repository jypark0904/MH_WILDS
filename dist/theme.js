(function(root){
  'use strict';
  const key='wilds-simulator-theme';
  let theme='light';
  try{theme=localStorage.getItem(key)==='dark'?'dark':'light';}catch{}
  function apply(value){
    theme=value;
    document.documentElement.dataset.theme=theme;
    const toggle=document.querySelector('#theme-toggle');
    if(toggle){toggle.setAttribute('aria-checked',String(theme==='dark'));toggle.setAttribute('aria-label','다크 모드');toggle.title=theme==='dark'?'일반 모드로 전환':'다크 모드로 전환';toggle.querySelector('.theme-label').textContent=theme==='dark'?'다크':'일반';}
  }
  apply(theme);
  const toggle=document.querySelector('#theme-toggle');
  if(toggle)toggle.onclick=()=>{apply(theme==='dark'?'light':'dark');try{localStorage.setItem(key,theme);}catch{}};
  const mark=document.querySelector('.brand-mark');if(mark&&root.WildsIcons)mark.innerHTML=root.WildsIcons.logo();
  if(root.WildsIcons){const favicon=document.querySelector('link[rel="icon"]');if(favicon)favicon.href='data:image/svg+xml,'+encodeURIComponent(root.WildsIcons.logo());}
})(globalThis);
