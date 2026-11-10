'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
function harness(getUserMedia) {
 const events = () => ({disabled:false,value:'',events:{},addEventListener(k,f){this.events[k]=f;},replaceChildren(){},append(){}});
 const video={...events(),readyState:2,videoWidth:640,videoHeight:480,play:async()=>{},pause(){}};
 const select=events(),rearm=events(),calls=[],messages=[],frames=[],timers=[];let stopped=0;
 const track={stop(){stopped++;},getSettings:()=>({deviceId:'good'}),addEventListener(){}};
 const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};
 class Unreadable extends Error {}
 const reader={decode(){const next=frames.shift();if(!next)throw new Unreadable();return {getText:()=>next,getBarcodeFormat:()=>1};}};
 const window={isSecureContext:true};const media={getUserMedia:getUserMedia||(async()=>stream),enumerateDevices:async()=>[{kind:'videoinput',deviceId:'good',label:'Traseira'}]};
 vm.runInNewContext(fs.readFileSync(require.resolve('../camera-scanner.js'),'utf8'),{window,navigator:{mediaDevices:media},localStorage:{getItem:()=> 'good',setItem(){},removeItem(){}},document:{createElement:tag=>tag==='canvas'?{getContext:()=>({drawImage(){}})}:{}},setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){},ZXing:window.ZXing={MultiFormatReader:function(){return reader;},DecodeHintType:{},BarcodeFormat:{EAN_13:1,CODE_128:2},BinaryBitmap:function(){},HybridBinarizer:function(){},HTMLCanvasElementLuminanceSource:function(){},NotFoundException:Unreadable,ChecksumException:class extends Error{},FormatException:class extends Error{}}});
 const camera=new window.CameraScanner({video,select,rearm,onScan:code=>calls.push(code),onStatus:message=>messages.push(message),onStop(){}});
 return {camera,frames,calls,messages,rearm,select,media,stream,video,stopped:()=>stopped,tick:()=>timers.shift()?.()};
}
test('@spec:AC-099 câmera bloqueia duplicações por código e botão libera sem emitir evento sozinho',async()=>{
 const h=harness();h.frames.push('00042');await h.camera.open();h.frames.push('00042','PLA0060','00042');h.tick();h.tick();h.tick();assert.deepEqual(h.calls,['00042','PLA0060']);
 h.rearm.events.click();assert.deepEqual(h.calls,['00042','PLA0060']);h.frames.push('00042');h.tick();assert.deepEqual(h.calls,['00042','PLA0060','00042']);
 h.camera.stop();h.frames.push('B');h.tick();assert.equal(h.calls.length,3);assert.ok(h.stopped());
});
test('fechar durante permissão interrompe stream tardio sem ler',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>{resolve=r;}));const opening=h.camera.open();h.camera.stop();resolve(h.stream);await opening;assert.equal(h.stopped(),1);assert.equal(h.calls.length,0);assert.equal(h.video.srcObject,null);
});
test('troca de câmera chama getUserMedia e encerra stream anterior',async()=>{
 const h=harness();const requested=[];h.media.getUserMedia=async c=>{requested.push(c.video.deviceId.exact);return h.stream;};await h.camera.open('good');h.select.value='good';await h.select.events.change();assert.deepEqual(requested,['good','good']);assert.ok(h.stopped());
});
test('@spec:AC-093 permissão negada orienta sem emitir leitura',async()=>{
 const h=harness(async()=>{throw Object.assign(new Error(),{name:'NotAllowedError'});});await h.camera.open();assert.match(h.messages.at(-1),/Permissão negada/);assert.equal(h.calls.length,0);
});
