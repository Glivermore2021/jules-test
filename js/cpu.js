class CPU {
    constructor(ppu, controller) {
        this.ppu = ppu;
        this.controller = controller;

        // Registers
        this.pc = 0x0000; // Program Counter
        this.ac = 0x00;   // Accumulator
        this.x = 0x00;    // X Register
        this.y = 0x00;    // Y Register
        this.sp = 0xFD;   // Stack Pointer
        this.sr = 0x00;   // Status Register

        // Status Register Flags (as constants)
        this.CARRY_FLAG = 0b00000001;
        this.ZERO_FLAG = 0b00000010;
        this.INTERRUPT_DISABLE_FLAG = 0b00000100;
        this.DECIMAL_MODE_FLAG = 0b00001000;
        this.BREAK_COMMAND_FLAG = 0b00010000;
        this.UNUSED_FLAG = 0b00100000;
        this.OVERFLOW_FLAG = 0b01000000;
        this.NEGATIVE_FLAG = 0b10000000;

        // Memory (64KB)
        this.memory = new Uint8Array(64 * 1024);
    }

    // Helper methods for status register
    getFlag(flag) {
        return (this.sr & flag) > 0;
    }

    setFlag(flag, value) {
        if (value) {
            this.sr |= flag;
        } else {
            this.sr &= ~flag;
        }
    }

    // Memory access
    read(address) {
        if (address >= 0x2000 && address <= 0x3FFF) {
            return this.ppu.readRegister(0x2000 + (address & 0x07));
        } else if (address === 0x4016) {
            return this.controller.read();
        }
        return this.memory[address];
    }

    write(address, data) {
        if (address >= 0x2000 && address <= 0x3FFF) {
            this.ppu.writeRegister(0x2000 + (address & 0x07), data);
            return;
        } else if (address === 0x4016) {
            this.controller.write(data);
            return;
        }
        this.memory[address] = data;
    }

    reset() {
        // Get the address from the reset vector
        const lo = this.read(0xFFFC);
        const hi = this.read(0xFFFD);
        this.pc = (hi << 8) | lo;

        this.ac = 0;
        this.x = 0;
        this.y = 0;
        this.sp = 0xFD;
        this.sr = 0x00 | this.UNUSED_FLAG;
    }

    push(data) {
        this.write(0x0100 + this.sp, data);
        this.sp--;
    }

    nmi() {
        this.push((this.pc >> 8) & 0xFF);
        this.push(this.pc & 0xFF);
        this.push(this.sr);
        this.setFlag(this.INTERRUPT_DISABLE_FLAG, true);
        const lo = this.read(0xFFFA);
        const hi = this.read(0xFFFB);
        this.pc = (hi << 8) | lo;
    }

    step() {
        const opcode = this.read(this.pc);
        this.pc++;

        switch (opcode) {
            // LDA
            case 0xA9: // Immediate
                this.ac = this.read(this.pc);
                this.pc++;
                this.setFlag(this.ZERO_FLAG, this.ac === 0);
                this.setFlag(this.NEGATIVE_FLAG, (this.ac & 0x80) > 0);
                break;
            case 0xA5: // Zeropage
                {
                    const address = this.read(this.pc);
                    this.pc++;
                    this.ac = this.read(address);
                    this.setFlag(this.ZERO_FLAG, this.ac === 0);
                    this.setFlag(this.NEGATIVE_FLAG, (this.ac & 0x80) > 0);
                }
                break;
            case 0xB5: // Zeropage,X
                {
                    const address = (this.read(this.pc) + this.x) & 0xFF;
                    this.pc++;
                    this.ac = this.read(address);
                    this.setFlag(this.ZERO_FLAG, this.ac === 0);
                    this.setFlag(this.NEGATIVE_FLAG, (this.ac & 0x80) > 0);
                }
                break;

            // LDX
            case 0xA2: // Immediate
                this.x = this.read(this.pc);
                this.pc++;
                this.setFlag(this.ZERO_FLAG, this.x === 0);
                this.setFlag(this.NEGATIVE_FLAG, (this.x & 0x80) > 0);
                break;
            case 0xA6: // Zeropage
                {
                    const address = this.read(this.pc);
                    this.pc++;
                    this.x = this.read(address);
                    this.setFlag(this.ZERO_FLAG, this.x === 0);
                    this.setFlag(this.NEGATIVE_FLAG, (this.x & 0x80) > 0);
                }
                break;
            case 0xB6: // Zeropage,Y
                {
                    const address = (this.read(this.pc) + this.y) & 0xFF;
                    this.pc++;
                    this.x = this.read(address);
                    this.setFlag(this.ZERO_FLAG, this.x === 0);
                    this.setFlag(this.NEGATIVE_FLAG, (this.x & 0x80) > 0);
                }
                break;

            // LDY
            case 0xA0: // Immediate
                this.y = this.read(this.pc);
                this.pc++;
                this.setFlag(this.ZERO_FLAG, this.y === 0);
                this.setFlag(this.NEGATIVE_FLAG, (this.y & 0x80) > 0);
                break;
            case 0xA4: // Zeropage
                {
                    const address = this.read(this.pc);
                    this.pc++;
                    this.y = this.read(address);
                    this.setFlag(this.ZERO_FLAG, this.y === 0);
                    this.setFlag(this.NEGATIVE_FLAG, (this.y & 0x80) > 0);
                }
                break;
            case 0xB4: // Zeropage,X
                {
                    const address = (this.read(this.pc) + this.x) & 0xFF;
                    this.pc++;
                    this.y = this.read(address);
                    this.setFlag(this.ZERO_FLAG, this.y === 0);
                    this.setFlag(this.NEGATIVE_FLAG, (this.y & 0x80) > 0);
                }
                break;

            // STA
            case 0x85: // Zeropage
                {
                    const address = this.read(this.pc);
                    this.pc++;
                    this.write(address, this.ac);
                }
                break;
            case 0x95: // Zeropage,X
                {
                    const address = (this.read(this.pc) + this.x) & 0xFF;
                    this.pc++;
                    this.write(address, this.ac);
                }
                break;

            // STX
            case 0x86: // Zeropage
                {
                    const address = this.read(this.pc);
                    this.pc++;
                    this.write(address, this.x);
                }
                break;
            case 0x96: // Zeropage,Y
                {
                    const address = (this.read(this.pc) + this.y) & 0xFF;
                    this.pc++;
                    this.write(address, this.x);
                }
                break;

            // STY
            case 0x84: // Zeropage
                {
                    const address = this.read(this.pc);
                    this.pc++;
                    this.write(address, this.y);
                }
                break;
            case 0x94: // Zeropage,X
                {
                    const address = (this.read(this.pc) + this.x) & 0xFF;
                    this.pc++;
                    this.write(address, this.y);
                }
                break;

            // Transfer instructions
            case 0xAA: // TAX
                this.x = this.ac;
                this.setFlag(this.ZERO_FLAG, this.x === 0);
                this.setFlag(this.NEGATIVE_FLAG, (this.x & 0x80) > 0);
                break;
            case 0xA8: // TAY
                this.y = this.ac;
                this.setFlag(this.ZERO_FLAG, this.y === 0);
                this.setFlag(this.NEGATIVE_FLAG, (this.y & 0x80) > 0);
                break;
            case 0x8A: // TXA
                this.ac = this.x;
                this.setFlag(this.ZERO_FLAG, this.ac === 0);
                this.setFlag(this.NEGATIVE_FLAG, (this.ac & 0x80) > 0);
                break;
            case 0x98: // TYA
                this.ac = this.y;
                this.setFlag(this.ZERO_FLAG, this.ac === 0);
                this.setFlag(this.NEGATIVE_FLAG, (this.ac & 0x80) > 0);
                break;

            // Increment/Decrement
            case 0xE8: // INX
                this.x = (this.x + 1) & 0xFF;
                this.setFlag(this.ZERO_FLAG, this.x === 0);
                this.setFlag(this.NEGATIVE_FLAG, (this.x & 0x80) > 0);
                break;
            case 0xC8: // INY
                this.y = (this.y + 1) & 0xFF;
                this.setFlag(this.ZERO_FLAG, this.y === 0);
                this.setFlag(this.NEGATIVE_FLAG, (this.y & 0x80) > 0);
                break;
            case 0xCA: // DEX
                this.x = (this.x - 1) & 0xFF;
                this.setFlag(this.ZERO_FLAG, this.x === 0);
                this.setFlag(this.NEGATIVE_FLAG, (this.x & 0x80) > 0);
                break;
            case 0x88: // DEY
                this.y = (this.y - 1) & 0xFF;
                this.setFlag(this.ZERO_FLAG, this.y === 0);
                this.setFlag(this.NEGATIVE_FLAG, (this.y & 0x80) > 0);
                break;

            default:
                console.error(`Unknown opcode: ${opcode.toString(16)}`);
                break;
        }
    }
}
