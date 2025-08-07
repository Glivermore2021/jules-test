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

    pull() {
        this.sp++;
        return this.read(0x0100 + this.sp);
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

    adc(value) {
        const carry = this.getFlag(this.CARRY_FLAG) ? 1 : 0;
        const result = this.ac + value + carry;
        this.setFlag(this.CARRY_FLAG, result > 0xFF);
        this.setFlag(this.OVERFLOW_FLAG, (~(this.ac ^ value) & (this.ac ^ result) & 0x80) > 0);
        this.ac = result & 0xFF;
        this.setAFlags();
    }

    sbc(value) {
        this.adc(value ^ 0xFF);
    }

    asl(value) {
        this.setFlag(this.CARRY_FLAG, (value & 0x80) > 0);
        return (value << 1) & 0xFF;
    }

    lsr(value) {
        this.setFlag(this.CARRY_FLAG, (value & 0x01) > 0);
        return value >> 1;
    }

    rol(value) {
        const carry = this.getFlag(this.CARRY_FLAG) ? 1 : 0;
        this.setFlag(this.CARRY_FLAG, (value & 0x80) > 0);
        return ((value << 1) | carry) & 0xFF;
    }

    ror(value) {
        const carry = this.getFlag(this.CARRY_FLAG) ? 1 : 0;
        this.setFlag(this.CARRY_FLAG, (value & 0x01) > 0);
        return (value >> 1) | (carry << 7);
    }

    bit(value) {
        this.setFlag(this.ZERO_FLAG, (this.ac & value) === 0);
        this.setFlag(this.OVERFLOW_FLAG, (value & 0x40) > 0);
        this.setFlag(this.NEGATIVE_FLAG, (value & 0x80) > 0);
    }

    setAFlags() {
        this.setFlag(this.ZERO_FLAG, this.ac === 0);
        this.setFlag(this.NEGATIVE_FLAG, (this.ac & 0x80) > 0);
    }

    // Addressing modes
    getAbsoluteAddress() {
        const lo = this.read(this.pc);
        this.pc++;
        const hi = this.read(this.pc);
        this.pc++;
        return (hi << 8) | lo;
    }

    getAbsoluteXAddress() {
        const lo = this.read(this.pc);
        this.pc++;
        const hi = this.read(this.pc);
        this.pc++;
        return ((hi << 8) | lo) + this.x;
    }

    getAbsoluteYAddress() {
        const lo = this.read(this.pc);
        this.pc++;
        const hi = this.read(this.pc);
        this.pc++;
        return ((hi << 8) | lo) + this.y;
    }

    getIndirectXAddress() {
        const address = (this.read(this.pc) + this.x) & 0xFF;
        this.pc++;
        const lo = this.read(address);
        const hi = this.read((address + 1) & 0xFF);
        return (hi << 8) | lo;
    }

    getIndirectYAddress() {
        const address = this.read(this.pc);
        this.pc++;
        const lo = this.read(address);
        const hi = this.read((address + 1) & 0xFF);
        return ((hi << 8) | lo) + this.y;
    }

    getZeropageAddress() {
        const address = this.read(this.pc);
        this.pc++;
        return address;
    }

    getZeropageXAddress() {
        const address = (this.read(this.pc) + this.x) & 0xFF;
        this.pc++;
        return address;
    }

    getZeropageYAddress() {
        const address = (this.read(this.pc) + this.y) & 0xFF;
        this.pc++;
        return address;
    }


    branch(condition) {
        if (condition) {
            let offset = this.read(this.pc);
            if (offset & 0x80) {
                offset -= 0x100;
            }
            this.pc += offset;
        }
        this.pc++;
    }

    step() {
        const opcode = this.read(this.pc);
        console.log(`PC: ${this.pc.toString(16)}, Opcode: ${opcode.toString(16)}`);
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

            // ROL A
            case 0x2A:
                {
                    const carry = this.getFlag(this.CARRY_FLAG);
                    this.setFlag(this.CARRY_FLAG, (this.ac & 0x80) > 0);
                    this.ac = ((this.ac << 1) | (carry ? 1 : 0)) & 0xFF;
                    this.setFlag(this.ZERO_FLAG, this.ac === 0);
                    this.setFlag(this.NEGATIVE_FLAG, (this.ac & 0x80) > 0);
                }
                break;

            // RTI
            case 0x40:
                this.sr = this.pull();
                const lo = this.pull();
                const hi = this.pull();
                this.pc = (hi << 8) | lo;
                break;

            // NOP
            case 0x3A:
                // This is a NOP on NMOS 6502
                break;

            // Branch instructions
            case 0x10: // BPL
                this.branch(!this.getFlag(this.NEGATIVE_FLAG));
                break;
            case 0x30: // BMI
                this.branch(this.getFlag(this.NEGATIVE_FLAG));
                break;
            case 0x50: // BVC
                this.branch(!this.getFlag(this.OVERFLOW_FLAG));
                break;
            case 0x70: // BVS
                this.branch(this.getFlag(this.OVERFLOW_FLAG));
                break;
            case 0x90: // BCC
                this.branch(!this.getFlag(this.CARRY_FLAG));
                break;
            case 0xB0: // BCS
                this.branch(this.getFlag(this.CARRY_FLAG));
                break;
            case 0xD0: // BNE
                this.branch(!this.getFlag(this.ZERO_FLAG));
                break;
            case 0xF0: // BEQ
                this.branch(this.getFlag(this.ZERO_FLAG));
                break;

            // AND
            case 0x29: this.ac &= this.read(this.pc++); this.setAFlags(); break;
            case 0x25: this.ac &= this.read(this.getZeropageAddress()); this.setAFlags(); break;
            case 0x35: this.ac &= this.read(this.getZeropageXAddress()); this.setAFlags(); break;
            case 0x2D: this.ac &= this.read(this.getAbsoluteAddress()); this.setAFlags(); break;
            case 0x3D: this.ac &= this.read(this.getAbsoluteXAddress()); this.setAFlags(); break;
            case 0x39: this.ac &= this.read(this.getAbsoluteYAddress()); this.setAFlags(); break;
            case 0x21: this.ac &= this.read(this.getIndirectXAddress()); this.setAFlags(); break;
            case 0x31: this.ac &= this.read(this.getIndirectYAddress()); this.setAFlags(); break;

            // EOR
            case 0x49: this.ac ^= this.read(this.pc++); this.setAFlags(); break;
            case 0x45: this.ac ^= this.read(this.getZeropageAddress()); this.setAFlags(); break;
            case 0x55: this.ac ^= this.read(this.getZeropageXAddress()); this.setAFlags(); break;
            case 0x4D: this.ac ^= this.read(this.getAbsoluteAddress()); this.setAFlags(); break;
            case 0x5D: this.ac ^= this.read(this.getAbsoluteXAddress()); this.setAFlags(); break;
            case 0x59: this.ac ^= this.read(this.getAbsoluteYAddress()); this.setAFlags(); break;
            case 0x41: this.ac ^= this.read(this.getIndirectXAddress()); this.setAFlags(); break;
            case 0x51: this.ac ^= this.read(this.getIndirectYAddress()); this.setAFlags(); break;

            // ORA
            case 0x09: this.ac |= this.read(this.pc++); this.setAFlags(); break;
            case 0x05: this.ac |= this.read(this.getZeropageAddress()); this.setAFlags(); break;
            case 0x15: this.ac |= this.read(this.getZeropageXAddress()); this.setAFlags(); break;
            case 0x0D: this.ac |= this.read(this.getAbsoluteAddress()); this.setAFlags(); break;
            case 0x1D: this.ac |= this.read(this.getAbsoluteXAddress()); this.setAFlags(); break;
            case 0x19: this.ac |= this.read(this.getAbsoluteYAddress()); this.setAFlags(); break;
            case 0x01: this.ac |= this.read(this.getIndirectXAddress()); this.setAFlags(); break;
            case 0x11: this.ac |= this.read(this.getIndirectYAddress()); this.setAFlags(); break;

            // ADC
            case 0x69: this.adc(this.read(this.pc++)); break;
            case 0x65: this.adc(this.read(this.getZeropageAddress())); break;
            case 0x75: this.adc(this.read(this.getZeropageXAddress())); break;
            case 0x6D: this.adc(this.read(this.getAbsoluteAddress())); break;
            case 0x7D: this.adc(this.read(this.getAbsoluteXAddress())); break;
            case 0x79: this.adc(this.read(this.getAbsoluteYAddress())); break;
            case 0x61: this.adc(this.read(this.getIndirectXAddress())); break;
            case 0x71: this.adc(this.read(this.getIndirectYAddress())); break;

            // SBC
            case 0xE9: this.sbc(this.read(this.pc++)); break;
            case 0xE5: this.sbc(this.read(this.getZeropageAddress())); break;
            case 0xF5: this.sbc(this.read(this.getZeropageXAddress())); break;
            case 0xED: this.sbc(this.read(this.getAbsoluteAddress())); break;
            case 0xFD: this.sbc(this.read(this.getAbsoluteXAddress())); break;
            case 0xF9: this.sbc(this.read(this.getAbsoluteYAddress())); break;
            case 0xE1: this.sbc(this.read(this.getIndirectXAddress())); break;
            case 0xF1: this.sbc(this.read(this.getIndirectYAddress())); break;

            // ASL
            case 0x0A: this.ac = this.asl(this.ac); this.setAFlags(); break;
            case 0x06: { const addr = this.getZeropageAddress(); this.write(addr, this.asl(this.read(addr))); } break;
            case 0x16: { const addr = this.getZeropageXAddress(); this.write(addr, this.asl(this.read(addr))); } break;
            case 0x0E: { const addr = this.getAbsoluteAddress(); this.write(addr, this.asl(this.read(addr))); } break;
            case 0x1E: { const addr = this.getAbsoluteXAddress(); this.write(addr, this.asl(this.read(addr))); } break;

            // LSR
            case 0x4A: this.ac = this.lsr(this.ac); this.setAFlags(); break;
            case 0x46: { const addr = this.getZeropageAddress(); this.write(addr, this.lsr(this.read(addr))); } break;
            case 0x56: { const addr = this.getZeropageXAddress(); this.write(addr, this.lsr(this.read(addr))); } break;
            case 0x4E: { const addr = this.getAbsoluteAddress(); this.write(addr, this.lsr(this.read(addr))); } break;
            case 0x5E: { const addr = this.getAbsoluteXAddress(); this.write(addr, this.lsr(this.read(addr))); } break;

            // ROL
            case 0x26: { const addr = this.getZeropageAddress(); this.write(addr, this.rol(this.read(addr))); } break;
            case 0x36: { const addr = this.getZeropageXAddress(); this.write(addr, this.rol(this.read(addr))); } break;
            case 0x2E: { const addr = this.getAbsoluteAddress(); this.write(addr, this.rol(this.read(addr))); } break;
            case 0x3E: { const addr = this.getAbsoluteXAddress(); this.write(addr, this.rol(this.read(addr))); } break;

            // ROR
            case 0x6A: this.ac = this.ror(this.ac); this.setAFlags(); break;
            case 0x66: { const addr = this.getZeropageAddress(); this.write(addr, this.ror(this.read(addr))); } break;
            case 0x76: { const addr = this.getZeropageXAddress(); this.write(addr, this.ror(this.read(addr))); } break;
            case 0x6E: { const addr = this.getAbsoluteAddress(); this.write(addr, this.ror(this.read(addr))); } break;
            case 0x7E: { const addr = this.getAbsoluteXAddress(); this.write(addr, this.ror(this.read(addr))); } break;

            // BIT
            case 0x24: this.bit(this.read(this.getZeropageAddress())); break;
            case 0x2C: this.bit(this.read(this.getAbsoluteAddress())); break;

            // Stack
            case 0x48: this.push(this.ac); break;
            case 0x08: this.push(this.sr); break;
            case 0x68: this.ac = this.pull(); this.setAFlags(); break;
            case 0x28: this.sr = this.pull(); break;

            // Jump
            case 0x4C: this.pc = this.getAbsoluteAddress(); break;
            case 0x6C: {
                const lo = this.read(this.pc);
                this.pc++;
                const hi = this.read(this.pc);
                this.pc++;
                const address = (hi << 8) | lo;
                this.pc = this.read(address) | (this.read(address + 1) << 8);
            }
            break;
            case 0x20: {
                const target = this.getAbsoluteAddress();
                this.push((this.pc - 1 >> 8) & 0xFF);
                this.push((this.pc - 1) & 0xFF);
                this.pc = target;
            }
            break;
            case 0x60: {
                const lo = this.pull();
                const hi = this.pull();
                this.pc = ((hi << 8) | lo) + 1;
            }
            break;

            // Flags
            case 0x18: this.setFlag(this.CARRY_FLAG, false); break;
            case 0xD8: this.setFlag(this.DECIMAL_MODE_FLAG, false); break;
            case 0x58: this.setFlag(this.INTERRUPT_DISABLE_FLAG, false); break;
            case 0xB8: this.setFlag(this.OVERFLOW_FLAG, false); break;
            case 0x38: this.setFlag(this.CARRY_FLAG, true); break;
            case 0xF8: this.setFlag(this.DECIMAL_MODE_FLAG, true); break;
            case 0x78: this.setFlag(this.INTERRUPT_DISABLE_FLAG, true); break;

            // Illegal Opcodes
            case 0x03: { const addr = this.getIndirectXAddress(); this.write(addr, this.asl(this.read(addr))); this.ac |= this.read(addr); this.setAFlags(); } break;
            case 0x07: { const addr = this.getZeropageAddress(); this.write(addr, this.asl(this.read(addr))); this.ac |= this.read(addr); this.setAFlags(); } break;
            case 0x0F: { const addr = this.getAbsoluteAddress(); this.write(addr, this.asl(this.read(addr))); this.ac |= this.read(addr); this.setAFlags(); } break;
            case 0x13: { const addr = this.getIndirectYAddress(); this.write(addr, this.asl(this.read(addr))); this.ac |= this.read(addr); this.setAFlags(); } break;
            case 0x17: { const addr = this.getZeropageXAddress(); this.write(addr, this.asl(this.read(addr))); this.ac |= this.read(addr); this.setAFlags(); } break;
            case 0x1B: { const addr = this.getAbsoluteYAddress(); this.write(addr, this.asl(this.read(addr))); this.ac |= this.read(addr); this.setAFlags(); } break;
            case 0x1F: { const addr = this.getAbsoluteXAddress(); this.write(addr, this.asl(this.read(addr))); this.ac |= this.read(addr); this.setAFlags(); } break;

            case 0x23: { const addr = this.getIndirectXAddress(); this.write(addr, this.rol(this.read(addr))); this.ac &= this.read(addr); this.setAFlags(); } break;
            case 0x27: { const addr = this.getZeropageAddress(); this.write(addr, this.rol(this.read(addr))); this.ac &= this.read(addr); this.setAFlags(); } break;
            case 0x2F: { const addr = this.getAbsoluteAddress(); this.write(addr, this.rol(this.read(addr))); this.ac &= this.read(addr); this.setAFlags(); } break;
            case 0x33: { const addr = this.getIndirectYAddress(); this.write(addr, this.rol(this.read(addr))); this.ac &= this.read(addr); this.setAFlags(); } break;
            case 0x37: { const addr = this.getZeropageXAddress(); this.write(addr, this.rol(this.read(addr))); this.ac &= this.read(addr); this.setAFlags(); } break;
            case 0x3B: { const addr = this.getAbsoluteYAddress(); this.write(addr, this.rol(this.read(addr))); this.ac &= this.read(addr); this.setAFlags(); } break;
            case 0x3F: { const addr = this.getAbsoluteXAddress(); this.write(addr, this.rol(this.read(addr))); this.ac &= this.read(addr); this.setAFlags(); } break;

            case 0x43: { const addr = this.getIndirectXAddress(); this.write(addr, this.lsr(this.read(addr))); this.ac ^= this.read(addr); this.setAFlags(); } break;
            case 0x47: { const addr = this.getZeropageAddress(); this.write(addr, this.lsr(this.read(addr))); this.ac ^= this.read(addr); this.setAFlags(); } break;
            case 0x4F: { const addr = this.getAbsoluteAddress(); this.write(addr, this.lsr(this.read(addr))); this.ac ^= this.read(addr); this.setAFlags(); } break;
            case 0x53: { const addr = this.getIndirectYAddress(); this.write(addr, this.lsr(this.read(addr))); this.ac ^= this.read(addr); this.setAFlags(); } break;
            case 0x57: { const addr = this.getZeropageXAddress(); this.write(addr, this.lsr(this.read(addr))); this.ac ^= this.read(addr); this.setAFlags(); } break;
            case 0x5B: { const addr = this.getAbsoluteYAddress(); this.write(addr, this.lsr(this.read(addr))); this.ac ^= this.read(addr); this.setAFlags(); } break;
            case 0x5F: { const addr = this.getAbsoluteXAddress(); this.write(addr, this.lsr(this.read(addr))); this.ac ^= this.read(addr); this.setAFlags(); } break;

            case 0x63: { const addr = this.getIndirectXAddress(); this.write(addr, this.ror(this.read(addr))); this.adc(this.read(addr)); } break;
            case 0x67: { const addr = this.getZeropageAddress(); this.write(addr, this.ror(this.read(addr))); this.adc(this.read(addr)); } break;
            case 0x6F: { const addr = this.getAbsoluteAddress(); this.write(addr, this.ror(this.read(addr))); this.adc(this.read(addr)); } break;
            case 0x73: { const addr = this.getIndirectYAddress(); this.write(addr, this.ror(this.read(addr))); this.adc(this.read(addr)); } break;
            case 0x77: { const addr = this.getZeropageXAddress(); this.write(addr, this.ror(this.read(addr))); this.adc(this.read(addr)); } break;
            case 0x7B: { const addr = this.getAbsoluteYAddress(); this.write(addr, this.ror(this.read(addr))); this.adc(this.read(addr)); } break;
            case 0x7F: { const addr = this.getAbsoluteXAddress(); this.write(addr, this.ror(this.read(addr))); this.adc(this.read(addr)); } break;

            case 0x83: { const addr = this.getIndirectXAddress(); this.write(addr, this.ac & this.x); } break;
            case 0x87: { const addr = this.getZeropageAddress(); this.write(addr, this.ac & this.x); } break;
            case 0x8F: { const addr = this.getAbsoluteAddress(); this.write(addr, this.ac & this.x); } break;
            case 0x97: { const addr = this.getZeropageYAddress(); this.write(addr, this.ac & this.x); } break;

            case 0xA3: this.ac = this.x = this.read(this.getIndirectXAddress()); this.setAFlags(); break;
            case 0xA7: this.ac = this.x = this.read(this.getZeropageAddress()); this.setAFlags(); break;
            case 0xAF: this.ac = this.x = this.read(this.getAbsoluteAddress()); this.setAFlags(); break;
            case 0xB3: this.ac = this.x = this.read(this.getIndirectYAddress()); this.setAFlags(); break;
            case 0xB7: this.ac = this.x = this.read(this.getZeropageYAddress()); this.setAFlags(); break;
            case 0xBF: this.ac = this.x = this.read(this.getAbsoluteYAddress()); this.setAFlags(); break;

            case 0xC3: { const addr = this.getIndirectXAddress(); this.write(addr, this.read(addr) - 1); this.sbc(this.read(addr)); } break;
            case 0xC7: { const addr = this.getZeropageAddress(); this.write(addr, this.read(addr) - 1); this.sbc(this.read(addr)); } break;
            case 0xCF: { const addr = this.getAbsoluteAddress(); this.write(addr, this.read(addr) - 1); this.sbc(this.read(addr)); } break;
            case 0xD3: { const addr = this.getIndirectYAddress(); this.write(addr, this.read(addr) - 1); this.sbc(this.read(addr)); } break;
            case 0xD7: { const addr = this.getZeropageXAddress(); this.write(addr, this.read(addr) - 1); this.sbc(this.read(addr)); } break;
            case 0xDB: { const addr = this.getAbsoluteYAddress(); this.write(addr, this.read(addr) - 1); this.sbc(this.read(addr)); } break;
            case 0xDF: { const addr = this.getAbsoluteXAddress(); this.write(addr, this.read(addr) - 1); this.sbc(this.read(addr)); } break;

            case 0xE3: { const addr = this.getIndirectXAddress(); this.write(addr, this.read(addr) + 1); this.sbc(this.read(addr)); } break;
            case 0xE7: { const addr = this.getZeropageAddress(); this.write(addr, this.read(addr) + 1); this.sbc(this.read(addr)); } break;
            case 0xEF: { const addr = this.getAbsoluteAddress(); this.write(addr, this.read(addr) + 1); this.sbc(this.read(addr)); } break;
            case 0xF3: { const addr = this.getIndirectYAddress(); this.write(addr, this.read(addr) + 1); this.sbc(this.read(addr)); } break;
            case 0xF7: { const addr = this.getZeropageXAddress(); this.write(addr, this.read(addr) + 1); this.sbc(this.read(addr)); } break;
            case 0xFB: { const addr = this.getAbsoluteYAddress(); this.write(addr, this.read(addr) + 1); this.sbc(this.read(addr)); } break;
            case 0xFF: { const addr = this.getAbsoluteXAddress(); this.write(addr, this.read(addr) + 1); this.sbc(this.read(addr)); } break;


            default:
                console.error(`Unknown opcode: ${opcode.toString(16)}`);
                break;
        }
    }
}
