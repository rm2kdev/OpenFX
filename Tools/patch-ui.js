'use strict';
const kind=document.getElementById('kind'),applyButton=document.getElementById('apply');
function selectedRelease(){return OPENFX_MANIFEST.files.find(f=>f.id===kind.value);}
function updateHint(){const r=selectedRelease();document.getElementById('hint').textContent='Original: '+r.sourceName+' · Patch: '+r.patchName;document.getElementById('original').accept=kind.value==='firmware'?'.syx':'.exe';showStatus('Ready. Originals are checked before patching.');}
kind.addEventListener('change',()=>{document.getElementById('original').value='';document.getElementById('patch').value='';updateHint();});updateHint();
applyButton.addEventListener('click',async()=>{
  applyButton.disabled=true;kind.disabled=true;
  try{
    const r=selectedRelease(),original=document.getElementById('original').files[0],patchFile=document.getElementById('patch').files[0];
    if(!original||!patchFile)throw Error('Choose your original file and the matching BPS patch.');
    if(original.size!==r.sourceBytes)throw Error('Original file does not match. Use the unmodified '+r.sourceName+' for '+(r.id==='firmware'?'Axe-Fx II XL Ares 2.00.':'Axe-Edit II Windows 3.15.0. Choose the installed program, not its installer.'));
    if(patchFile.size!==r.patchBytes)throw Error('Wrong patch file. Choose '+r.patchName+' from this release.');
    showStatus('Verifying original and patch…');
    const [sourceBytes,patchBytes]=await Promise.all([original.arrayBuffer(),patchFile.arrayBuffer()]);
    if(await sha256(sourceBytes)!==r.sourceSha256)throw Error('Original SHA-256 does not match this release. Obtain a fresh, unmodified original of the required version.');
    if(await sha256(patchBytes)!==r.patchSha256)throw Error('Patch SHA-256 does not match. Extract a fresh copy of this release.');
    showStatus('Applying the verified patch…');
    await new Promise(resolve=>setTimeout(resolve,30));
    const patch=BPS.fromFile(new BinFile(patchBytes));
    const output=patch.apply(new BinFile(sourceBytes),true)._u8array;
    if(output.length!==r.outputBytes||await sha256(output)!==r.outputSha256)throw Error('Output verification failed. Nothing has been saved.');
    downloadFile(output,r.outputName);
    showStatus('Verified and saved: '+r.outputName+'\nCheck your Downloads folder.\nSHA-256: '+r.outputSha256+'\n'+(r.id==='firmware'?'Next: send this firmware file with Fractal-Bot.':'Next: place this executable in your copy of the installed Axe-Edit folder.'));
  }catch(e){showStatus(e.message,true);}finally{applyButton.disabled=false;kind.disabled=false;}
});
