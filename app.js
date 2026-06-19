(function(){
  "use strict";
  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));

  /* storage */
  const mem={};
  const hasWS=(typeof window!=='undefined'&&window.storage&&typeof window.storage.get==='function');
  const hasIDB=(typeof indexedDB!=='undefined');
  const idb=(function(){
    let dbp=null;
    function open(){if(dbp)return dbp;dbp=new Promise((res,rej)=>{const r=indexedDB.open('anchor-db',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});return dbp;}
    return {
      async get(k){const db=await open();return new Promise((res,rej)=>{const rq=db.transaction('kv','readonly').objectStore('kv').get(k);rq.onsuccess=()=>res(rq.result===undefined?null:rq.result);rq.onerror=()=>rej(rq.error);});},
      async set(k,v){const db=await open();return new Promise((res,rej)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(v,k);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);});},
      async keys(){const db=await open();return new Promise((res,rej)=>{const rq=db.transaction('kv','readonly').objectStore('kv').getAllKeys();rq.onsuccess=()=>res(rq.result||[]);rq.onerror=()=>rej(rq.error);});}
    };
  })();
  const store={
    async get(k){
      if(hasWS){try{const r=await window.storage.get(k);return r?JSON.parse(r.value):null;}catch(e){return null;}}
      if(hasIDB){try{const v=await idb.get(k);return v==null?null:JSON.parse(v);}catch(e){return null;}}
      return (k in mem)?mem[k]:null;
    },
    async set(k,v){
      mem[k]=v;const s=JSON.stringify(v);
      if(hasWS){try{await window.storage.set(k,s);return;}catch(e){}}
      if(hasIDB){try{await idb.set(k,s);return;}catch(e){}}
    },
    async list(){
      if(hasWS){try{const r=await window.storage.list('anchor:');return (r&&r.keys)?r.keys:[];}catch(e){return [];}}
      if(hasIDB){try{return await idb.keys();}catch(e){return [];}}
      return Object.keys(mem);
    }
  };

  /* dates */
  function fmtDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function today(){return fmtDate(new Date());}
  function shift(dstr,n){const p=dstr.split('-');const d=new Date(+p[0],+p[1]-1,+p[2]);d.setDate(d.getDate()+n);return fmtDate(d);}
  function parse(dstr){const p=dstr.split('-');return new Date(+p[0],+p[1]-1,+p[2]);}
  function pretty(dstr){return parse(dstr).toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});}
  function shortDay(dstr){return parse(dstr).toLocaleDateString(undefined,{weekday:'short'});}
  function shortDate(dstr){return parse(dstr).toLocaleDateString(undefined,{month:'short',day:'numeric'});}

  const DUMP_KEY='anchor:braindump', WIN_KEY='anchor:winlog', INDEX_KEY='anchor:index', TRENDS_KEY='anchor:trends';
  const dayKey=d=>'anchor:day:'+d;
  const mediaKey=d=>'anchor:media:'+d;

  /* constants */
  const CARE=[
    {id:'move',text:'Moved my body',sub:'a walk, a stretch'},
    {id:'eat',text:'Ate something',sub:'protein helps focus'},
    {id:'water',text:'Had water',sub:'easy to forget'},
    {id:'light',text:'Stepped outside',sub:'light + a reset'},
    {id:'meds',text:'Meds',sub:'if you take them'},
    {id:'wind',text:'Wind-down plan',sub:'protect your sleep'},
  ];
  const SCALES=[
    {id:'mood',nm:'Mood',en:'low → good'},
    {id:'clarity',nm:'Mental clarity',en:'foggy → sharp'},
    {id:'energy',nm:'Energy',en:'drained → charged'},
  ];
  const SPARK=[
    "Boring is the enemy, not hard. Make the first task interesting and you\u2019ll start.",
    "You start brilliantly. Today, pick one thing and *finish* it \u2014 finishing is the rare hit.",
    "Don\u2019t plan it. Start it for five minutes. You can quit after \u2014 you won\u2019t.",
    "Ten tabs open in your head? Dump them below. You can only carry three anyway.",
    "Make it a dare: how much can you do before this timer runs out?",
    "New shiny idea? Note it, don\u2019t chase it. It\u2019ll still be shiny later.",
    "Momentum beats motivation. One sprint and you\u2019re already moving.",
    "Pick the task with the most charge, not the most logic. That\u2019s the one you\u2019ll do.",
    "Done is more interesting than perfect. Ship the rough version.",
    "You don\u2019t need the whole plan. You need the next fifteen minutes.",
    "Bored means drifting. Add stakes, a timer, or a switch-up to get the spark back.",
    "Close one loop today. Open loops are the tax you pay in background stress.",
    "Permission to do it fast and messy. You can polish it once it exists.",
    "In flow when the timer ends? Hit +5 and ride it.",
    "Three things, not ten. The constraint is what frees the rest of your day.",
  ];
  const CHK='<svg viewBox="0 0 16 16" fill="none"><path d="M2.5 8.5l3.5 3.5 7.5-8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  /* state */
  const TD=today();
  let records={};            // date -> record (cache)
  let dump=[], wins=[], index=[], trends={}, media={};

  function blank(date){
    return {date,three:[{t:'',done:false},{t:'',done:false},{t:'',done:false}],care:{},
      ifthen:[],work:'',review:null};
  }
  function getRec(date){ if(!records[date]) records[date]=blank(date); return records[date]; }
  async function loadRec(date){
    if(records[date]) return records[date];
    const r=await store.get(dayKey(date));
    records[date]= r? normalize(r,date) : blank(date);
    return records[date];
  }
  function normalize(r,date){
    const b=blank(date);
    return Object.assign(b,r,{
      three:(r.three&&r.three.length?r.three:b.three).slice(0,3).concat(b.three).slice(0,3).map(x=>({t:x.t||'',done:!!x.done})),
      care:r.care||{},
      ifthen:Array.isArray(r.ifthen)?r.ifthen:[],
    });
  }

  const saveTimers={};
  function saveRec(date){
    const r=records[date]; if(!r) return;
    clearTimeout(saveTimers[date]);
    saveTimers[date]=setTimeout(()=>store.set(dayKey(date),r),450);
  }
  function saveRecNow(date){ const r=records[date]; if(r) store.set(dayKey(date),r); }

  /* header */
  function setHeader(){
    const h=new Date().getHours();
    $('#greeting').textContent = h<5?'Still up?':h<12?'Good morning.':h<17?'Good afternoon.':h<22?'Good evening.':'Winding down?';
    $('#dateline').textContent = pretty(TD);
    const now=new Date(),start=new Date(now.getFullYear(),0,0);
    const doy=Math.floor((now-start)/86400000);
    $('#spark').textContent=SPARK[doy%SPARK.length];
  }
  function setGlance(){
    const r=getRec(TD);
    const done=r.three.filter(x=>x.done).length;
    const care=Object.values(r.care).filter(Boolean).length;
    const w=wins.filter(x=>x.date===TD).length;
    $('#glance').innerHTML='<span><b>'+done+'</b>/3 done</span><span><b>'+care+'</b>/6 care</span><span><b>'+w+'</b> win'+(w===1?'':'s')+' today</span>';
  }

  /* TODAY: three */
  function renderThree(){
    const r=getRec(TD), c=$('#threeRows'); c.innerHTML='';
    r.three.forEach((row,i)=>{
      const div=document.createElement('div');
      div.className='three-row'+(row.done?' done':'');
      div.innerHTML='<span class="num">'+(i+1)+'</span><button class="check'+(row.done?' on':'')+'" aria-label="Mark done">'+CHK+'</button><input class="ti" placeholder="Something for today…">';
      const inp=div.querySelector('input'); inp.value=row.t;
      inp.addEventListener('input',()=>{r.three[i].t=inp.value;saveRec(TD);});
      div.querySelector('.check').addEventListener('click',()=>{r.three[i].done=!r.three[i].done;renderThree();setGlance();saveRec(TD);});
      c.appendChild(div);
    });
  }

  /* TODAY: game plan */
  function renderGameplan(){
    const r=getRec(TD);
    const rules=(r.ifthen||[]).filter(x=>x.cond&&x.act);
    const hasWork=!!(r.work&&r.work.trim());
    if(!rules.length&&!hasWork){ $('#gameplanCard').style.display='none'; return; }
    $('#gameplanCard').style.display='';
    let html='<h3>Today\u2019s game plan</h3>';
    if(hasWork) html+='<p class="work"><b>First up:</b> '+esc(r.work)+'</p>';
    if(rules.length){ html+='<ul>'+rules.map(x=>'<li><b>If</b> '+esc(x.cond)+' <b>then</b> '+esc(x.act)+'</li>').join('')+'</ul>'; }
    $('#gameplan').innerHTML=html;
  }
  function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

  /* brain dump */
  function renderDump(){
    $('#dumpCount').textContent=dump.length?'('+dump.length+')':'';
    const list=$('#dumpList'); list.innerHTML='';
    if(!dump.length){const li=document.createElement('li');li.className='empty';li.textContent='Empty. Toss anything here, you don\u2019t have to do it today.';list.appendChild(li);return;}
    const r=getRec(TD);
    dump.forEach((item,i)=>{
      const li=document.createElement('li'); li.className='dump-item';
      const sp=document.createElement('span'); sp.textContent=item;
      const pr=document.createElement('button'); pr.className='promote'; pr.textContent='→ today';
      const open=r.three.findIndex(x=>!x.t.trim()); pr.disabled=open===-1;
      pr.addEventListener('click',()=>{const s=r.three.findIndex(x=>!x.t.trim());if(s===-1)return;r.three[s].t=item;dump.splice(i,1);renderThree();renderDump();saveRec(TD);store.set(DUMP_KEY,dump);});
      const dr=document.createElement('button'); dr.className='drop'; dr.textContent='clear';
      dr.addEventListener('click',()=>{dump.splice(i,1);renderDump();store.set(DUMP_KEY,dump);});
      li.appendChild(sp);li.appendChild(pr);li.appendChild(dr);list.appendChild(li);
    });
  }
  function addDump(){const v=$('#dumpInput').value.trim();if(!v)return;dump.unshift(v);$('#dumpInput').value='';renderDump();store.set(DUMP_KEY,dump);}

  /* care */
  function renderCare(){
    const r=getRec(TD), g=$('#careGrid'); g.innerHTML='';
    CARE.forEach(a=>{
      const on=!!r.care[a.id];
      const b=document.createElement('button'); b.className='anchor'+(on?' on':'');
      b.innerHTML='<span class="a-check">'+CHK+'</span><span class="a-text">'+a.text+'<span class="a-sub">'+a.sub+'</span></span>';
      b.addEventListener('click',()=>{r.care[a.id]=!r.care[a.id];renderCare();setGlance();saveRec(TD);});
      g.appendChild(b);
    });
  }

  /* wins */
  function renderWins(){
    const list=$('#winList'); list.innerHTML='';
    if(!wins.length){const li=document.createElement('li');li.className='empty';li.textContent='Nothing yet. Getting started counts as a win.';list.appendChild(li);return;}
    wins.slice(0,12).forEach(w=>{
      const li=document.createElement('li'); li.className='win-item'+(w._new?' win-pop':''); delete w._new;
      li.innerHTML='<span class="wdate">'+esc(w.label)+'</span><span class="wtext">'+esc(w.text)+'</span>';
      list.appendChild(li);
    });
  }
  function addWin(){
    const v=$('#winInput').value.trim();if(!v)return;
    wins.unshift({text:v,label:shortDate(TD),date:TD,_new:true});
    if(wins.length>60)wins=wins.slice(0,60);
    $('#winInput').value='';renderWins();setGlance();
    store.set(WIN_KEY,wins.map(w=>({text:w.text,label:w.label,date:w.date})));
  }

  /* timer */
  let lenMin=15,remaining=900,running=false,tick=null;
  const CIRC=2*Math.PI*96;
  function fmt(s){const m=Math.floor(s/60),x=s%60;return m+':'+String(x).padStart(2,'0');}
  function paintRing(){$('#ringTime').textContent=fmt(remaining);const f=remaining/(lenMin*60);$('#ringFg').style.strokeDasharray=CIRC;$('#ringFg').style.strokeDashoffset=CIRC*(1-f);}
  function setLen(m){lenMin=m;remaining=m*60;running=false;clearInterval(tick);$$('.len').forEach(b=>b.classList.toggle('sel',+b.dataset.min===m));$('#startBtn').textContent='Start';$('#ringLabel').textContent='ready';$('#sprintMsg').textContent='';$('#ringFg').classList.remove('flash');paintRing();}
  function extend(){lenMin+=5;remaining+=300;$$('.len').forEach(b=>b.classList.remove('sel'));if(running)$('#ringLabel').textContent='+5, keep going';paintRing();}
  function shrink(){if(lenMin<=5)return;lenMin-=5;remaining=Math.max(0,Math.min(remaining-300,lenMin*60));$$('.len').forEach(b=>b.classList.remove('sel'));if(running)$('#ringLabel').textContent='−5';paintRing();}
  function startPause(){
    if(running){running=false;clearInterval(tick);$('#startBtn').textContent='Resume';$('#ringLabel').textContent='paused';return;}
    running=true;$('#startBtn').textContent='Pause';$('#sprintMsg').textContent='';
    $('#ringLabel').textContent=$('#nextAction').value.trim()?'on it':'focusing';
    tick=setInterval(()=>{remaining--;paintRing();if(remaining<=0){clearInterval(tick);running=false;remaining=0;paintRing();$('#startBtn').textContent='Start';$('#ringLabel').textContent='done';$('#ringFg').classList.add('flash');$('#sprintMsg').textContent='Sprint done. Stand up, breathe, sip water, then decide if you go again.';chime();remaining=lenMin*60;setTimeout(()=>{if(!running){paintRing();$('#ringLabel').textContent='ready';}},1700);}},1000);
  }
  function chime(){try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;const c=new C(),o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=523.25;o.connect(g);g.connect(c.destination);g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.18,c.currentTime+.05);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.9);o.start();o.stop(c.currentTime+.95);}catch(e){}}

  /* PLAN editor (reused for today / tomorrow / reflect) */
  function renderPlanEditor(date,mount){
    const r=getRec(date); mount.innerHTML='';
    // three
    const lab=document.createElement('label');lab.className='field';lab.textContent='Top three';mount.appendChild(lab);
    r.three.forEach((row,i)=>{
      const d=document.createElement('div');d.className='three-row';
      d.innerHTML='<span class="num">'+(i+1)+'</span><input class="ti" placeholder="priority '+(i+1)+'…">';
      const inp=d.querySelector('input');inp.value=row.t;
      inp.addEventListener('input',()=>{r.three[i].t=inp.value;saveRec(date);if(date===TD){renderThree();setGlance();}});
      mount.appendChild(d);
    });
    // if-then
    const l2=document.createElement('label');l2.className='field';l2.innerHTML='If-then rules<span class="sub">decide now so you don\u2019t have to decide in the moment</span>';mount.appendChild(l2);
    const rulesBox=document.createElement('div');mount.appendChild(rulesBox);
    function drawRules(){
      rulesBox.innerHTML='';
      r.ifthen.forEach((rule,i)=>{
        const div=document.createElement('div');div.className='rule';
        div.innerHTML='<div class="leg"><span class="tag">IF</span><input placeholder="I get stuck / it\u2019s 2pm / I open my phone"></div><div class="leg"><span class="tag">THEN</span><input placeholder="set a 10-min timer / take a walk / …"></div>';
        const ins=div.querySelectorAll('input');
        ins[0].value=rule.cond||'';ins[1].value=rule.act||'';
        ins[0].addEventListener('input',()=>{rule.cond=ins[0].value;saveRec(date);if(date===TD)renderGameplan();});
        ins[1].addEventListener('input',()=>{rule.act=ins[1].value;saveRec(date);if(date===TD)renderGameplan();});
        const rm=document.createElement('button');rm.className='rm';rm.textContent='remove rule';
        rm.addEventListener('click',()=>{r.ifthen.splice(i,1);drawRules();saveRec(date);if(date===TD)renderGameplan();});
        div.appendChild(rm);rulesBox.appendChild(div);
      });
      const add=document.createElement('button');add.className='add-rule';add.textContent='+ add an if-then rule';
      add.addEventListener('click',()=>{r.ifthen.push({cond:'',act:''});drawRules();});
      rulesBox.appendChild(add);
    }
    drawRules();
    // work
    const l3=document.createElement('label');l3.className='field';l3.innerHTML='The work<span class="sub">the very first thing to open or do</span>';mount.appendChild(l3);
    const work=document.createElement('input');work.className='line';work.placeholder='open the doc and write one ugly paragraph…';work.value=r.work||'';
    work.addEventListener('input',()=>{r.work=work.value;saveRec(date);if(date===TD)renderGameplan();});
    mount.appendChild(work);
  }

  /* PLAN: week */
  async function renderWeek(){
    const list=$('#weekList');list.innerHTML='';
    for(let i=2;i<=6;i++){
      const date=shift(TD,i);const r=await loadRec(date);
      const row=document.createElement('div');row.className='week-day';
      row.innerHTML='<span class="wd">'+shortDay(date)+'<small>'+shortDate(date)+'</small></span><input placeholder="one main focus…">';
      const inp=row.querySelector('input');inp.value=r.three[0].t;
      inp.addEventListener('input',()=>{r.three[0].t=inp.value;saveRec(date);});
      list.appendChild(row);
    }
  }

  let planDay=0;
  function showPlanDay(which){
    $$('#planSeg button').forEach(b=>b.classList.toggle('active',b.dataset.day===String(which)));
    if(which==='week'){$('#planEditorCard').classList.add('hidden');$('#weekCard').classList.remove('hidden');renderWeek();return;}
    $('#planEditorCard').classList.remove('hidden');$('#weekCard').classList.add('hidden');
    planDay=+which;const date=shift(TD,planDay);
    $('#planTitle').textContent= planDay===0?'Today':'Tomorrow';
    $('#planHint').textContent= planDay===0?'Set up to three priorities, add if-then rules, name the first piece of work.':'Lock tomorrow in now, it\u2019ll be waiting on your home screen in the morning.';
    loadRec(date).then(()=>renderPlanEditor(date,$('#planEditor')));
  }

  /* REFLECT */
  function ensureReview(){const r=getRec(TD);if(!r.review)r.review={trackers:{sleep:null,food:[],steps:null,workouts:[],mood:null,clarity:null,energy:null},prod:{completed:'',distraction:'',motivator:'',deep:50},reflect:{helped:'',worse:'',diff:''},thoughts:''};const t=r.review.trackers;if(!Array.isArray(t.food))t.food=[];if(!Array.isArray(t.workouts))t.workouts=[];return r.review;}

  function stepBtn(txt){const b=document.createElement('button');b.type='button';b.className='step-btn';b.textContent=txt;return b;}
  function numv(v){return (v||v===0)?v:'';}

  function renderMetrics(){
    const rv=ensureReview(),t=rv.trackers,c=$('#metrics');c.innerHTML='';

    // SLEEP
    const sleep=document.createElement('div');sleep.className='metric-block';
    sleep.innerHTML='<div class="metric-head">Sleep</div>';
    const srow=document.createElement('div');srow.className='stepper';
    const minus=stepBtn('−'),plus=stepBtn('+');
    const sinp=document.createElement('input');sinp.type='number';sinp.step='0.5';sinp.min='0';sinp.inputMode='decimal';sinp.placeholder='';sinp.value=numv(t.sleep);
    const su=document.createElement('span');su.className='unit';su.textContent='hours';
    sinp.addEventListener('input',()=>{t.sleep=sinp.value===''?null:parseFloat(sinp.value);saveRec(TD);});
    function bumpSleep(d){let v=(t.sleep||0)+d;if(v<0)v=0;v=Math.round(v*2)/2;t.sleep=v;sinp.value=v;saveRec(TD);}
    minus.addEventListener('click',()=>bumpSleep(-0.5));plus.addEventListener('click',()=>bumpSleep(0.5));
    srow.appendChild(minus);srow.appendChild(sinp);srow.appendChild(plus);srow.appendChild(su);
    sleep.appendChild(srow);c.appendChild(sleep);

    // FOOD
    const food=document.createElement('div');food.className='metric-block';
    food.innerHTML='<div class="metric-head">Food <span class="mh-sub">what you ate · calories optional</span></div>';
    const flist=document.createElement('div');
    const total=document.createElement('div');total.className='log-total';
    function updTotal(){const s=t.food.reduce((a,b)=>a+(b.kcal||0),0);total.textContent=s>0?('Total logged: '+s+' kcal'):'';}
    function drawFood(){
      flist.innerHTML='';
      t.food.forEach((it,i)=>{
        const row=document.createElement('div');row.className='log-row';
        const nm=document.createElement('input');nm.className='lr-name';nm.placeholder='what you ate';nm.value=it.name||'';
        const kc=document.createElement('input');kc.className='lr-num';kc.type='number';kc.min='0';kc.inputMode='numeric';kc.placeholder='kcal';kc.value=numv(it.kcal);
        const rm=document.createElement('button');rm.className='lr-rm';rm.textContent='×';rm.title='remove';
        nm.addEventListener('input',()=>{it.name=nm.value;saveRec(TD);});
        kc.addEventListener('input',()=>{it.kcal=kc.value===''?null:parseInt(kc.value,10);updTotal();saveRec(TD);});
        rm.addEventListener('click',()=>{t.food.splice(i,1);drawFood();updTotal();saveRec(TD);});
        row.appendChild(nm);row.appendChild(kc);row.appendChild(rm);flist.appendChild(row);
      });
      const add=document.createElement('button');add.className='add-log';add.textContent='+ add food';
      add.addEventListener('click',()=>{t.food.push({name:'',kcal:null});drawFood();});
      flist.appendChild(add);
    }
    drawFood();updTotal();
    food.appendChild(flist);food.appendChild(total);c.appendChild(food);

    // MOVEMENT
    const move=document.createElement('div');move.className='metric-block';
    move.innerHTML='<div class="metric-head">Movement <span class="mh-sub">steps and/or workouts</span></div>';
    const strow=document.createElement('div');strow.className='stepper';
    const stinp=document.createElement('input');stinp.type='number';stinp.min='0';stinp.inputMode='numeric';stinp.placeholder='';stinp.style.width='110px';stinp.value=numv(t.steps);
    const stu=document.createElement('span');stu.className='unit';stu.textContent='steps';
    stinp.addEventListener('input',()=>{t.steps=stinp.value===''?null:parseInt(stinp.value,10);saveRec(TD);});
    strow.appendChild(stinp);strow.appendChild(stu);move.appendChild(strow);
    const wlist=document.createElement('div');
    function drawWork(){
      wlist.innerHTML='';
      t.workouts.forEach((w,i)=>{
        const row=document.createElement('div');row.className='log-row';
        const inp=document.createElement('input');inp.className='lr-name';inp.placeholder='e.g. 45-min upper body, 5k run';inp.value=w||'';
        const rm=document.createElement('button');rm.className='lr-rm';rm.textContent='×';rm.title='remove';
        inp.addEventListener('input',()=>{t.workouts[i]=inp.value;saveRec(TD);});
        rm.addEventListener('click',()=>{t.workouts.splice(i,1);drawWork();saveRec(TD);});
        row.appendChild(inp);row.appendChild(rm);wlist.appendChild(row);
      });
      const add=document.createElement('button');add.className='add-log';add.textContent='+ add workout';
      add.addEventListener('click',()=>{t.workouts.push('');drawWork();});
      wlist.appendChild(add);
    }
    drawWork();move.appendChild(wlist);c.appendChild(move);
  }

  function renderScales(){
    const rv=ensureReview(),c=$('#scales');c.innerHTML='';
    SCALES.forEach(t=>{
      const wrap=document.createElement('div');wrap.className='scale-row';
      wrap.innerHTML='<div class="scale-head"><span class="nm">'+t.nm+'</span><span class="en">'+t.en+'</span></div>';
      const sc=document.createElement('div');sc.className='scale';
      for(let n=1;n<=5;n++){const b=document.createElement('button');b.textContent=n;if(rv.trackers[t.id]===n)b.classList.add('on');
        b.addEventListener('click',()=>{rv.trackers[t.id]=n;renderScales();saveRec(TD);});sc.appendChild(b);}
      wrap.appendChild(sc);c.appendChild(wrap);
    });
  }
  function renderPlanned(){
    const r=getRec(TD),ul=$('#plannedList');ul.innerHTML='';
    const items=r.three.filter(x=>x.t.trim());
    if(!items.length){const li=document.createElement('li');li.textContent='(no priorities were set today)';ul.appendChild(li);return;}
    items.forEach(x=>{const li=document.createElement('li');li.className=x.done?'done-y':'done-n';li.innerHTML='<span class="mk">'+(x.done?'✓':'○')+'</span> '+esc(x.t);ul.appendChild(li);});
  }
  function deepText(v){return v<20?'almost all drifting':v<40?'mostly drifting':v<60?'about half and half':v<80?'mostly deep work':'almost all deep work';}
  function bindReflect(){
    const rv=ensureReview();
    renderMetrics();renderScales();renderPlanned();
    $$('#completedChips .chip').forEach(c=>{c.classList.toggle('on',rv.prod.completed===c.dataset.v);
      c.onclick=()=>{rv.prod.completed=c.dataset.v;$$('#completedChips .chip').forEach(x=>x.classList.toggle('on',x.dataset.v===rv.prod.completed));saveRec(TD);};});
    const bindTA=(id,obj,key)=>{const el=$(id);el.value=obj[key]||'';el.oninput=()=>{obj[key]=el.value;saveRec(TD);};};
    bindTA('#prodDistraction',rv.prod,'distraction');
    bindTA('#prodMotivator',rv.prod,'motivator');
    bindTA('#rHelped',rv.reflect,'helped');
    bindTA('#rWorse',rv.reflect,'worse');
    bindTA('#rDiff',rv.reflect,'diff');
    bindTA('#rThoughts',rv,'thoughts');
    const sl=$('#deepSlider');sl.value=rv.prod.deep;$('#deepVal').textContent=deepText(rv.prod.deep);
    sl.oninput=()=>{rv.prod.deep=+sl.value;$('#deepVal').textContent=deepText(rv.prod.deep);saveRec(TD);};
    // tomorrow plan
    const tdate=shift(TD,1);
    loadRec(tdate).then(()=>renderPlanEditor(tdate,$('#reflectPlan')));
    // media
    loadMedia(TD).then(()=>{renderGallery('pics',$('#galPics'));renderGallery('art',$('#galArt'));});
  }
  function blankMedia(){return {pics:[],art:[]};}
  async function loadMedia(date){
    if(media[date]) return media[date];
    const m=await store.get(mediaKey(date));
    media[date]= (m&&typeof m==='object')?{pics:Array.isArray(m.pics)?m.pics:[],art:Array.isArray(m.art)?m.art:[]}:blankMedia();
    return media[date];
  }
  const mediaTimers={};
  function saveMedia(date){const m=media[date];if(!m)return;clearTimeout(mediaTimers[date]);mediaTimers[date]=setTimeout(()=>store.set(mediaKey(date),m),300);}
  function saveMediaNow(date){const m=media[date];if(m)store.set(mediaKey(date),m);}

  function renderGallery(kind,mount){
    const m=media[TD]||blankMedia();const items=m[kind];mount.innerHTML='';
    items.forEach((it,i)=>{
      const tile=document.createElement('div');tile.className='tile';
      const img=document.createElement('img');img.src=it.img;img.alt='';
      const rm=document.createElement('button');rm.className='rm';rm.textContent='remove';
      rm.addEventListener('click',()=>{items.splice(i,1);renderGallery(kind,mount);saveMedia(TD);});
      const cap=document.createElement('input');cap.className='cap';cap.placeholder='caption…';cap.value=it.cap||'';
      cap.addEventListener('input',()=>{it.cap=cap.value;saveMedia(TD);});
      tile.appendChild(img);tile.appendChild(rm);tile.appendChild(cap);mount.appendChild(tile);
    });
    const add=document.createElement('div');add.className='tile';
    const lab=document.createElement('label');lab.className='drop';
    lab.innerHTML='<span class="ico">'+(kind==='pics'?'📷':'🎨')+'</span><span>'+(items.length?'Add another':(kind==='pics'?'Add a photo':'Add art'))+'</span><span style="font-weight:400;font-size:11px">'+(kind==='pics'?'a moment from today':'something you made or loved')+'</span>';
    const inp=document.createElement('input');inp.type='file';inp.accept='image/*';inp.multiple=true;inp.style.display='none';
    inp.addEventListener('change',e=>{const files=Array.from(e.target.files||[]);if(!files.length)return;let pending=files.length;files.forEach(f=>{downscale(f,d=>{items.push({img:d,cap:''});if(--pending<=0){renderGallery(kind,mount);saveMedia(TD);}});});});
    lab.appendChild(inp);add.appendChild(lab);mount.appendChild(add);
  }
  function downscale(file,cb){
    const fr=new FileReader();
    fr.onload=()=>{const im=new Image();im.onload=()=>{const max=900;let w=im.width,h=im.height;if(w>h&&w>max){h=h*max/w;w=max;}else if(h>max){w=w*max/h;h=max;}
      const cv=document.createElement('canvas');cv.width=w;cv.height=h;cv.getContext('2d').drawImage(im,0,0,w,h);
      try{cb(cv.toDataURL('image/jpeg',.72));}catch(e){cb(fr.result);}};im.src=fr.result;};
    fr.readAsDataURL(file);
  }
  function saveReflection(){
    const r=getRec(TD);saveRecNow(TD);saveRecNow(shift(TD,1));saveMediaNow(TD);
    if(!index.includes(TD)){index.unshift(TD);index=index.slice(0,180);store.set(INDEX_KEY,index);}
    const rv=r.review;
    if(rv){
      const t=rv.trackers||{};
      const cal=Array.isArray(t.food)?t.food.reduce((a,b)=>a+(b.kcal||0),0):0;
      trends[TD]={
        sleep:(t.sleep||t.sleep===0)?t.sleep:null,
        cal:cal>0?cal:null,
        steps:(t.steps||t.steps===0)?t.steps:null,
        mood:t.mood||null, clarity:t.clarity||null, energy:t.energy||null
      };
      const keys=Object.keys(trends).sort().slice(-60);const t2={};keys.forEach(k=>t2[k]=trends[k]);trends=t2;
      store.set(TRENDS_KEY,trends);
    }
    toast('Today\u2019s closed out. Tomorrow\u2019s set. See you in the morning.');
    setGlance();
  }

  /* HISTORY */
  const SPARKS=[
    {id:'sleep',nm:'Sleep',fmt:v=>(Math.round(v*10)/10)+' h'},
    {id:'cal',nm:'Calories',fmt:v=>Math.round(v).toLocaleString()+' kcal'},
    {id:'steps',nm:'Steps',fmt:v=>Math.round(v).toLocaleString()},
    {id:'mood',nm:'Mood',scale:true},
    {id:'clarity',nm:'Clarity',scale:true},
    {id:'energy',nm:'Energy',scale:true},
  ];
  function renderSparklines(){
    const grid=$('#sparkGrid');grid.innerHTML='';
    const dates=Object.keys(trends).sort().slice(-14);
    if(dates.length<2){grid.innerHTML='<p class="empty" style="grid-column:1/-1">Close out a few days and your trends will show up here.</p>';return;}
    let any=false;
    SPARKS.forEach(s=>{
      const vals=dates.map(d=>{const v=trends[d]?trends[d][s.id]:null;return (v||v===0)?v:null;});
      const present=vals.filter(v=>v!=null);if(present.length<2)return;
      any=true;
      const avg=present.reduce((a,b)=>a+b,0)/present.length;
      const lbl=s.scale?avg.toFixed(1):s.fmt(avg);
      const box=document.createElement('div');box.className='sparkbox';
      box.innerHTML='<div class="snm"><span>'+s.nm+'</span><span class="sval">'+lbl+'</span></div>'+(s.scale?sparkSVG(vals,1,5):sparkSVG(vals));
      grid.appendChild(box);
    });
    if(!any)grid.innerHTML='<p class="empty" style="grid-column:1/-1">Log a few numbers in Reflect and your trends will appear here.</p>';
  }
  function sparkSVG(vals,fixedMin,fixedMax){
    const W=160,H=38,n=vals.length,step=n>1?W/(n-1):W;
    const present=vals.filter(v=>v!=null);
    let lo=fixedMin!=null?fixedMin:Math.min.apply(null,present);
    let hi=fixedMax!=null?fixedMax:Math.max.apply(null,present);
    if(lo===hi){lo-=1;hi+=1;}
    const yOf=v=>H-4-((v-lo)/(hi-lo))*(H-8);
    let d='',first=true;
    vals.forEach((v,i)=>{if(v==null)return;const x=i*step,y=yOf(v);d+=(first?'M':'L')+x.toFixed(1)+' '+y.toFixed(1)+' ';first=false;});
    const pts=vals.map((v,i)=>v==null?'':'<circle cx="'+(i*step).toFixed(1)+'" cy="'+yOf(v).toFixed(1)+'" r="2.4" fill="var(--reflect)"/>').join('');
    return '<svg viewBox="0 0 '+W+' '+H+'" width="100%" height="'+H+'" preserveAspectRatio="none"><path d="'+d+'" fill="none" stroke="var(--reflect)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'+pts+'</svg>';
  }
  async function renderHistory(){
    renderSparklines();
    const list=$('#histList');list.innerHTML='';
    if(!index.length){list.innerHTML='<p class="empty">No closed-out days yet. Finish a Reflect and it\u2019ll land here.</p>';return;}
    for(const date of index.slice(0,30)){
      const r=await loadRec(date);
      const card=document.createElement('div');card.className='hist-day';
      const rv=r.review||{};const tr=rv.trackers||{};
      const done=r.three.filter(x=>x.done).length,total=r.three.filter(x=>x.t.trim()).length;
      const head=document.createElement('div');head.className='hist-head';
      head.innerHTML='<span><span class="chev" style="display:inline-block;transition:transform .2s">▸</span> <span class="hd-date">'+pretty(date)+'</span></span><span class="hd-meta">'+done+'/'+total+' done</span>';
      const body=document.createElement('div');body.className='hist-body';
      let html='';
      const parts=[];
      if(tr.sleep||tr.sleep===0)parts.push('Sleep <b>'+tr.sleep+'h</b>');
      const calT=Array.isArray(tr.food)?tr.food.reduce((a,b)=>a+(b.kcal||0),0):0;
      if(calT>0)parts.push('<b>'+calT.toLocaleString()+'</b> kcal');
      if(tr.steps)parts.push('<b>'+tr.steps.toLocaleString()+'</b> steps');
      const wcount=Array.isArray(tr.workouts)?tr.workouts.filter(w=>w&&w.trim()).length:0;
      if(wcount)parts.push('<b>'+wcount+'</b> workout'+(wcount>1?'s':''));
      if(tr.mood)parts.push('Mood <b>'+tr.mood+'</b>');
      if(tr.clarity)parts.push('Clarity <b>'+tr.clarity+'</b>');
      if(tr.energy)parts.push('Energy <b>'+tr.energy+'</b>');
      if(parts.length)html+='<div class="hist-trackline">'+parts.map(p=>'<span>'+p+'</span>').join('')+'</div>';
      const foods=Array.isArray(tr.food)?tr.food.filter(f=>f.name&&f.name.trim()):[];
      if(foods.length)html+='<div class="blk"><div class="k">Food</div>'+foods.map(f=>esc(f.name)+(f.kcal?' ('+f.kcal+')':'')).join(', ')+'</div>';
      const works=Array.isArray(tr.workouts)?tr.workouts.filter(w=>w&&w.trim()):[];
      if(works.length)html+='<div class="blk"><div class="k">Workouts</div>'+works.map(esc).join(', ')+'</div>';
      if(rv.prod&&rv.prod.motivator)html+='<div class="blk"><div class="k">What worked</div>'+esc(rv.prod.motivator)+'</div>';
      if(rv.reflect&&rv.reflect.helped)html+='<div class="blk"><div class="k">Helped me focus</div>'+esc(rv.reflect.helped)+'</div>';
      if(rv.reflect&&rv.reflect.worse)html+='<div class="blk"><div class="k">Made it worse</div>'+esc(rv.reflect.worse)+'</div>';
      if(rv.reflect&&rv.reflect.diff)html+='<div class="blk"><div class="k">Do differently</div>'+esc(rv.reflect.diff)+'</div>';
      if(rv.thoughts)html+='<div class="blk"><div class="k">Thoughts</div>'+esc(rv.thoughts)+'</div>';
      const m=await loadMedia(date);
      const galHtml=items=>'<div class="hist-gallery">'+items.map(p=>'<figure><img src="'+p.img+'" alt="">'+(p.cap?'<figcaption>'+esc(p.cap)+'</figcaption>':'')+'</figure>').join('')+'</div>';
      if(m.pics.length)html+='<div class="blk"><div class="k">Pics of the day</div>'+galHtml(m.pics)+'</div>';
      if(m.art.length)html+='<div class="blk"><div class="k">Art of the day</div>'+galHtml(m.art)+'</div>';
      if(!html)html='<p class="empty">Light entry, no reflection saved.</p>';
      body.innerHTML=html;
      head.addEventListener('click',()=>card.classList.toggle('open'));
      card.appendChild(head);card.appendChild(body);list.appendChild(card);
    }
  }

  /* nav */
  function showView(name){
    $$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.view===name));
    $$('.view').forEach(v=>v.classList.add('hidden'));
    $('#view-'+name).classList.remove('hidden');
    if(name==='plan')showPlanDay(planDay);
    if(name==='reflect')bindReflect();
    if(name==='history')renderHistory();
    window.scrollTo({top:0,behavior:'smooth'});
  }

  /* toast */
  let toastT=null;
  function toast(msg){const t=$('#toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),3200);}

  /* backup / restore */
  async function exportData(){
    const keys=await store.list();const out={};
    for(const k of keys){const full=k.indexOf('anchor:')===0?k:('anchor:'+k);out[full]=await store.get(full);}
    const payload={_anchor:'backup',version:1,exported:new Date().toISOString(),data:out};
    const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='anchor-backup-'+TD+'.json';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
    toast('Backup downloaded.');
  }
  function importData(file){
    const fr=new FileReader();
    fr.onload=async()=>{
      try{const obj=JSON.parse(fr.result);const data=(obj&&obj.data)?obj.data:obj;let n=0;
        for(const k in data){if(k.indexOf('anchor:')!==0)continue;await store.set(k,data[k]);n++;}
        toast('Imported '+n+' item'+(n===1?'':'s')+'. Reloading…');setTimeout(()=>location.reload(),900);
      }catch(e){toast('Couldn\u2019t read that backup file.');}
    };
    fr.readAsText(file);
  }

  /* wire */
  $$('.tab').forEach(t=>t.addEventListener('click',()=>showView(t.dataset.view)));
  $$('#planSeg button').forEach(b=>b.addEventListener('click',()=>showPlanDay(b.dataset.day==='week'?'week':+b.dataset.day)));
  $('#dumpToggle').addEventListener('click',()=>{const o=$('#dump').classList.toggle('open');$('#dumpToggle').setAttribute('aria-expanded',o);});
  $('#dumpAdd').addEventListener('click',addDump);
  $('#dumpInput').addEventListener('keydown',e=>{if(e.key==='Enter')addDump();});
  $('#winAdd').addEventListener('click',addWin);
  $('#winInput').addEventListener('keydown',e=>{if(e.key==='Enter')addWin();});
  $$('.len').forEach(b=>b.addEventListener('click',()=>setLen(+b.dataset.min)));
  $('#startBtn').addEventListener('click',startPause);
  $('#extend5').addEventListener('click',extend);
  $('#reduce5').addEventListener('click',shrink);
  $('#resetTimer').addEventListener('click',()=>setLen(lenMin));
  $('#toReflect').addEventListener('click',()=>showView('reflect'));
  $('#saveReflection').addEventListener('click',saveReflection);
  $('#exportBtn').addEventListener('click',exportData);
  $('#importInput').addEventListener('change',e=>{const f=e.target.files[0];if(f)importData(f);e.target.value='';});
  $('#gentleReset').addEventListener('click',()=>{const r=getRec(TD);r.three=blank(TD).three;r.care={};renderThree();renderCare();setGlance();saveRec(TD);$('#greeting').textContent='Clean slate.';setTimeout(setHeader,2200);window.scrollTo({top:0,behavior:'smooth'});});

  /* boot */
  async function boot(){
    setHeader();
    $('#storageMode').textContent = hasWS
      ? 'Saving to your Claude workspace, private to your account.'
      : hasIDB
      ? 'Saving to this browser on this device, private to you. Clearing browser data erases it, so back up first.'
      : 'This browser can\u2019t save data, so nothing will persist here.';
    const d=await store.get(DUMP_KEY);if(Array.isArray(d))dump=d;
    const w=await store.get(WIN_KEY);if(Array.isArray(w))wins=w;
    const ix=await store.get(INDEX_KEY);if(Array.isArray(ix))index=ix;
    const tr=await store.get(TRENDS_KEY);if(tr&&typeof tr==='object')trends=tr;
    await loadRec(TD);
    renderThree();renderGameplan();renderDump();renderCare();renderWins();setGlance();setLen(15);
  }
  boot();

  /* intro splash dismiss */
  (function(){
    const sp=$('#splash'); if(!sp) return;
    const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    let done=false;
    function go(){ if(done)return; done=true; sp.classList.add('gone'); setTimeout(()=>{ if(sp&&sp.parentNode) sp.parentNode.removeChild(sp); }, 650); }
    setTimeout(go, reduce?900:2300);
    sp.addEventListener('click',go);
  })();
})();
