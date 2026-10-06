'use strict';
(() => {
  const D = window.GAME_DATA;
  const key = 'jincheng-iron-bridge-v1';
  const $ = (s, root = document) => root.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = { node: 1, completed: [], items: [], walls: [], notes: [], selected: {}, history: [], answers: [], largeText: false, reviewNode: null };
  let timer;
  const node = id => {
    if(id == null) return D.nodes[0];
    const raw = String(id).trim();
    return D.nodes.find(n => n.id === raw)
      || D.nodes.find(n => n.id === `N${raw.padStart(2,'0')}`)
      || ( /^\d+(?:\.0+)?$/.test(raw) ? D.nodes.find(n => n.id === `N${String(Number(raw)).padStart(2,'0')}`) : null )
      || D.nodes[0];
  };
  const item = id => D.items[id];
  const has = id => state.items.includes(id);
  const current = () => node(state.reviewNode || state.node) || D.nodes[0];
  const mainProgressNode = () => node(state.node) || D.nodes[0];
  const save = () => { localStorage.setItem(key, JSON.stringify(state)); const s=$('#save-status'); if(s) s.textContent = '已自动保存 · ' + new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); };
  const load = () => {
    try {
      const x = JSON.parse(localStorage.getItem(key));
      if (x && typeof x === 'object') Object.assign(state, x);
    } catch(e) {}
    if(!Array.isArray(state.completed)) state.completed=[];
    if(!Array.isArray(state.items)) state.items=[];
    if(!Array.isArray(state.walls)) state.walls=[];
    if(!Array.isArray(state.notes)) state.notes=[];
    if(!Array.isArray(state.history)) state.history=[];
    if(!Array.isArray(state.answers)) state.answers=[];
    if(!state.selected || typeof state.selected!=='object') state.selected={};
    document.body.classList.toggle('large-text', !!state.largeText);
  };
  const toast = msg => { const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(timer); timer=setTimeout(()=>t.classList.remove('show'),2500); };
  const image = (src, alt='配图') => src ? `./assets/${esc(src)}` : '';
  const labels = {story:'剧情过场',single:'关键调查 · 单选',fill:'关键调查 · 填空',judge:'关键调查 · 判断与填空',sort:'关键调查 · 排序',light:'关键调查 · 逐条点亮',field:'实景彩蛋'};
  function available(n) { return !n.requires || n.requires.every(x => has(x)); }
  function missing(n) { return (n.requires || []).filter(x=>!has(x)).map(x=>item(x)?.title || x); }
  function resolveNodeId(id) {
    const raw = String(id ?? '').trim();
    const exact = D.nodes.find(n => n.id === raw);
    if(exact) return exact.id;
    if(/^\d+(?:\.0+)?$/.test(raw)) {
      const numeric = String(Number(raw)).padStart(2,'0');
      const byNumber = D.nodes.find(n => n.id === `N${numeric}`);
      if(byNumber) return byNumber.id;
    }
    const prefixed = raw.startsWith('N') ? raw : `N${raw}`;
    return D.nodes.find(n => n.id === prefixed)?.id || null;
  }
  function nextSequentialId(n) {
    const i = D.nodes.findIndex(x => x.id === n.id);
    return i >= 0 && D.nodes[i + 1] ? D.nodes[i + 1].id : null;
  }
  function nextNode(id) {
    const targetId = resolveNodeId(id) || 'N01';
    if(state.reviewNode){
      state.reviewNode = targetId;
      state.selected={};
      save();
      render();
      window.scrollTo({top:0,behavior:'smooth'});
      return;
    }
    state.history.push(state.node);
    state.node = targetId;
    state.selected={};
    save();
    render();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function finishNode(n) { if (!state.completed.includes(n.id)) state.completed.push(n.id); (n.gains||[]).forEach(x=>gain(x)); if(n.enterGains) n.enterGains.forEach(x=>gain(x)); (n.wall||[]).forEach(x=>{ if(!state.walls.includes(x)) state.walls.push(x); }); save(); }
  function gain(id) { if(!D.items[id] || has(id)) return; state.items.push(id); const x=item(id); if(x && !state.notes.includes(x.title)) state.notes.push(x.title); }

  // 记录每道已正确完成的题目；同一节点重复作答时只更新为最新记录，不产生重复条目。
  function recordAnswer(n, answer) {
    if(!Array.isArray(state.answers)) state.answers=[];
    const rec = { id:n.id, title:n.title, type:n.type, answer:String(answer ?? ''), time:new Date().toISOString() };
    const i = state.answers.findIndex(x => x.id === n.id);
    if(i >= 0) state.answers[i] = rec; else state.answers.push(rec);
    state.answers.sort((a,b)=>new Date(a.time)-new Date(b.time));
    save();
  }

  function feedback(n, message, gains=[]) {
    const list = gains.filter(Boolean).map(x => item(x)).filter(Boolean);
    const evidenceHtml = list.length ? `<div class="feedback-evidence-grid">${list.map(x => `
      <article class="feedback-evidence">
        ${x.image ? `<button class="feedback-evidence-image" data-action="zoom" data-src="${esc(x.image)}" data-caption="${esc(x.title)}"><img loading="lazy" src="${image(x.image)}" alt="${esc(x.title)}"></button>` : ''}
        <div class="feedback-evidence-copy">
          <strong>${esc(x.title)}</strong>
          ${x.text ? `<p>${esc(x.text)}</p>` : ''}
        </div>
      </article>`).join('')}</div>` : '';
    return `<div class="feedback"><h3>线索已记录</h3><p>${esc(message || n.success || '你的判断已写入卷宗。')}</p>${evidenceHtml}</div>`;
  }


  function renderRail() {
    const r=$('#rail');
    const pct=Math.round((state.completed.length/40)*100);
    const mainN=mainProgressNode();
    const viewN=current();
    const reviewText=state.reviewNode ? `<div class="review-status">正在回看 ${esc(viewN.id)} · ${esc(viewN.title)}</div>` : '';
    r.innerHTML=`<div class="rail-label">行动进度</div><div class="progress-track"><span style="width:${Math.min(100,pct)}%"></span></div><div class="progress-text">已完成 ${state.completed.length} / 40 节点</div><div class="progress-text small-progress">当前进度：${esc(mainN.id)} · ${esc(mainN.title)}</div>${reviewText}<div class="rail-actions"><button class="primary rail-current" data-action="current">返回当前进度</button><button data-action="history">节点回看 <strong>${state.completed.length}</strong></button></div><hr><button data-action="map" class="${mainN.id==='N04'?'active':''}">金城调查地图</button><button data-action="evidence">证物与档案 <strong>${state.items.length}</strong></button><button data-action="wall">案件墙 <strong>${state.walls.length}</strong></button><hr><div class="rail-label">三句话提示</div><div class="reminder">仔细观察铁桥。<br>不要轻信资料。<br>颜色很重要。</div><hr><button data-action="extras">额外探索</button><button data-action="settings">设置字体和重置进度</button>`;
  }

  function shell(n) { return `<div class="page-meta"><span class="eyebrow">${esc(labels[n.type]||'调查节点')}</span><span class="node-count">${esc(n.id)} · ${esc(n.title)}</span></div>`; }
  function bodyText(n) { return (n.body||[]).map(x=>`<p>${esc(x)}</p>`).join(''); }
  function visuals(n) {
    const imgs=n.images || (n.image?[n.image]:[]); if(!imgs.length) return '';
    return `<div class="visual"><div class="photo-stack ${imgs.length>1?'two':''}">${imgs.map((x,i)=>`<button class="photo-btn" data-action="zoom" data-src="${esc(x)}" data-caption="${esc(n.caption||'点击查看大图')}"><img loading="lazy" src="${image(x)}" alt="${esc(n.caption||'卷宗配图')}"></button>`).join('')}</div>${n.caption?`<p class="caption">${esc(n.caption)} · 点击图片放大</p>`:''}</div>`;
  }
  function archive(n) { return n.archive ? `<details class="archive"><summary>打开提示档案，遇到难题或无法搜集到所需信息时使用</summary><p>${esc(n.archive)}</p></details>`:''; }
  function renderQuestion(n) {
    let q='';
    if(n.type==='single') q=`<div class="question"><h2>${esc(n.prompt)}</h2>${n.options.map((x,i)=>`<button class="choice" data-action="answer-single" data-i="${i}"><span class="letter">${String.fromCharCode(65+i)}</span><span>${esc(x)}</span></button>`).join('')}</div>`;
    if(n.type==='fill' || n.type==='judge') {
      q=`<div class="question"><h2>${esc(n.prompt)}</h2>${n.type==='judge'?'<div class="actions judge-actions"><button class="secondary" data-action="judge" data-val="yes">是</button><button class="secondary" data-action="judge" data-val="no">否</button></div>':''}<div class="fields">${(n.fields||[]).map((f,i)=>`<label class="field">${esc(f[0])}<input id="field-${i}" autocomplete="off" data-answer-index="${i}" ${n.type==='judge' && i===0 && !state.selected.judge?'disabled':''}></label>`).join('')}</div><div class="actions"><button class="primary" data-action="submit-fields">提交判断</button></div></div>`;
    }
    if(n.type==='sort') q=`<div class="question"><h2>${esc(n.prompt)}</h2><div class="sort-order" id="sort-order">还没有选择地点。请按顺序点击下方卡片。</div><div>${n.options.map(x=>`<button class="choice sort-choice" data-action="sort-add" data-value="${esc(x)}"><span class="letter">＋</span><span>${esc(x)}</span></button>`).join('')}</div><div class="actions"><button class="primary" data-action="submit-sort">确认顺序</button><button class="secondary" data-action="sort-reset">重置</button></div></div>`;
    if(n.type==='light') q=`<div class="question"><h2>${esc(n.prompt)}</h2><div>${n.options.map((x,i)=>`<button class="choice light-choice" data-action="light" data-i="${i}"><span class="letter">○</span><span>${esc(x)}</span></button>`).join('')}</div><div class="recorded" id="light-status">已确认 0 / ${n.options.length} 条</div></div>`;
    if(n.type==='field') q=`<div class="question"><h2>${esc(n.prompt)}</h2>${n.options.map((x,i)=>`<button class="choice" data-action="field-record" data-i="${i}"><span class="letter">${i+1}</span><span>${esc(x)}</span></button>`).join('')}<div class="actions"><button class="primary" data-action="field-next">记录并继续</button></div></div>`;
    return q;
  }
  function reviewBanner(n) {
    if(!state.reviewNode) return '';
    const mainN=mainProgressNode();
    return `<div class="review-banner"><div><strong>正在回看：${esc(n.id)} · ${esc(n.title)}</strong><span>当前正式进度仍停留在 ${esc(mainN.id)} · ${esc(mainN.title)}</span></div><div class="actions"><button class="primary" data-action="current">返回当前进度</button><button class="secondary" data-action="resume-from-review">从此节点继续</button></div></div>`;
  }

  function renderStory(n) {
    if(n.id==='N01') return `${reviewBanner(n)}<section class="hero"><div class="hero-art"><img src="${image(n.image)}" alt="金城烽烟铁桥密信封面"></div><div class="hero-copy"><span class="eyebrow">兰州实景探索</span><h1>金城烽烟<span>铁桥密信</span></h1><div class="hero-rule"></div>${bodyText(n)}<div class="actions"><button class="primary" data-action="continue">${esc(n.button)}</button></div><p class="note">本作将当代实景观察、地方文化知识与虚构故事拼合为一份互动卷宗。</p></div></section>`;
    const continueLabel = n.button || (n.type === 'story' ? '继续' : '');
    const content=`${bodyText(n)}${n.quote?`<blockquote class="quote">${esc(n.quote)}</blockquote>`:''}${n.note?`<div class="note">${esc(n.note)}</div>`:''}${continueLabel?`<div class="actions"><button class="primary" data-action="continue">${esc(continueLabel)}</button></div>`:''}`;
    return `${shell(n)}${reviewBanner(n)}<div class="story-grid ${n.image||n.images?'':'no-image'}">${visuals(n)}<div class="scene-text">${content}${n.type!=='story'&&n.prompt?renderQuestion(n):''}${archive(n)}<div id="feedback-slot"></div></div></div>`;
  }
  function renderNode(n) {
    if(!available(n)) return renderGated(n);
    if(n.id==='N40') return renderEnd(n);
    return renderStory(n);
  }
  function renderGated(n) { const ms=missing(n); return `${shell(n)}<div class="gated"><h2>这条线索还没有齐</h2><p>先把前置证物放进卷宗，再回来继续。</p><ul class="missing-list">${ms.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><div class="actions"><button class="primary" data-action="map">回到调查地图</button><button class="secondary" data-action="evidence">查看已有证物</button></div></div>`; }
  function renderEnd(n) { return `${shell(n)}${reviewBanner(n)}<div class="completion">${n.image?`<img src="${image(n.image)}" alt="黄河铁桥晨光">`:''}<h1>${esc(n.title)}</h1><div class="scene-text">${bodyText(n)}</div>${n.video?`<section class="video-feature"><div class="video-preview"><img src="${image(n.video.image)}" alt="${esc(n.video.title)}"><span class="video-play" aria-hidden="true">▶</span></div><div class="video-copy"><span class="eyebrow">历史回顾视频</span><h2>${esc(n.video.title)}</h2><p>完成卷宗后，打开这篇历史回顾，继续了解兰州抗战期间的中山桥。视频位于微信文章页面，点击后将在新页面播放。</p><a class="primary video-link" target="_blank" rel="noopener noreferrer" href="${esc(n.video.url)}">${esc(n.video.label)}</a></div></section>`:''}${n.sources?`<h2>资料核对入口</h2><ul class="source-list"><li><a target="_blank" rel="noopener" href="https://dfzb.lanzhou.gov.cn/art/2017/10/16/art_9606_518474.html">兰州市地方志办公室：兰州黄河铁桥（中山桥）</a></li><li><a target="_blank" rel="noopener" href="https://www.lzbljbscjng.com/html/2023/guanzhang_0904/1156.html">兰州八路军办事处纪念馆：黄河铁桥</a></li><li><a target="_blank" rel="noopener" href="https://www.peopleapp.com/column/30050075288-500007051662">人民日报客户端：一座城市的空战记忆</a></li><li><a target="_blank" rel="noopener" href="https://www.gswbj.gov.cn/a/2024/07/09/21105.html">甘肃文旅：中山桥的百年守望</a></li></ul>`:''}<div class="actions"><button class="primary" data-action="home">回到卷宗首页</button><button class="secondary" data-action="settings">设置字体和重置进度</button></div></div>`; }
  function render() {
    try {
      const n=current();
      if(!n) throw new Error('无法定位当前节点');
      renderRail();
      $('#main').innerHTML=renderNode(n);
      $('#main').focus({preventScroll:true});
      bindState(n);
    } catch(e) {
      console.error('[金城烽烟] render error:', e);
      const main=$('#main');
      if(main) main.innerHTML=`<div class=\"gated\"><h2>卷宗暂时无法打开</h2><p>请刷新页面。若仍然出现此提示，请在 GitHub 中确认 app.js 已完整上传。</p></div>`;
    }
  }
  function bindState(n) {
    if(n.type==='sort') { state.selected.sort ||= []; updateSort(); }
    if(n.type==='light') { state.selected.light ||= []; updateLight(n); }
    if(n.type==='field') state.selected.field ??= null;
    if(n.type==='judge' && state.selected.judge) { $('.fields input')?.removeAttribute('disabled'); }
    if(state.selected.field!==null && state.selected.field!==undefined) document.querySelectorAll('[data-action="field-record"]')[state.selected.field]?.classList.add('selected');
  }
  function action(e) {
    const el=e.target.closest('[data-action]'); if(!el) return; const a=el.dataset.action; const n=current();
    if(a==='continue') {
      if(state.reviewNode){ toast('你正在回看历史节点。请先返回当前进度，或选择“从此节点继续”。'); return; }
      finishNode(n);
      if(n.id==='N37') nextNode('N38');
      else if(n.id==='N40') goHome();
      else nextNode(n.next || nextSequentialId(n));
    }else if(a==='current') {
  state.reviewNode = null;
  state.selected = {};
  save();
  $('#dialog').close();
  render();
  window.scrollTo({top:0,behavior:'smooth'});
} else if(a==='resume-from-review') { if(state.reviewNode){ state.node=resolveNodeId(state.reviewNode)||state.node; state.reviewNode=null; state.selected={}; save(); render(); window.scrollTo({top:0,behavior:'smooth'}); } } else if(a==='map') showMap(); else if(a==='evidence') showEvidence(); else if(a==='wall') showWall(); else if(a==='history') showHistory(); else if(a==='extras') showExtras(); else if(a==='settings') showSettings(); else if(a==='close-dialog') $('#dialog').close();
    else if(a==='zoom') showImage(el.dataset.src,el.dataset.caption);
    else if(a==='answer-single') answerSingle(n, Number(el.dataset.i), el);
    else if(a==='judge') { state.selected.judge=el.dataset.val; document.querySelectorAll('.fields input').forEach(x=>x.removeAttribute('disabled')); toast(state.selected.judge==='yes'?'你选择相信自己的判断。':'提示已展开，输入地点名称时要包含“三台”。'); }
    else if(a==='submit-fields') submitFields(n);
    else if(a==='sort-add') sortAdd(el.dataset.value);
    else if(a==='sort-reset') { state.selected.sort=[]; updateSort(); }
    else if(a==='submit-sort') submitSort(n);
    else if(a==='light') lightAdd(n,Number(el.dataset.i),el);
    else if(a==='field-record') { state.selected.field=Number(el.dataset.i); document.querySelectorAll('[data-action="field-record"]').forEach(x=>x.classList.remove('selected')); el.classList.add('selected'); }
    else if(a==='field-next') { finishNode(n); recordAnswer(n, n.options?.[state.selected.field] || '已完成现场记录'); const slot=$('#feedback-slot'); slot.innerHTML=feedback(n,'观察已记录，不判对错。你可以继续阅读这份历史回声。'); setTimeout(()=>nextNode(39),500); }
  }
  function appendFeedback(n,msg,gains,answer='') { finishNode(n); if(answer!=='') recordAnswer(n,answer); const slot=$('#feedback-slot'); slot.innerHTML=feedback(n,msg,gains||n.gains||[])+`<div class="actions"><button class="primary" data-action="continue">继续</button></div>`; document.querySelectorAll('.question button,.question input').forEach(x=>x.disabled=true); slot.scrollIntoView({behavior:'smooth',block:'center'}); }
  function answerSingle(n,i,el) { if(i===n.correct) { el.classList.add('selected'); appendFeedback(n,n.success,n.gains||[],n.options?.[i]||''); } else { el.classList.add('selected'); const q=el.closest('.question'); let er=q.querySelector('.error'); if(!er){er=document.createElement('div');er.className='error';q.prepend(er)} er.textContent=n.hint||'再想想。'; setTimeout(()=>el.classList.remove('selected'),650); } }
  function norm(x) { return String(x||'').trim().replace(/[\s　，。、“”‘’'"\-_/]/g,'').toLowerCase(); }
  function checkField(n, vals) { if(n.id==='N26') return /^(16|十六)上$/.test(vals[0].replace(/[\s\/／]/g,'')); if(n.id==='N31') return /白萝卜|萝卜/.test(vals[0].replace(/\s/g,'')); if(n.id==='N19') return vals[0].includes('三台'); return (n.fields||[]).every((f,i)=>f[1]==='*'||norm(vals[i])===norm(f[1]) || (n.id==='N13' && i===1)); }
  function submitFields(n) { if(n.type==='judge'&&!state.selected.judge){toast('先选择“是”或“否”。');return} const vals=[...document.querySelectorAll('.fields input')].map(x=>x.value.trim()); if(checkField(n,vals)) { const answer = n.type==='judge' ? `${state.selected.judge==='yes'?'是':'否'}；${vals.filter(Boolean).join('；')}` : vals.join('；'); appendFeedback(n,n.success,n.gains||[],answer); } else {let q=$('.question'),er=q.querySelector('.error');if(!er){er=document.createElement('div');er.className='error';q.prepend(er)}er.textContent=n.hint||'答案还没有对上，再检查一次。';} }
  function sortAdd(v) { state.selected.sort ||= []; if(!state.selected.sort.includes(v)) state.selected.sort.push(v); updateSort(); }
  function updateSort(){ const box=$('#sort-order'); if(box) box.textContent=state.selected.sort?.length?state.selected.sort.join('  →  '):'还没有选择地点。请按顺序点击下方卡片。'; document.querySelectorAll('.sort-choice').forEach(b=>b.classList.toggle('selected',state.selected.sort?.includes(b.dataset.value))); }
  function submitSort(n) { if(JSON.stringify(state.selected.sort)!==JSON.stringify(n.order)){toast('顺序还不对：先回想运输批注。');return} appendFeedback(n,n.success,n.gains||[],state.selected.sort.join(' → ')); }
  function updateLight(n) {
    const selected = Array.isArray(state.selected.light) ? state.selected.light : [];
    document.querySelectorAll('[data-action=\"light\"]').forEach((b,i)=>{
      const on = selected.includes(i);
      b.classList.toggle('selected', on);
      const mark=b.querySelector('.letter');
      if(mark) mark.textContent=on ? '✓' : '○';
    });
    const status=$('#light-status');
    if(status) status.textContent=`已确认 ${selected.length} / ${n.options.length} 条`;
  }
  function lightAdd(n,i,el) { state.selected.light ||= []; if(!state.selected.light.includes(i)){state.selected.light.push(i);el.classList.add('selected');el.querySelector('.letter').textContent='✓';} $('#light-status').textContent=`已确认 ${state.selected.light.length} / ${n.options.length} 条`; if(state.selected.light.length===n.options.length) appendFeedback(n,n.success,n.gains||[],n.options.join('；')); }
  function goHome(){ state.node='N01'; state.history=[]; state.reviewNode=null; state.selected={}; save(); render(); }
  function ensureNodeHistoryStyles(){
    if(document.getElementById('node-history-style')) return;
    const style=document.createElement('style');
    style.id='node-history-style';
    style.textContent=`
      .review-banner{margin:0 0 26px;padding:15px 17px;background:#ebe5d8;border:1px solid var(--line);border-left:4px solid var(--rust);display:flex;justify-content:space-between;align-items:center;gap:18px}
      .review-banner>div:first-child{min-width:0}.review-banner strong{display:block;font-family:var(--serif);font-size:17px}.review-banner span{display:block;color:var(--muted);font-size:13px;margin-top:4px}.review-banner .actions{margin-top:0;flex-shrink:0}
      .node-history{max-width:980px}.node-history-group{margin:0 0 26px}.node-history-act{font:600 13px/1.5 var(--sans);letter-spacing:.12em;color:var(--rust);padding:9px 0;border-bottom:2px solid #b69a78;margin-bottom:4px}
      .node-history-row{width:100%;display:grid;grid-template-columns:70px minmax(0,1fr) auto;align-items:center;gap:14px;text-align:left;background:var(--surface);border:1px solid var(--line);border-top:0;padding:13px 15px;min-height:64px}
      .node-history-row:first-of-type{border-top:1px solid var(--line)}.node-history-row:hover:not(:disabled){background:#f0e7d6;border-color:#bda98a;position:relative;z-index:1}
      .node-history-row.is-current{background:#e8e2d3;border-left:4px solid var(--rust);padding-left:12px}.node-history-row.is-done .node-history-no{color:var(--green)}.node-history-row.is-locked{background:#efede6;color:#8a8f87}
      .node-history-no{font:600 15px/1 var(--sans);color:var(--rust)}.node-history-main{min-width:0}.node-history-main strong{display:block;font-family:var(--serif);font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.node-history-main small{display:block;color:var(--muted);font-size:12px;margin-top:2px}.node-history-state{font-size:12px;color:var(--muted);white-space:nowrap}.is-current .node-history-state{color:var(--rust);font-weight:650}.is-done .node-history-state{color:var(--green)}
      .progress-text.small-progress{line-height:1.5;margin-bottom:3px}.review-status{font-size:12px;color:var(--rust);margin:8px 0 4px;padding:0 10px}
      @media(max-width:720px){.review-banner{display:block;padding:14px;margin-bottom:20px}.review-banner .actions{margin-top:12px}.review-banner .actions .primary,.review-banner .actions .secondary{width:100%}.node-history-row{grid-template-columns:54px minmax(0,1fr) auto;gap:9px;padding:12px 10px}.node-history-main strong{font-size:15px}.node-history-state{font-size:11px}.node-history-no{font-size:13px}}
    `;
    document.head.appendChild(style);
  }

  function ensureFeedbackEvidenceStyles(){
    if(document.getElementById('feedback-evidence-styles')) return;
    const style=document.createElement('style');
    style.id='feedback-evidence-styles';
    style.textContent=`
      .feedback-evidence-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-top:16px}
      .feedback-evidence{border:1px solid #bccabb;background:#fffdf4;overflow:hidden}
      .feedback-evidence-image{display:block;width:100%;padding:0;background:#e9e1cf;border:0;cursor:zoom-in}
      .feedback-evidence-image img{display:block;width:100%;height:220px;object-fit:contain}
      .feedback-evidence-copy{padding:12px 14px}
      .feedback-evidence-copy strong{display:block;font-family:var(--serif);font-size:15px;color:var(--ink);margin-bottom:5px}
      .feedback-evidence-copy p{margin:0;color:var(--muted);font-size:13px;line-height:1.7}
      @media(max-width:720px){.feedback-evidence-grid{grid-template-columns:1fr}.feedback-evidence-image img{height:190px}}
    `;
    document.head.appendChild(style);
  }

function ensureMobileHistoryNav(){
  const nav = $('.mobile-nav');
  if(!nav) return;

  const buttons = [
    ['map', '地图'],
    ['evidence', '证物'],
    ['wall', '案件墙'],
    ['history', '进度'],
    ['extras', '探索']
  ];

  buttons.forEach(([action, label])=>{
    if(!nav.querySelector(`[data-action="${action}"]`)){
      nav.insertAdjacentHTML(
        'beforeend',
        `<button data-action="${action}">${label}</button>`
      );
    }
  });

  nav.style.gridTemplateColumns = 'repeat(5,1fr)';

  nav.querySelectorAll('button').forEach(b=>{
    b.style.fontSize = '12px';
    b.style.padding = '0 2px';
  });
}
  function showImage(src,cap){ $('#dialog-title').textContent=cap||'卷宗配图'; $('#dialog-body').innerHTML=`<img class="dialog-image" src="${image(src)}" alt="${esc(cap||'卷宗配图')}">`; $('#dialog').showModal(); }
  function showMap(){ $('#dialog').close(); $('#main').innerHTML=`<div class="page-meta"><span class="eyebrow">调查地图</span><span class="node-count">可按你的旅程进入</span></div><h1>金城调查地图</h1><p class="map-intro">主线按推荐顺序排列。已走过的地点会保留证物；点开任一调查区，即可从最适合当前进度的位置继续。</p><div class="route-caption"><span>推荐路线</span><span>中山桥 → 白塔山 → 水车园 → 城内 → 314号</span></div><div class="map-grid">${D.regions.map((r,i)=>`<button class="region-card" data-action="region" data-start="${r.start}"><img src="${image(r.image)}" alt="${esc(r.name)}"><div class="region-copy"><span class="region-number">0${i+1}</span><h2>${esc(r.name)}</h2><p>${esc(r.tag)}</p><span class="region-status">${state.completed.includes('N'+String(r.start).padStart(2,'0'))?'已调查':'待调查'} · 点击进入</span></div></button>`).join('')}<div class="wide-card"><div><h2>继续上次调查</h2><p>当前停留在 ${esc(mainProgressNode().id)} · ${esc(mainProgressNode().title)}。你也可以从节点目录回看已经完成的节点。</p></div><button class="primary" data-action="current">回到当前进度</button></div></div>`; renderRail(); }
  function showEvidence(){ $('#dialog').close(); $('#main').innerHTML=`<div class="page-meta"><span class="eyebrow">证物库</span><span class="node-count">共 ${state.items.length} 件</span></div><h1>证物与档案</h1>${state.items.length?`<div class="items-grid">${state.items.map(id=>{const x=item(id);return `<button class="evidence-card" data-action="item" data-id="${esc(id)}">${x.image?`<img loading="lazy" src="${image(x.image)}" alt="${esc(x.title)}">`:'<div class="paper-mark">卷宗</div>'}<h3>${esc(x.title)}</h3><p>${esc(x.text)}</p></button>`}).join('')}</div>`:'<div class="empty">你还没有获得证物。沿着中山桥调查区开始，卷宗会在关键节点记录线索。</div>'}`; renderRail(); }
  function showWall(){ $('#dialog').close(); $('#main').innerHTML=`<div class="page-meta"><span class="eyebrow">线索汇总</span><span class="node-count">案件墙</span></div><h1>案件墙</h1>${state.walls.length?state.walls.map((x,i)=>`<div class="wall-entry"><span class="index">${String(i+1).padStart(2,'0')}</span><p>${esc(x)}</p></div>`).join(''):'<div class="empty">案件墙还没有更新。每次获得关键证物，相关疑点会自动写入这里。</div>'}`; renderRail(); }
  function showHistory(){
    $('#dialog').close();
    const progressIds=new Set(state.completed||[]);
    const mainNode=mainProgressNode();
    const groups=[];
    const byAct=new Map();
    D.nodes.forEach((n)=>{ const act=n.act||'主线'; if(!byAct.has(act)){ const g={act,nodes:[]}; byAct.set(act,g); groups.push(g); } byAct.get(act).nodes.push(n); });
    const groupHtml=groups.map(g=>`<section class="node-history-group"><div class="node-history-act">${esc(g.act)}</div>${g.nodes.map((n)=>{
      const done=progressIds.has(n.id);
      const isCurrent=n.id===mainNode.id;
      const label=isCurrent?'当前进度':(done?'已完成':'未到达');
      const disabled=!done && !isCurrent;
      return `<button class="node-history-row ${isCurrent?'is-current':''} ${done?'is-done':''} ${disabled?'is-locked':''}" ${disabled?'disabled':''} data-action="review-node" data-id="${esc(n.id)}"><span class="node-history-no">${esc(n.id)}</span><span class="node-history-main"><strong>${esc(n.title)}</strong><small>${esc(labels[n.type]||'调查节点')}</small></span><span class="node-history-state">${label}</span></button>`;
    }).join('')}</section>`).join('');
    $('#main').innerHTML=`<div class="page-meta"><span class="eyebrow">节点回看</span><span class="node-count">共 ${D.nodes.length} 个节点</span></div><h1>调查进度与节点回看</h1><p class="map-intro">这里不是“答案记录”，而是你的调查卷宗目录。已完成的节点可以点击回看；回看不会改变当前正式进度。需要从某个历史节点重新开始时，可在该节点页点击“从此节点继续”。</p><div class="node-history">${groupHtml}</div><div class="actions"><button class="primary" data-action="current">返回当前进度 · ${esc(mainNode.id)}</button><button class="secondary" data-action="map">查看调查地图</button></div>`;
    renderRail();
  }

  function showExtras(){ $('#dialog-title').textContent='额外探索 · 不阻塞主线'; $('#dialog-body').innerHTML=`<div class="extras-list">${D.extras.map(x=>`<button data-action="extra" data-id="${esc(x.id)}"><h3>${esc(x.title)}</h3><p>${esc(x.prompt)}</p></button>`).join('')}</div>`; $('#dialog').showModal(); }
  function showExtra(id){const x=D.extras.find(y=>y.id===id);if(!x)return;$('#dialog-title').textContent=x.title;$('#dialog-body').innerHTML=`${x.image?`<img class="dialog-image" src="${image(x.image)}" alt="${esc(x.title)}">`:''}<p class="dialog-body-text">${esc(x.prompt)}</p><div class="actions"><button class="primary" data-action="extra-answer" data-id="${esc(id)}">查看答案</button></div>`;}
  function showExtraAnswer(id){const x=D.extras.find(y=>y.id===id);$('#dialog-title').textContent=x.title;$('#dialog-body').innerHTML=`<p class="dialog-body-text"><strong>档案答案：</strong>${esc(x.answer)}</p><button class="secondary" data-action="extras">返回额外探索</button>`;}
  function showSettings(){ $('#dialog-title').textContent='设置字体和重置进度'; $('#dialog-body').innerHTML=`<div class="settings-row"><h3>字体大小</h3><p>在手机上阅读长段落时，可以放大正文。</p><button class="secondary" data-action="large-text">${state.largeText?'恢复标准字号':'放大正文'}</button></div><div class="settings-row"><h3>重新开始</h3><p>清空本设备上的进度，从序章重新进入。</p><button class="secondary danger" data-action="reset">清空进度</button></div><div class="settings-row"><h3>网页说明</h3><p>这是纯静态网页，不需要登录或联网数据；图片与进度都在本网页中处理。建议用手机浏览器打开，现场只在安全、开放的公共区域观察，不要为了答题攀爬或靠近危险位置。</p></div>`; $('#dialog').showModal(); }
  document.addEventListener('click', e=>{ const el=e.target.closest('[data-action]'); if(!el) return; const a=el.dataset.action;if(a==='review-node'){
  const id=el.dataset.id;
  const target=node(id);
  if(!target)return;
  state.reviewNode=target.id;
  state.selected={};
  render();
  window.scrollTo({top:0,behavior:'smooth'});
  return;
} if(a==='region'){ $('#dialog').close(); nextNode(Number(el.dataset.start)); } else if(a==='current'){ $('#dialog').close(); render(); } else if(a==='item'){const x=item(el.dataset.id);$('#dialog-title').textContent=x.title;$('#dialog-body').innerHTML=`${x.image?`<img class="dialog-image" src="${image(x.image)}" alt="${esc(x.title)}">`:' '}<p class="dialog-body-text">${esc(x.text)}</p>`;$('#dialog').showModal();} else if(a==='extra'){showExtra(el.dataset.id)} else if(a==='extra-answer'){showExtraAnswer(el.dataset.id)} else if(a==='large-text'){state.largeText=!state.largeText;document.body.classList.toggle('large-text',state.largeText);save();showSettings()} else if(a==='reset'){if(confirm('确定清空本设备上的卷宗进度吗？')){localStorage.removeItem(key);location.reload();}} else action(e); });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#dialog').open)$('#dialog').close();});
  load(); ensureNodeHistoryStyles(); ensureFeedbackEvidenceStyles(); ensureMobileHistoryNav(); render();
})();
