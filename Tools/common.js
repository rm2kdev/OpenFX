'use strict';
async function sha256(bytes) {
  if (!globalThis.crypto?.subtle) throw Error('Open this file in a current desktop version of Chrome, Edge or Firefox. Secure file hashing is unavailable in this browser.');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('');
}
function downloadFile(bytes, name) {
  const url=URL.createObjectURL(new Blob([bytes], {type:'application/octet-stream'}));
  const link=document.createElement('a'); link.href=url; link.download=name;
  document.body.append(link); link.click(); link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function showStatus(message, error=false) {
  const node=document.getElementById('status'); node.textContent=message;
  node.classList.toggle('error',error);
}
