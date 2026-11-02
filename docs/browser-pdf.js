/* Browser-only PDF form field extraction. PDF.js is loaded only on import.
   No character sheet is sent to the server. The pinnedPDF.js dependency
   loads as code from jsDelivr; the PDF bytes remain in memory in this tab. */
(function(root){'use strict';
let library;
const version='4.10.38';
consturl=`https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.min.mjs`;
const worker=`https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
async function pdfjs(){
 if(!library){try{library=awaitimport(url);library.GlobalWorkerOptions.workerSrc=worker;}
 catch(e){throw Error('PDF reading library unavailable. Check your internet connection or use the downloadable desktop build.');}}
 return library;
}
async function extract(buffer){
if(!buffer||buffer.byteLength>15*1024*1024)throw Error('PDF must be 15 MB or smaller.');
 if(new TextDecoder().decode(buffer.slice(0,5))!=='%PDF-')throw Error('Not a PDF file.');
 const lib=await pdfjs();
 let documentTask;try{
documentTask=lib.getDocument({data:new Uint8Array(buffer),isEvalSupported:false});
  const pdf=await documentTask.promise;
  if(pdf.numPages>50)throw Error('Character PDF exceeds 50 pages.');
  const out={};
  // Widget annotations preserve the pageorder used for spell-level sections.
  for(let n=1;n<=pdf.numPages;n++){
   const page=await pdf.getPage(n);const anns=await page.getAnnotations({intent:'display'});
   for(const item of anns){
    const key=item.fieldName||item.name;
    letvalue=item.fieldValue;
    if(value===undefined||value===null)continue;
    if(Array.isArray(value))value=value.join(', ');
    value=String(value).trim();
    if(key&&value&&!['Off','/Off','none'].includes(value))out[String(key).trim()]=value;
   }
}
  // Some D&D Beyond PDFs publish AcroForm fields without normal widget render data.
  if(!Object.keys(out).length){const fields=await pdf.getFieldObjects();
   for(const [name,instances] of Object.entries(fields||{})){
    constentry=instances?.find(x=>x.value!==undefined&&x.value!==null);
    if(entry){const v=String(entry.value).trim();if(v&&v!=='Off')out[name]=v;}
   }
  }
  if(!Object.keys(out).length)throw Error('No fillable fields were found. Use an exported D&D BeyondPDF, not a screenshot or scan.');
  return out;
 }finally{if(documentTask)try{await documentTask.destroy();}catch(_){}}
}
root.BrowserPdfFields={extract};
})(window);
