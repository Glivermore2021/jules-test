class Cartridge {
    constructor(romData) {
        this.prgRomSize = 0;
        this.chrRomSize = 0;
        this.mapper = 0;
        this.mirroring = 0;

        this.prgRom = null;
        this.chrRom = null;

        this.parseHeader(romData);
    }

    parseHeader(romData) {
        // Check for iNES header
        if (romData[0] !== 0x4E || romData[1] !== 0x45 || romData[2] !== 0x53 || romData[3] !== 0x1A) {
            throw new Error('Not a valid iNES file');
        }

        this.prgRomSize = romData[4];
        this.chrRomSize = romData[5];

        const flags6 = romData[6];
        const flags7 = romData[7];

        this.mirroring = (flags6 & 1) ? 1 : 0; // 0 = horizontal, 1 = vertical
        this.mapper = (flags6 >> 4) | (flags7 & 0xF0);

        const prgRomStart = 16;
        const prgRomEnd = prgRomStart + this.prgRomSize * 16384;
        this.prgRom = romData.slice(prgRomStart, prgRomEnd);

        if (this.chrRomSize > 0) {
            const chrRomStart = prgRomEnd;
            const chrRomEnd = chrRomStart + this.chrRomSize * 8192;
            this.chrRom = romData.slice(chrRomStart, chrRomEnd);
        }
    }
}
