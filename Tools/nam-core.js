/* Offline A2 Lite conversion. Matches tools/nam_capture.py's 2048-word IR payload.
 * No device or network access. The destination is a Fractal-Bot placeholder. */
(function(root){
  'use strict';
  const K=[...Array(14).fill(6),15,15,...Array(7).fill(6)];
  const D=[1,3,7,17,41,101,239,1,3,7,17,41,101,239,1,13,1,3,7,17,41,101,239];
  const FILM=['conv_pre_film','conv_post_film','input_mixin_pre_film','input_mixin_post_film','activation_pre_film','activation_post_film','layer1x1_post_film','head1x1_post_film'];
  function requireValue(ok,msg){if(!ok)throw Error(msg);}
  function object(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
  function equal(a,b){
    if(a===b)return true;
    if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
    const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(k=>Object.hasOwn(b,k)&&equal(a[k],b[k]));
  }
  function keysAllowed(v,keys){return object(v)&&Object.keys(v).every(k=>keys.includes(k));}
  function finite(v){return typeof v==='number'&&Number.isFinite(v);}
  function validate(m){
    requireValue(m.version==='0.7.0','Only NAM model schema 0.7.0 is supported.');
    requireValue(m.architecture==='WaveNet','This capture is not a supported WaveNet model.');
    requireValue(m.sample_rate===48000,'This capture must use a 48,000 Hz sample rate.');
    const c=m.config;
    requireValue(keysAllowed(c,['layers','head','head_scale','in_channels']),'Unsupported model configuration.');
    requireValue(c.head==null&&(c.in_channels===undefined?1:c.in_channels)===1,'Post-head and multichannel models are unsupported.');
    requireValue(finite(c.head_scale),'Invalid head scale.');
    requireValue(Array.isArray(c.layers)&&c.layers.length===1,'Expected one layer array.');
    const a=c.layers[0];
    requireValue(keysAllowed(a,['input_size','condition_size','head','channels','kernel_sizes','dilations','activation','bottleneck','head1x1','layer1x1','groups_input','groups_input_mixin','gating_mode','secondary_activation','slimmable',...FILM]),'Unsupported layer feature.');
    requireValue(a.channels===3&&a.bottleneck===3,'This firmware supports A2 Lite (3 channels), not A2 Full.');
    requireValue(a.input_size===1&&a.condition_size===1,'Expected mono conditioning.');
    requireValue(equal(a.kernel_sizes,K)&&equal(a.dilations,D),'This model does not have the supported A2 Lite layout.');
    requireValue(equal(a.head,{out_channels:1,kernel_size:16,bias:true}),'Unsupported head convolution.');
    requireValue(equal(a.layer1x1,{active:true,groups:1}),'Unsupported residual projection.');
    requireValue(a.head1x1===undefined||(object(a.head1x1)&&!(a.head1x1.active??false)),'Unsupported head projection.');
    requireValue((a.groups_input===undefined?1:a.groups_input)===1&&(a.groups_input_mixin===undefined?1:a.groups_input_mixin)===1,'Grouped convolutions are unsupported.');
    requireValue(a.slimmable==null,'Expected a fixed Lite submodel.');
    requireValue(equal(a.gating_mode===undefined?Array(23).fill('none'):a.gating_mode,Array(23).fill('none')),'Gated models are unsupported.');
    requireValue(equal(a.secondary_activation===undefined?Array(23).fill(null):a.secondary_activation,Array(23).fill(null)),'Secondary activations are unsupported.');
    for(const k of FILM)requireValue(a[k]==null||a[k]===false||(object(a[k])&&a[k].active===false),'FiLM processing is unsupported.');
    requireValue(Array.isArray(a.activation)&&a.activation.length===23,'Unsupported activation count.');
    for(const v of a.activation)requireValue(object(v)&&Object.keys(v).length===2&&v.type==='LeakyReLU'&&finite(v.negative_slope)&&Math.abs(v.negative_slope-.01)<=1e-9,'Unsupported activation.');
    requireValue(Array.isArray(m.weights)&&m.weights.length===1871,'Expected 1,871 A2 Lite weights.');
    requireValue(m.weights.every(x=>finite(x)&&Math.abs(x)<=3.4028234663852886e38),'Invalid or out-of-range model weights.');
    return m.weights;
  }
  function crc32(bytes){let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
  function seven(v){return [0,7,14,21,28].map(s=>(v>>>s)&127);}
  function packets(payload,slot=1){
    requireValue(payload instanceof Uint8Array&&payload.length===8192,'Invalid capture payload.');
    requireValue(Number.isInteger(slot)&&slot>=1&&slot<=512,'NAM slot must be 1–512.');
    const out=[],view=new DataView(payload.buffer,payload.byteOffset,payload.byteLength);
    function frame(command,data){const body=[240,0,1,116,6,command,...data];out.push(...body,body.reduce((a,b)=>a^b,0)&127,247);}
    const dest=512+slot-1;frame(0x7a,[dest>>7,dest&127,0,16]);let sum=0;
    for(let i=0;i<2048;i+=32){const data=[32,0];for(let j=i;j<i+32;j++){const w=view.getUint32(j*4,true);sum^=w;data.push(...seven(w));}frame(0x7b,data);}
    frame(0x7c,seven(sum));return new Uint8Array(out);
  }
  async function convert(raw,fileName){
    requireValue(raw instanceof Uint8Array,'Expected file bytes.');
    requireValue(raw.length<=32*1024*1024,'This file is too large (maximum 32 MB).');
    let doc;try{doc=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}catch(e){throw Error('This is not a valid UTF-8 NAM JSON file.');}
    requireValue(object(doc),'The NAM file must contain a model object.');
    let candidates=[doc];
    if(doc.architecture==='SlimmableContainer'){
      requireValue(keysAllowed(doc.config,['submodels'])&&Array.isArray(doc.config.submodels),'Unsupported container configuration.');
      requireValue(doc.weights==null||(Array.isArray(doc.weights)&&doc.weights.length===0),'Unexpected container weights.');
      candidates=doc.config.submodels.map(e=>e?.model);
      requireValue(candidates.every(object),'Invalid container model entry.');
    }
    const lite=candidates.filter(m=>m?.config?.layers?.[0]?.channels===3);
    requireValue(lite.length===1,'Expected exactly one A2 Lite profile (3 channels, 48 kHz). A2 Full, Standard, LSTM and other NAM layouts cannot be loaded by this firmware.');
    const weights=validate(lite[0]);
    const stem=fileName.replace(/\.nam$/i,'');
    const rawName=doc.metadata?.name||stem;
    requireValue(typeof rawName==='string','The capture name must be text.');
    const name=Array.from(rawName,c=>c.codePointAt(0)>=32&&c.codePointAt(0)<=126?c:'_').slice(0,31).join('');
    requireValue(root.crypto?.subtle,'Open the converter in a current desktop Chrome, Edge or Firefox browser. Secure file hashing is unavailable.');
    const hash=new Uint8Array(await root.crypto.subtle.digest('SHA-256',raw));
    const payload=new Uint8Array(8192),v=new DataView(payload.buffer);
    [0,0x314d414e,1,48000,3,1871,32,0].forEach((w,i)=>v.setUint32(i*4,w,true));
    payload.set(new TextEncoder().encode(name),32);payload.set(hash,64);
    weights.forEach((w,i)=>v.setFloat32((32+i)*4,w,true));
    v.setUint32(28,crc32(payload),true);
    return {name,payload,sysex:packets(payload),fileName:stem+'.NAM.syx',sourceSha256:Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('')};
  }
  const api={convert,packets,crc32,validate};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NamConverter=api;
})(globalThis);
