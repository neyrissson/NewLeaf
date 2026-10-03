export async function extractTextFromPdfFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    // @ts-ignore - Check if PDF.js is loaded
    if (!window.pdfjsLib) {
      return reject(new Error("PDF.js library failed to load from CDN. Check internet connection."));
    }

    reader.onload = async function() {
      try {
        const typedarray = new Uint8Array(this.result as ArrayBuffer);
        // @ts-ignore
        const pdf = await window.pdfjsLib.getDocument(typedarray).promise;
        let fullText = '';
        
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n\n';
        }
        resolve(fullText.trim());
      } catch (err) {
        console.error("PDF Parsing Error", err);
        reject(err);
      }
    };
    
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}
