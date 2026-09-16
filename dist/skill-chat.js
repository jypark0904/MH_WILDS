/* Local skill-message parser and keyboard autocomplete. No network calls. */
(function(root){
  'use strict';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const compact=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'');
  const aliases={'약특':'약점 특효','슈회':'슈퍼회심','간파':'간파','공격':'공격'};
  let reply='';
  function dictionary(db){const terms=new Map();for(const s of db.skills)terms.set(compact(s.name),{skill:s,level:1});for(const [alias,name]of Object.entries(aliases)){const s=db.skills.find(s=>compact(s.name)===compact(name));if(s)terms.set(compact(alias),{skill:s,level:1});}const rankTerms=new Map();for(const s of db.skills)for(const r of s.ranks||[])if(r.name){const key=compact(r.name);if(!rankTerms.has(key))rankTerms.set(key,[]);rankTerms.get(key).push({skill:s,level:r.level});}for(const [key,values]of rankTerms)if(!terms.has(key)&&new Set(values.map(v=>v.skill.id)).size===1)terms.set(key,values.sort((a,b)=>a.level-b.level)[0]);return [...terms].sort(([a],[b])=>b.length-a.length);}
  function scan(db,text){let rest=compact(text),entries=[],last=null;const terms=dictionary(db);while(rest){rest=rest.replace(/^[,;、+]+/,'');if(!rest)break;const term=terms.find(([name])=>rest.startsWith(name));if(!term)return {entries,tail:rest,last,error:'스킬 이름을 확인하거나 자동완성에서 선택하세요.'};const [name,item]=term;rest=rest.slice(name.length);const number=rest.match(/^(?:lv\.?|레벨)?(\d+)/i);const level=number?+number[1]:item.level;if(number)rest=rest.slice(number[0].length);if(level<1||level>item.skill.maxLevel)return {entries,tail:rest,last,error:item.skill.name+'은 Lv 1~'+item.skill.maxLevel+'로 입력하세요.'};last={...item,level};entries.push([item.skill.id,level]);}return {entries,tail:'',last,error:null};}
  function parse(db,text){const result=scan(db,text);if(result.error)return {targets:{},error:result.error};if(!result.entries.length)return {targets:{},error:'스킬 이름을 입력하세요.'};return {targets:Object.fromEntries(result.entries),error:null};}
  function suggestions(db,text){
    const terms=dictionary(db),source=String(text||'').normalize('NFKC');
    function matches(value){
      const tail=compact(value),match=tail.match(/^(.*?)(?:lv\.?|레벨)?(\d+)$/i),query=match?match[1]:tail,level=match?+match[2]:null;
      const ranked=terms.filter(([name])=>!query||name.includes(query)).sort(([a],[b])=>Number(b.startsWith(query))-Number(a.startsWith(query))||a.localeCompare(b,'ko'));
      const seen=new Set(),items=[];for(const [,item]of ranked){if(seen.has(item.skill.id))continue;seen.add(item.skill.id);items.push({...item,level:level??item.level});if(items.length===8)break;}return items;
    }
    // A partial long name must stay whole: 공격적인 방 is not 공격 + 적인 방.
    let items=matches(source),prefix=[];
    if(!items.length){
      const separators=[...source.matchAll(/[,;、+\n]/g)];
      if(separators.length){const at=separators.at(-1).index;items=matches(source.slice(at+1));const prior=scan(db,source.slice(0,at));if(!prior.error)prefix=prior.entries;}
      else{
        // Completed message fields may precede the current query. Their contents
        // are useful for locating that query, but are never added by choosing it.
        const boundaries=[...source.matchAll(/\d+|\s+/g)].map(m=>m.index+m[0].length).filter(at=>at<source.length).reverse();
        for(const at of boundaries){const prior=scan(db,source.slice(0,at));if(prior.error||!prior.entries.length)continue;const found=matches(source.slice(at));if(!found.length)continue;items=found;prefix=prior.entries;break;}
      }
    }
    return {items,prefix,error:scan(db,source).error};
  }
  function html(){return `<div class="skill-chat"><label for="skill-message" class="screen-reader">목표 스킬 메시지</label><div class="skill-composer"><input type="text" id="skill-message" placeholder="도전자 5, 약점 특효 3" autocomplete="off" role="combobox" aria-label="목표 스킬 메시지" aria-autocomplete="list" aria-expanded="false" aria-controls="skill-suggestions"><button type="button" id="send-skills" class="primary" aria-label="입력한 스킬 추가">추가</button></div><div id="skill-suggestions" role="listbox" aria-label="스킬 자동완성" hidden></div><p class="hint skill-chat-help">스킬 이름과 레벨을 입력하세요.</p><p id="skill-chat-reply" class="hint" role="status">${esc(reply)}</p></div>`;}
  function mount({db,getTargets,onApply}){const input=document.querySelector('#skill-message'),box=document.querySelector('#skill-suggestions'),status=document.querySelector('#skill-chat-reply');let active=-1,current={items:[],prefix:[]};
    function hide(){box.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}
    function apply(targets){const entries=Object.entries(targets);if(!entries.length)return;for(const [id,level]of entries){const s=db.skills.find(s=>s.id===id);if(!s||!Number.isInteger(level)||level<1||level>s.maxLevel){status.textContent=(s?.name||'스킬')+' 레벨을 확인하세요.';return;}}reply=entries.map(([id,n])=>db.skills.find(s=>s.id===id).name+' Lv '+n).join(' · ')+' 반영';onApply(targets);document.querySelector('#skill-message')?.focus();}
    function choose(i){const item=current.items[i];if(item)apply({[item.skill.id]:item.level});}
    function show(){current=suggestions(db,input.value);active=-1;box.innerHTML=current.items.map((item,i)=>`<button type="button" role="option" id="skill-suggestion-${i}" class="skill-suggestion" aria-selected="false" data-index="${i}"><span>${esc(item.skill.name)} <strong>Lv ${item.level}</strong></span><small>이 스킬만 추가 · 최대 ${item.skill.maxLevel}${getTargets()[item.skill.id]?' · 현재 '+getTargets()[item.skill.id]:''}</small></button>`).join('');box.hidden=!current.items.length;input.setAttribute('aria-expanded',String(!box.hidden));input.removeAttribute('aria-activedescendant');for(const button of box.querySelectorAll('button')){button.onmousedown=e=>e.preventDefault();button.onclick=()=>choose(+button.dataset.index);}}
    function send(){if(active>=0&&!box.hidden){choose(active);return;}const result=parse(db,input.value);if(result.error){if(current.items.length===1&&!box.hidden&&result.error.startsWith('스킬 이름'))choose(0);else status.textContent=result.error;return;}apply(result.targets);}
    input.oninput=e=>{if(!e.isComposing)show();};input.oncompositionend=show;input.onfocus=()=>{if(input.value)show();};input.onblur=hide;input.onkeydown=e=>{if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){hide();return;}if(e.key==='Enter'){e.preventDefault();send();return;}if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(box.hidden)show();if(!current.items.length)return;active=e.key==='ArrowDown'?(active+1)%current.items.length:(active<=0?current.items.length-1:active-1);for(const [i,button]of [...box.querySelectorAll('button')].entries())button.setAttribute('aria-selected',String(i===active));input.setAttribute('aria-activedescendant','skill-suggestion-'+active);box.children[active]?.scrollIntoView({block:'nearest'});}};document.querySelector('#send-skills').onmousedown=e=>e.preventDefault();document.querySelector('#send-skills').onclick=send;
  }
  const api={parse,suggestions,html,mount};root.WildsSkillChat=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
