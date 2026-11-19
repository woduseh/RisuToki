declare module 'adm-zip' {
  class AdmZip {
    constructor(pathOrData?: string | Buffer);
    getEntries(): AdmZip.IZipEntry[];
    getEntry(name: string): AdmZip.IZipEntry | null;
    addFile(entryName: string, content: Buffer, comment?: string, attr?: number): void;
    writeZip(targetFileName?: string): void;
    toBuffer(): Buffer;
  }

  namespace AdmZip {
    interface IZipEntry {
      entryName: string;
      isDirectory: boolean;
      header: { method: number; readonly size: number };
      getData(): Buffer;
    }
  }

  export = AdmZip;
}
