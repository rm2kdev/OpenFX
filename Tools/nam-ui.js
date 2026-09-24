'use strict';
let chosenFile=null;
const captureInput=document.getElementById('capture'),drop=document.getElementById('drop'),convertButton=document.getElementById('convert');
function chooseCapture(file){chosenFile=file||null;document.getElementById('selected').textContent=file?file.name+' · '+Math.ceil(file.size/1024)+' KB':'No file selected.';showStatus('Ready. Your capture stays on this computer.');}
captureInput.addEventListener('change',()=>chooseCapture(captureInput.files[0]));
drop.addEventListener('dragover',e=>{e.preventDefault();drop.classList.add('over');});
drop.addEventListener('dragleave',()=>drop.classList.remove('over'));
drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('over');if(e.dataTransfer.files.length!==1){showStatus('Please choose one NAM file at a time.',true);return;}captureInput.value='';chooseCapture(e.dataTransfer.files[0]);});
convertButton.addEventListener('click',async()=>{
  convertButton.disabled=true;
  try{
    if(!chosenFile)throw Error('Choose a .nam capture first.');
    if(!/\.nam$/i.test(chosenFile.name))throw Error('Choose a .nam capture, not a firmware or SysEx file.');
    if(chosenFile.size>32*1024*1024)throw Error('This file is too large (maximum 32 MB).');
    showStatus('Checking the capture and creating SysEx…');
    const result=await NamConverter.convert(new Uint8Array(await chosenFile.arrayBuffer()),chosenFile.name);
    downloadFile(result.sysex,result.fileName);
    showStatus('Converted: '+result.name+'\nA2 Lite · 48 kHz · '+result.sysex.length.toLocaleString()+' bytes\nSaved as '+result.fileName+' (check your Downloads folder).\nChoose the destination only in Fractal-Bot: 513 = NAM 001, 514 = NAM 002, … 1024 = NAM 512.');
  }catch(e){showStatus(e.message,true);}finally{convertButton.disabled=false;}
});
