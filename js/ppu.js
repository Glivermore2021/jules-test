const PALETTE = [
    [84, 84, 84], [0, 30, 116], [8, 16, 144], [48, 0, 136], [68, 0, 100], [92, 0, 48], [84, 4, 0], [60, 24, 0], [32, 42, 0], [8, 58, 0], [0, 64, 0], [0, 60, 0], [0, 50, 60], [0, 0, 0], [0, 0, 0], [0, 0, 0],
    [152, 150, 152], [8, 76, 196], [48, 50, 236], [92, 30, 228], [136, 20, 176], [160, 20, 100], [152, 34, 32], [120, 60, 0], [84, 90, 0], [40, 114, 0], [8, 124, 0], [0, 118, 40], [0, 102, 120], [0, 0, 0], [0, 0, 0], [0, 0, 0],
    [236, 238, 236], [76, 154, 236], [120, 124, 236], [176, 98, 236], [228, 84, 236], [236, 88, 180], [236, 106, 100], [212, 136, 32], [160, 170, 0], [116, 196, 0], [76, 208, 32], [56, 204, 108], [56, 180, 204], [60, 60, 60], [0, 0, 0], [0, 0, 0],
    [236, 238, 236], [168, 204, 236], [188, 188, 236], [212, 178, 236], [236, 174, 236], [236, 174, 212], [236, 180, 176], [228, 196, 144], [204, 210, 120], [180, 222, 120], [168, 226, 144], [152, 226, 180], [160, 214, 228], [160, 162, 160], [0, 0, 0], [0, 0, 0],
];

class PPU {
    constructor(cpu) {
        this.cpu = cpu;

        // PPU Registers
        this.ppuctrl = 0x00;   // $2000
        this.ppumask = 0x00;   // $2001
        this.ppustatus = 0x00; // $2002
        this.oamaddr = 0x00;   // $2003
        this.oamdata = 0x00;   // $2004
        this.ppuscroll = 0x00; // $2005
        this.ppuaddr = 0x00;   // $2006
        this.ppudata = 0x00;   // $2007
        this.oamdma = 0x00;    // $4014

        // PPU Memory (16KB)
        this.vram = new Uint8Array(16 * 1024);
        // OAM Memory (256 bytes)
        this.oam = new Uint8Array(256);

        // Internal PPU state
        this.scanline = 0;
        this.cycle = 0;

        // Frame buffer
        this.frameBuffer = new Uint8Array(256 * 240 * 4); // RGBA
    }

    // PPU memory access
    read(address) {
        return this.vram[address];
    }

    write(address, data) {
        this.vram[address] = data;
    }

    // Internal state for PPUADDR and PPUSCROLL
    vramAddress = 0x0000;
    vramAddressLatch = 0;

    // CPU-mapped PPU register access
    readRegister(address) {
        switch (address) {
            case 0x2002: // PPUSTATUS
                {
                    const status = this.ppustatus;
                    // Clear VBlank flag after reading
                    this.ppustatus &= ~0x80;
                    // Reset address latch
                    this.vramAddressLatch = 0;
                    return status;
                }
            case 0x2007: // PPUDATA
                {
                    let data = this.read(this.vramAddress);
                    // Increment VRAM address
                    this.vramAddress += (this.ppuctrl & 0x04) ? 32 : 1;
                    return data;
                }
        }
        return 0;
    }

    writeRegister(address, data) {
        switch (address) {
            case 0x2000: // PPUCTRL
                this.ppuctrl = data;
                break;
            case 0x2001: // PPUMASK
                this.ppumask = data;
                break;
            case 0x2006: // PPUADDR
                if (this.vramAddressLatch === 0) {
                    this.vramAddress = (this.vramAddress & 0x00FF) | (data << 8);
                    this.vramAddressLatch = 1;
                } else {
                    this.vramAddress = (this.vramAddress & 0xFF00) | data;
                    this.vramAddressLatch = 0;
                }
                break;
            case 0x2007: // PPUDATA
                this.write(this.vramAddress, data);
                // Increment VRAM address
                this.vramAddress += (this.ppuctrl & 0x04) ? 32 : 1;
                break;
        }
    }

    step() {
        console.log(`Scanline: ${this.scanline}, Cycle: ${this.cycle}`);
        this.cycle++;
        if (this.cycle > 340) {
            this.cycle = 0;
            this.scanline++;
            if (this.scanline > 261) {
                this.scanline = -1;
                this.renderFrame();
            }
        }

        // VBlank NMI
        if (this.scanline === 241 && this.cycle === 1) {
            this.ppustatus |= 0x80; // Set VBlank flag
            if (this.ppuctrl & 0x80) {
                this.cpu.nmi();
            }
        }

        // Clear VBlank flag at the end of VBlank
        if (this.scanline === -1 && this.cycle === 1) {
            this.ppustatus &= ~0x80;
        }
    }

    renderFrame() {
        console.log("Rendering frame");
        const baseNametableAddress = 0x2000; // For now, always use the first nametable

        for (let y = 0; y < 240; y++) {
            for (let x = 0; x < 256; x++) {
                const tileX = Math.floor(x / 8);
                const tileY = Math.floor(y / 8);
                const tileIndex = tileY * 32 + tileX;
                const tileId = this.read(baseNametableAddress + tileIndex);

                const attributeTableAddress = baseNametableAddress + 0x3C0;
                const attributeTileX = Math.floor(tileX / 4);
                const attributeTileY = Math.floor(tileY / 4);
                const attributeIndex = attributeTileY * 8 + attributeTileX;
                const attributeByte = this.read(attributeTableAddress + attributeIndex);

                const quadrant = (Math.floor(tileY / 2) % 2) * 2 + (Math.floor(tileX / 2) % 2);
                const paletteNumber = (attributeByte >> (quadrant * 2)) & 0x03;

                const patternTableAddress = (this.ppuctrl & 0x10) ? 0x1000 : 0x0000;
                const tileAddress = patternTableAddress + tileId * 16;

                const fineX = x % 8;
                const fineY = y % 8;

                const lowByte = this.read(tileAddress + fineY);
                const highByte = this.read(tileAddress + fineY + 8);

                const bit0 = (lowByte >> (7 - fineX)) & 1;
                const bit1 = (highByte >> (7 - fineX)) & 1;
                const colorIndex = (bit1 << 1) | bit0;

                const paletteRamIndex = this.read(0x3F00 + paletteNumber * 4 + colorIndex);
                const color = PALETTE[paletteRamIndex];

                const bufferIndex = (y * 256 + x) * 4;
                this.frameBuffer[bufferIndex] = color[0];
                this.frameBuffer[bufferIndex + 1] = color[1];
                this.frameBuffer[bufferIndex + 2] = color[2];
                this.frameBuffer[bufferIndex + 3] = 255;
            }
        }
    }
}
