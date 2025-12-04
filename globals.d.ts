
// globals.d.ts
declare global {
  interface Window {
    pdfjsLib: any;
    mammoth: any;
  }
  const docx: any;
  const saveAs: (blob: Blob, filename: string) => void;
}

export {};
