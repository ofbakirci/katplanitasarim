function stubEl(tag) {
  return {
    tag, attrs:{}, children:[], style:{}, dataset:{}, _ih:'', h:{},
    set innerHTML(v){ this._ih=v; this.children=[]; },
    get innerHTML(){ return this._ih; },
    appendChild(c){ this.children.push(c); return c; },
    insertBefore(c){ this.children.unshift(c); return c; },
    addEventListener(t,f){ (this.h[t]=this.h[t]||[]).push(f); },
    dispatchEvent(e){ (this.h[e.type]||[]).forEach(f=>f(e)); return true; },
    querySelectorAll(){ return []; },
    querySelector(){ return null; },
    cloneNode(deep){ const c=stubEl(this.tag); Object.assign(c.attrs,this.attrs); if(deep) this.children.forEach(ch=>c.children.push(ch.cloneNode?ch.cloneNode(true):ch)); return c; },
    classList:{toggle(){},add(){},remove(){},contains(){return false;}},
    setAttribute(k,v){ this.attrs[k]=v; },
    getAttribute(k){ return this.attrs[k]; },
    getBoundingClientRect(){ return {width:1200,height:800,left:0,top:0}; },
    textContent:'', value:'', disabled:false, checked:false, onclick:null, click(){}, focus(){}, remove(){}, parentElement:null, offsetHeight:0
  };
}

function installDom(options) {
  const opts = options || {};
  const byId = {};
  const getEl = id => byId[id] || (byId[id]=stubEl('div'));
  getEl('binaTipi').value = opts.binaTipi || 'apartman';
  getEl('katSayisi').value = String(opts.katSayisi || 5);
  getEl('katYuk').value = String(opts.katYuk || 2.9);
  getEl('roomMenu').parentElement = stubEl('div');
  return {
    byId,
    getEl,
    stubEl,
    document: {
      getElementById:getEl,
      createElement:t=>stubEl(t),
      createElementNS:(n,t)=>stubEl(t),
      querySelector:()=>stubEl('aside'),
      addEventListener(){},
      querySelectorAll(){ return []; }
    }
  };
}

module.exports = { installDom, stubEl };
