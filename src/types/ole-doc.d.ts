declare module 'ole-doc' {
    import { EventEmitter } from 'events';

    class Header {
        secSize: number;
        shortSecSize: number;
        SATSize: number;
        dirSecId: number;
        shortStreamMax: number;
        SSATSecId: number;
        SSATSize: number;
        MSATSecId: number;
        MSATSize: number;
        partialMSAT: number[];
        load(buffer: Buffer): boolean;
    }

    class AllocationTable {
        _doc: OleCompoundDoc;
        _table: number[];
        constructor(doc: OleCompoundDoc);
        load(secIds: number[], callback: (buffer: Buffer) => void): void;
        getSecIdChain(startSecId: number): number[];
    }

    class DirectoryTree {
        _doc: OleCompoundDoc;
        _entries: any[];
        root: any;
        constructor(doc: OleCompoundDoc);
        load(secIds: number[], callback: () => void): void;
    }

    class Storage {
        _doc: OleCompoundDoc;
        _dirEntry: any;
        constructor(doc: OleCompoundDoc, dirEntry: any);
        storage(storageName: string): Storage;
        stream(streamName: string): any; // Returns event-stream
    }

    class OleCompoundDoc extends EventEmitter {
        _filename: string;
        _fd?: number;
        _header?: Header;
        _MSAT?: number[];
        _SAT?: AllocationTable;
        _SSAT?: AllocationTable;
        _directoryTree?: DirectoryTree;
        _rootStorage?: Storage;
        _shortStreamSecIds?: number[];
        constructor(filename: string);
        read(): void;
        storage(storageName: string): Storage;
        stream(streamName: string): any;
        _readSectors(secIds: number[], callback: (buffer: Buffer) => void, errorCallback?: (err: Error) => void): void;
        _readShortSectors(secIds: number[], callback: (buffer: Buffer) => void, errorCallback?: (err: Error) => void): void;
    }

    export { OleCompoundDoc };
}