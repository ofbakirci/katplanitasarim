/* Classic script bootstrap: app files must also work as separate browser scripts. */
const vm = require('vm');
const { scriptSources } = require('./support/app-js');
const { installDom } = require('./support/dom-stub');

const dom = installDom();
const ctx = vm.createContext({
  console,
  matchMedia:()=>({matches:false}),
  document:dom.document,
  window:{addEventListener(){}},
  XMLSerializer:function(){this.serializeToString=()=>'';},
  Image:function(){},
  Blob:function(){},
  URL:{createObjectURL:()=>'', revokeObjectURL(){}},
  localStorage:{getItem(){return null;}, setItem(){}},
  requestAnimationFrame:fn=>fn&&fn(),
  setTimeout,
  clearTimeout
});

scriptSources().forEach(({ source, filename })=>{
  new vm.Script(source, { filename }).runInContext(ctx);
});

new vm.Script(`
  if (typeof M !== 'number') throw new Error('core binding M missing');
  if (typeof COLORS !== 'object') throw new Error('core binding COLORS missing');
  if (typeof generate !== 'function') throw new Error('app binding generate missing');
  if (typeof computeDoors !== 'function') throw new Error('doors binding computeDoors missing');
  if (typeof doorSnapshot !== 'function') throw new Error('doors binding doorSnapshot missing');
  if (typeof computeWallRuns !== 'function') throw new Error('walls binding computeWallRuns missing');
  if (typeof renderStructLayer !== 'function') throw new Error('structure binding renderStructLayer missing');
  if (typeof slimAntres !== 'function') throw new Error('rooms binding slimAntres missing');
  if (typeof render !== 'function') throw new Error('render binding render missing');
  if (typeof buildUnitTable !== 'function') throw new Error('render binding buildUnitTable missing');
  if (typeof collectChecks !== 'function') throw new Error('checks binding collectChecks missing');
  if (typeof renderChecks !== 'function') throw new Error('checks binding renderChecks missing');
  if (typeof runChecks !== 'function') throw new Error('checks binding runChecks missing');
  if (typeof fitView !== 'function') throw new Error('interaction binding fitView missing');
  if (typeof hitBalk !== 'function') throw new Error('interaction binding hitBalk missing');
  if (typeof stateSnapshot !== 'function') throw new Error('io binding stateSnapshot missing');
  if (typeof importPlanText !== 'function') throw new Error('io binding importPlanText missing');
  if (!document.getElementById('legend').children.length) throw new Error('legend did not bootstrap');
`, { filename:'bootstrap-assert.js' }).runInContext(ctx);

console.log('classic script bootstrap ok');
