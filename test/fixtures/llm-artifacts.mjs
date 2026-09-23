export function makeArtifactFixture(kind = 'calculator', options = {}) {
  const calculator = kind === 'calculator';
  const snake = kind === 'snake';
  const appId = options.appId || 'app_crud_test';
  const html = calculator
    ? `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="./styles.css" /></head><body><main data-testid="app-root"><output data-testid="calculator-display">0</output><button data-testid="key-7">7</button><button data-testid="key-add">+</button><button data-testid="key-5">5</button><button data-testid="key-equals">=</button><button data-testid="key-clear">C</button></main><script type="module" src="./app.js"></script></body></html>`
    : snake
      ? `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="./styles.css" /></head><body><main data-testid="app-root"><canvas data-testid="snake-canvas"></canvas><output data-testid="snake-score">0</output><button data-testid="snake-start">开始</button><span data-testid="snake-status">ready</span></main><script type="module" src="./app.js"></script></body></html>`
      : `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="./styles.css" /></head><body><main data-testid="app-root"><h1>任务管理器</h1><button data-testid="item-add">新增任务</button><form data-testid="item-form" hidden><label>任务标题<input data-testid="item-title" /></label><button data-testid="item-save" type="submit">保存</button></form><ul data-testid="item-list"></ul></main><script type="module" src="./app.js"></script></body></html>`;
  const js = calculator
    ? `const display=document.querySelector('[data-testid="calculator-display"]');document.querySelectorAll('button').forEach((button)=>button.addEventListener('click',()=>{display.textContent=button.textContent;}));`
    : snake
      ? `const status=document.querySelector('[data-testid="snake-status"]');let timer;document.querySelector('[data-testid="snake-start"]').addEventListener('click',()=>{status.textContent='running';timer=setInterval(()=>{},100);});window.addEventListener('keydown',(event)=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))event.preventDefault();});`
      : `const APP_ID=${JSON.stringify(appId)};const STORAGE_KEY='forgeflow.appdata.'+APP_ID;const list=document.querySelector('[data-testid="item-list"]');const form=document.querySelector('[data-testid="item-form"]');const title=document.querySelector('[data-testid="item-title"]');let items=[];function render(){list.replaceChildren(...items.map((item)=>{const li=document.createElement('li');li.textContent=item.title;return li;}));}function save(){window.parent.postMessage({source:'forgeflow-app',type:'save',key:STORAGE_KEY,data:{items}},'*');}document.querySelector('[data-testid="item-add"]').addEventListener('click',()=>{form.hidden=false;title.focus();});form.addEventListener('submit',(event)=>{event.preventDefault();if(!title.value.trim())return;items.push({id:String(Date.now()),title:title.value.trim()});title.value='';form.hidden=true;render();save();});window.addEventListener('message',(event)=>{const msg=event.data;if(!msg||msg.source!=='forgeflow-host'||msg.type!=='init')return;items=msg.data&&Array.isArray(msg.data.items)?msg.data.items:[];render();});window.parent.postMessage({source:'forgeflow-app',type:'ready',appId:APP_ID},'*');`;
  return {
    appName: calculator ? '计算器' : snake ? '贪吃蛇' : '任务管理器',
    appType: calculator ? 'utility' : snake ? 'game' : 'crud',
    summary: 'test',
    acceptanceCriteria: ['works'],
    files: {
      'index.html': html,
      'styles.css': 'body{margin:0;font-family:sans-serif}main{display:grid;gap:8px;padding:20px}button{min-height:40px}@media(max-width:600px){main{padding:10px}}'.repeat(2),
      'app.js': js,
    },
  };
}
