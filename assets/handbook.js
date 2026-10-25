(() => {
  'use strict';
  const isEnglish=()=>document.documentElement.lang==='en';
  const englishRows=new Map((window.GLOW_SHORTCUTS_EN || []).map(row=>[row.id,row]));
  const localized=row=>isEnglish()?(englishRows.get(row.id)||row):row;
  const tr=value=>window.GlowLocale?.t(value) || value;
  const keySymbols = {Space:'␣',Ctrl:'⌃',Control:'⌃',Cmd:'⌘',Command:'⌘',Alt:'⌥',Option:'⌥',Shift:'⇧',Enter:'↩',Return:'↩',Tab:'⇥',Esc:'⎋',Backspace:'⌫',Delete:'⌦'};
  const symbolNames = {Space:'空格键（Space）',Ctrl:'控制键（Control）',Cmd:'命令键（Command）','Alt/Option':'选项键（Alt / Option）',Shift:'上档键（Shift）',Enter:'回车键（Enter）',Tab:'制表键（Tab）',Esc:'退出键（Escape）',Backspace:'退格键（Backspace）',Delete:'向前删除键（Delete）',':':'冒号命令',鼠标双击:'鼠标双击'};
  function displayText(value,binding=false) {
    let text=binding?String(value ?? ''):String(tr(value) ?? '');
    const pattern=binding?/\b(Space|Ctrl|Control|Cmd|Command|Alt|Option|Shift|Enter|Return|Tab|Esc|Backspace|Delete)\b\+?/gi:/\b(Ctrl|Control|Cmd|Command|Alt|Option|Shift)\+/g;
    text=text.replace(pattern,(match,name)=>keySymbols[Object.keys(keySymbols).find(key=>key.toLowerCase()===name.toLowerCase())]).replace(/空格(?:键)?/g,'␣');
    if(!binding)return text.replace(/\bSpace\b/g,'␣').replace(/\bAlt key\b/g,'⌥ key').replace(/\b(press|Press) Enter\b/g,'$1 ↩').replace(/([⌃⌘⌥⇧])(Enter|Return|Tab|Esc|Backspace|Delete)\b/g,(_,modifier,key)=>modifier+keySymbols[key]);
    if(!isEnglish())return text;
    const descriptions={'恢复缩放组合键':'Reset zoom chord','放大组合键':'Zoom-in chord','缩小组合键':'Zoom-out chord','系统全选快捷键':'System select-all shortcut','系统复制快捷键':'System copy shortcut','系统撤销快捷键':'System undo shortcut','系统注释快捷键':'System comment shortcut','系统粘贴快捷键':'System paste shortcut','系统重做快捷键':'System redo shortcut','项目目录':'project directory','文件或 URL':'file or URL','PDF 文件':'PDF file','旧符号':'old delimiter','新符号':'new delimiter','移动范围':'motion','鼠标双击':'Double-click','鼠标拖动':'mouse drag','PDF 正文单击':'click in PDF content','方向键':'arrow key','修饰键':'modifier','组合键':'key chord','终端':'Terminal','双击':'Double-click','单击':'click','拖动':'drag','普通':'Normal','插入':'Insert','范围':'range','符号':'delimiter','文件':'file'};
    for(const [from,to] of Object.entries(descriptions))text=text.replaceAll(from,to);
    return text.replaceAll('（','(').replaceAll('）',')');
  }
  const searchText = value => displayText(value,true).replace(/([⌃⌘⌥⇧])\+(?=.)/g,'$1').toLowerCase();
  // A slash in Ctrl+/ is a key; only a separated, top-level slash divides aliases.
  function splitAliases(value) {
    const text = String(value ?? '');
    const aliases = [];
    let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
      if ('（('.includes(text[i])) depth++;
      else if ('）)'.includes(text[i])) depth = Math.max(0, depth - 1);
      const separator = text[i] === '/' && /[\s）)]/.test(text[i - 1] || '') && /\s/.test(text[i + 1] || '');
      if (!depth && (separator || /[；;]/.test(text[i]))) {
        const alias = text.slice(start, i).trim();
        if (alias) aliases.push(alias);
        start = i + 1;
      }
    }
    const alias = text.slice(start).trim();
    if (alias) aliases.push(alias);
    const command = aliases[0]?.match(/^:\S+/)?.[0];
    return [...new Set(aliases.map(alias=>command&&!alias.startsWith(':')?`${command} ${alias}`:alias))];
  }
  function triggerFor(alias) {
    const key = String(alias).trim().replace(/^终端\s+/,'');
    if (/^(?:Space|␣)(?:\s|$)/i.test(key)) return 'Space';
    if (/^\\(?:\s|$)/.test(key)) return '\\';
    const modifier = key.match(/^(Ctrl|Control|Cmd|Command|Alt|Option|Shift)\+/i)?.[1]?.toLowerCase();
    if (modifier) return {ctrl:'Ctrl',control:'Ctrl',cmd:'Cmd',command:'Cmd',alt:'Alt/Option',option:'Alt/Option',shift:'Shift'}[modifier];
    if (key.startsWith(':')) return ':';
    if (key === '双击') return '鼠标双击';
    return key.split(/[\s（(]/)[0];
  }
  function keySets(row, platform) {
    if (platform === 'mac' && row.macKeys) return [{label:'', aliases:splitAliases(row.macKeys)}];
    if (platform === 'windows' && row.windowsKeys) return [{label:'', aliases:splitAliases(row.windowsKeys)}];
    // These base fields describe the action; the platform fields contain the real keys.
    const descriptive = /^(?:系统|修饰键)|组合键$/.test(row.keys) && (row.macKeys || row.windowsKeys);
    const sets = descriptive?[]:[{label:'', aliases:splitAliases(row.keys)}];
    if (platform === 'all') {
      if (row.macKeys) sets.push({label:'Mac', aliases:splitAliases(row.macKeys)});
      if (row.windowsKeys) sets.push({label:'Windows', aliases:splitAliases(row.windowsKeys)});
    }
    return sets;
  }
  const prefixOrder = ['Space','\\','Ctrl','Cmd','Alt/Option','Shift'];
  const ordinaryOrder = ['g','[',']','o','c','d','f','h','n','y'];
  const specialOrder = ['Tab','Enter','Esc','Backspace','Delete','↑','↓','←','→','PageUp','PageDown','F1'];
  function triggerSection(trigger) {
    return prefixOrder.includes(trigger)?'常用前缀与修饰键':specialOrder.includes(trigger)?'特殊键':trigger===':'||trigger==='鼠标双击'?'命令与鼠标':'普通首键';
  }
  function triggerSort(a,b) {
    const sections = ['常用前缀与修饰键','普通首键','特殊键','命令与鼠标'];
    const sectionDiff = sections.indexOf(triggerSection(a))-sections.indexOf(triggerSection(b));
    if (sectionDiff) return sectionDiff;
    const order = prefixOrder.includes(a)?prefixOrder:specialOrder.includes(a)?specialOrder:ordinaryOrder;
    const rank = key=>order.includes(key)?order.indexOf(key):order.length;
    return rank(a)-rank(b) || a.localeCompare(b,'en',{sensitivity:'variant'});
  }
  function triggerLabel(trigger) { return trigger==='Alt/Option'?'⌥':trigger===':'?(isEnglish()?': commands':': 命令'):displayText(trigger,true); }
  function triggerGroups(rows,platform) {
    const byTrigger = new Map();
    rows.forEach(row=>new Set(keySets(row,platform).flatMap(set=>set.aliases.map(triggerFor))).forEach(trigger=> {
      if(!trigger)return;
      if(!byTrigger.has(trigger))byTrigger.set(trigger,[]);
      byTrigger.get(trigger).push(row);
    }));
    return [...byTrigger].sort(([a],[b])=>triggerSort(a,b)).map(([trigger,groupRows])=>({trigger,label:triggerLabel(trigger),rows:groupRows}));
  }
  // Share the initial page across groups while counting each action only once.
  function visibleActions(groups, limit) {
    const visible = new Set();
    for (let index = 0; visible.size < limit; index++) {
      let found = false;
      for (const group of groups) {
        if (group.rows[index]) { found = true; visible.add(group.rows[index]); }
        if (visible.size >= limit) break;
      }
      if (!found) break;
    }
    return visible;
  }
  const host = document.getElementById('shortcut-handbook');
  if (!host) return;
  const data = window.GLOW_SHORTCUTS;
  if (!Array.isArray(data) || !data.length) {
    host.innerHTML = '<p class="manual-loading">清单未能载入。请刷新页面，或查看<a class="link" href="assets/shortcuts.json">完整快捷键数据</a>。</p>';
    return;
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arr = value => Array.isArray(value) ? value : value ? [value] : [];
  const unique = field => [...new Set(data.flatMap(row => arr(row[field])))];
  const state = {q:'', platform:'all', trigger:'all', category:'all', scene:'all', mode:'all', limit:24};
  const standalone = document.body.hasAttribute('data-manual-page');
  const filterFields = ['platform','trigger','category','scene','mode'];
  function readLocation() {
    if (!standalone) return;
    const params = new URLSearchParams(location.search);
    state.q = params.get('q') || '';
    state.limit = 24;
    for (const field of filterFields) {
      const value = params.get(field) || 'all';
      const choices = field === 'platform' ? ['all','mac','windows','linux'] : field === 'trigger' ? null : ['all',...unique(field)];
      state[field] = !choices || choices.includes(value) ? value : 'all';
    }
  }
  function syncLocation() {
    if (!standalone) return;
    const url = new URL(location.href);
    for (const field of ['q',...filterFields]) {
      const value = state[field];
      if (value && value !== 'all') url.searchParams.set(field,value);
      else url.searchParams.delete(field);
    }
    if (url.href !== location.href) history.replaceState(history.state,'',url);
  }
  readLocation();
  const modes = unique('mode');
  host.innerHTML = `<div class="manual-shell"><div class="manual-toolbar"><label class="manual-search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input id="shortcut-search" type="search" placeholder="试试：Notebook、PDF、终端、␣…" aria-label="搜索功能、场景或快捷键" autocomplete="off" spellcheck="false"><button type="button" id="clear-query" aria-label="清空搜索" hidden>清空</button></label><div class="manual-filters"><div class="platform-filters" role="group" aria-label="筛选平台">${[['all','全部平台'],['mac','Mac'],['windows','Windows'],['linux','Linux']].map(([value,label])=>`<button type="button" data-platform="${value}" aria-pressed="${value==='all'}">${label}</button>`).join('')}</div><div id="trigger-filter" class="filter-dropdown"></div><div id="category-filter" class="filter-dropdown"></div><div id="scene-filter" class="filter-dropdown"></div><div id="mode-filter" class="filter-dropdown"></div></div></div><div class="manual-summary"><span id="result-count" role="status" aria-live="polite"></span><button class="manual-reset" type="button">重置筛选</button></div><div class="shortcut-list" id="shortcut-results"></div><div class="manual-more" hidden><button type="button">显示更多</button></div><div class="manual-footnote">按键区分大小写与当前焦点。模式按配置标注；来源中 config/ 指配置根，runtime/lazy/ 指冻结插件目录。手册不向编辑器发送按键。</div></div>`;
  const input = host.querySelector('input');
  input.value = state.q;
  const clear = host.querySelector('#clear-query');
  const result = host.querySelector('#shortcut-results');
  const more = host.querySelector('.manual-more');
  const dropdowns = [];
  function dropdown(id, field, title, values) {
    const wrapper = host.querySelector('#'+id);
    wrapper.innerHTML = `<button type="button" class="filter-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}-menu"><span>${title}</span><svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="m2 4 4 4 4-4"/></svg></button><div class="filter-menu" id="${id}-menu" role="listbox" aria-label="${title}" hidden></div>`;
    const trigger = wrapper.querySelector('.filter-trigger');
    const menu = wrapper.querySelector('.filter-menu');
    let buttons = [];
    function close(focus=false) { menu.hidden=true; trigger.setAttribute('aria-expanded','false'); if(focus) trigger.focus(); }
    function open() { dropdowns.forEach(d=>d.close()); menu.hidden=false; trigger.setAttribute('aria-expanded','true'); buttons.find(b=>b.dataset.value===state[field])?.focus(); }
    function sync() {
      const label=state[field]==='all'?title:field==='trigger'?triggerLabel(state[field]):displayText(state[field]);
      trigger.querySelector('span').textContent=label;
      trigger.title=field==='trigger'&&state[field]!=='all'?(symbolNames[state[field]]||state[field]):label;
      trigger.setAttribute('aria-label',field==='trigger'?`筛选触发键：${state[field]==='all'?title:symbolNames[state[field]]||state[field]}`:label);
      buttons.forEach(b=>b.setAttribute('aria-selected',String(b.dataset.value===state[field])));
    }
    function setOptions(entries) {
      let previousGroup='';
      menu.innerHTML=[{value:'all',label:title},...entries].map(option=> {
        const heading=option.group&&option.group!==previousGroup?`<div class="filter-option-group" role="presentation">${esc(option.group)}</div>`:'';
        previousGroup=option.group||previousGroup;
        const name=option.value==='all'?title:field==='trigger'?(symbolNames[option.value]||option.value):option.label;
        return heading+`<button type="button" class="filter-option" role="option" tabindex="-1" aria-label="${esc(name)}" title="${esc(name)}" aria-selected="${option.value===state[field]}" data-value="${esc(option.value)}"><span>${esc(displayText(option.label))}</span>${option.count===undefined?'':`<small>${option.count}</small>`}</button>`;
      }).join('');
      buttons=[...menu.querySelectorAll('button')];
      buttons.forEach(b=>b.addEventListener('click',()=>{state[field]=b.dataset.value;state.limit=24;sync();render();close(true);}));
      sync();
    }
    trigger.addEventListener('click',()=>menu.hidden ? open() : close());
    trigger.addEventListener('keydown', e=> { if(e.key==='Escape' && trigger.getAttribute('aria-expanded')==='true') {e.preventDefault();close(true);} else if(['ArrowDown','ArrowUp'].includes(e.key)) {e.preventDefault();open();} });
    menu.addEventListener('keydown',e=> {
      const index=buttons.indexOf(document.activeElement);
      if(e.key==='Escape') {e.preventDefault();close(true);}
      else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)) {e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();}
      else if(e.key==='Tab') close();
    });
    setOptions(values.map(value=>({value,label:value})));
    const control={close,sync,setOptions,wrapper};
    dropdowns.push(control);
    return control;
  }
  const triggerDropdown=dropdown('trigger-filter','trigger','全部触发键',[]);
  dropdown('category-filter','category','全部功能',unique('category'));
  dropdown('scene-filter','scene','全部场景',unique('scene'));
  dropdown('mode-filter','mode','全部模式',modes);
  document.addEventListener('click',e=>dropdowns.forEach(d=>{if(!d.wrapper.contains(e.target))d.close();}));
  function matchesPlatform(row) {
    if(state.platform==='all')return true;
    const values=arr(row.platforms).join(' ').toLowerCase();
    if(/通用|all|跨平台/.test(values))return true;
    return state.platform==='mac'?/mac|darwin/.test(values):state.platform==='windows'?/windows|win32/.test(values):/linux/.test(values);
  }
  function mark(value) {
    const text=displayText(value);
    if(!state.q.trim())return esc(text);
    const query=searchText(state.q.trim()), start=searchText(text).indexOf(query);
    return start<0?esc(text):esc(text.slice(0,start))+'<mark>'+esc(text.slice(start,start+query.length))+'</mark>'+esc(text.slice(start+query.length));
  }
  function sourceLink(raw) {
    const clean=String(raw);
    if(/^https:\/\//.test(clean))return `<a href="${esc(clean)}" target="_blank" rel="noopener noreferrer">查看映射 ↗</a>`;
    return `<code>${esc(clean)}</code>`;
  }
  function keyMarkup(row, trigger) {
    return keySets(row,state.platform).map(set=> {
      const aliases=set.aliases.filter(alias=>triggerFor(alias)===trigger);
      if(!aliases.length)return '';
      const raw=aliases.join(' / '), keys=esc(displayText(raw,true));
      const keycap=`<kbd title="${esc(raw)}" aria-label="${esc(raw)}">${keys}</kbd>`;
      return set.label?`<div class="shortcut-keyset"><small>${esc(set.label)}</small>${keycap}</div>`:keycap;
    }).join('');
  }
  function rowMarkup(row, trigger) {
    const text=localized(row);
    return `<article class="shortcut-row" data-shortcut-id="${esc(row.id)}"><div><div class="shortcut-context"><span class="shortcut-category">${esc(text.categoryLabel || row.category)}</span><span>${esc(text.scene)}</span><span>${esc(text.mode)}</span></div><h4>${mark(text.title)}</h4><div class="shortcut-keys">${keyMarkup(row,trigger)}</div></div><div><p class="shortcut-action">${mark(text.action)}</p><p class="shortcut-condition">${esc(tr('前提'))} · ${mark(text.prerequisite||'相应功能已加载，焦点位于对应窗口。')}</p><details class="shortcut-evidence"><summary>适用平台与来源</summary><p>${esc(arr(row.platforms).join(' / '))}</p><ul>${arr(row.source).map(s=>`<li>${sourceLink(s)}</li>`).join('')}</ul></details></div></article>`;
  }
  function render() {
    const tokens=searchText(state.q.trim()).split(/\s+/).filter(Boolean);
    const candidates=data.filter(row=>matchesPlatform(row)&&(state.category==='all'||arr(row.category).includes(state.category))&&(state.scene==='all'||arr(row.scene).includes(state.scene))&&(state.mode==='all'||arr(row.mode).includes(state.mode))&&tokens.every(token=>searchText([row.title,row.keys,row.macKeys,row.windowsKeys,row.category,row.scene,row.mode,row.prerequisite,row.action,...arr(row.tags),...Object.values(englishRows.get(row.id)||{}).filter(value=>typeof value==='string')].join(' ')).includes(token)));
    const availableGroups=triggerGroups(candidates,state.platform);
    if(state.trigger!=='all'&&!availableGroups.some(group=>group.trigger===state.trigger))state.trigger='all';
    triggerDropdown.setOptions(availableGroups.map(group=>({value:group.trigger,label:group.label,group:triggerSection(group.trigger),count:group.rows.length})));
    const groups=availableGroups.filter(group=>state.trigger==='all'||state.trigger===group.trigger);
    const rows=[...new Set(groups.flatMap(group=>group.rows))];
    const visible=visibleActions(groups,state.limit);
    host.querySelector('#result-count').innerHTML=`<strong>${rows.length}</strong> 项匹配 <span> / ${data.length} 项已核对操作</span><small>计数按操作去重；跨组别名分别展示，每组仅列对应按键。</small>`;
    result.innerHTML=rows.length?groups.map((group,index)=> {
      const shown=group.rows.filter(row=>visible.has(row));
      if(!shown.length)return '';
      const name=symbolNames[group.trigger]||group.trigger;
      return `<section class="shortcut-group" aria-labelledby="shortcut-group-${index}"><div class="shortcut-group-heading"><h3 id="shortcut-group-${index}" title="${esc(name)}" aria-label="${esc(name)}">${esc(group.label)}</h3><span>显示 ${shown.length} / ${group.rows.length} 项操作</span></div>${shown.map(row=>rowMarkup(row,group.trigger)).join('')}</section>`;
    }).join(''):`<div class="manual-empty"><strong>没有找到这组操作</strong><p>试试功能名、按键或场景，或减少一个筛选条件。</p><button class="manual-reset" type="button" data-empty-reset>清空并显示全部</button></div>`;
    const remaining=Math.max(0,rows.length-visible.size);
    more.hidden=remaining===0;
    more.querySelector('button').textContent=`再显示 ${Math.min(24,remaining)} 项操作 · 余 ${remaining} 项`;
    clear.hidden=!state.q;
    host.querySelectorAll('[data-platform]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.platform===state.platform)));
    result.querySelector('[data-empty-reset]')?.addEventListener('click',reset);
    syncLocation();
    window.GlowLocale?.apply(host);
  }
  function sync() {dropdowns.forEach(d=>d.sync());}
  function reset() {Object.assign(state,{q:'',platform:'all',trigger:'all',category:'all',scene:'all',mode:'all',limit:24});input.value='';sync();render();}
  input.addEventListener('input',()=>{state.q=input.value;state.limit=24;render();});
  clear.addEventListener('click',()=>{state.q='';input.value='';state.limit=24;render();input.focus();});
  host.querySelector('.manual-summary .manual-reset').addEventListener('click',reset);
  host.querySelectorAll('[data-platform]').forEach(b=>b.addEventListener('click',()=>{state.platform=b.dataset.platform;state.limit=24;render();}));
  more.querySelector('button').addEventListener('click',()=>{state.limit+=24;render();});
  document.querySelectorAll('[data-query]').forEach(a=>a.addEventListener('click',()=>{reset();state.q=a.dataset.query;input.value=state.q;render();}));
  document.addEventListener('glow:languagechange',()=>{sync();render();});
  if (standalone) window.addEventListener('popstate',()=>{readLocation();input.value=state.q;sync();render();});
  sync();render();
})();
