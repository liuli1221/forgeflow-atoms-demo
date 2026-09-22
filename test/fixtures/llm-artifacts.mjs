export function makeArtifactFixture(kind = 'calculator') {
  const calculator = kind === 'calculator';
  const html = calculator
    ? `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="./styles.css" /></head><body><main data-testid="app-root"><output data-testid="calculator-display">0</output><button data-testid="key-7">7</button><button data-testid="key-add">+</button><button data-testid="key-5">5</button><button data-testid="key-equals">=</button><button data-testid="key-clear">C</button></main><script type="module" src="./app.js"></script></body></html>`
    : `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="./styles.css" /></head><body><main data-testid="app-root"><canvas data-testid="snake-canvas"></canvas><output data-testid="snake-score">0</output><button data-testid="snake-start">开始</button><span data-testid="snake-status">ready</span></main><script type="module" src="./app.js"></script></body></html>`;
  const js = calculator
    ? `const display=document.querySelector('[data-testid="calculator-display"]');document.querySelectorAll('button').forEach((button)=>button.addEventListener('click',()=>{display.textContent=button.textContent;}));`
    : `const status=document.querySelector('[data-testid="snake-status"]');let timer;document.querySelector('[data-testid="snake-start"]').addEventListener('click',()=>{status.textContent='running';timer=setInterval(()=>{},100);});window.addEventListener('keydown',(event)=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))event.preventDefault();});`;
  return {
    appName: calculator ? '计算器' : '贪吃蛇',
    appType: calculator ? 'utility' : 'game',
    summary: 'test',
    acceptanceCriteria: ['works'],
    files: {
      'index.html': html,
      'styles.css': 'body{margin:0;font-family:sans-serif}main{display:grid;gap:8px;padding:20px}button{min-height:40px}@media(max-width:600px){main{padding:10px}}'.repeat(2),
      'app.js': js,
    },
  };
}
