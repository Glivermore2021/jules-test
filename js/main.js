const canvas = document.getElementById('nes-screen');
const ctx = canvas.getContext('2d');
const romLoader = document.getElementById('rom-loader');

const controller = new Controller();
const ppu = new PPU();
const cpu = new CPU(ppu, controller);
ppu.cpu = cpu;

const keyMap = {
    'ArrowUp': 'up',
    'ArrowDown': 'down',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'KeyZ': 'b',
    'KeyX': 'a',
    'Enter': 'start',
    'ShiftRight': 'select'
};

window.addEventListener('keydown', (e) => {
    if (keyMap[e.code]) {
        controller.buttons[keyMap[e.code]] = true;
    }
});

window.addEventListener('keyup', (e) => {
    if (keyMap[e.code]) {
        controller.buttons[keyMap[e.code]] = false;
    }
});

romLoader.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const romData = new Uint8Array(e.target.result);
            const cartridge = new Cartridge(romData);

            console.log('ROM loaded:', file.name);
            console.log('PRG ROM size:', cartridge.prgRomSize, 'x 16KB');
            console.log('CHR ROM size:', cartridge.chrRomSize, 'x 8KB');
            console.log('Mapper:', cartridge.mapper);
            console.log('Mirroring:', cartridge.mirroring === 0 ? 'Horizontal' : 'Vertical');

            // Load PRG ROM
            if (cartridge.prgRomSize === 1) {
                // NROM-128, mirror PRG ROM at $C000
                for (let i = 0; i < cartridge.prgRom.length; i++) {
                    cpu.write(0x8000 + i, cartridge.prgRom[i]);
                    cpu.write(0xC000 + i, cartridge.prgRom[i]);
                }
            } else {
                // NROM-256
                for (let i = 0; i < cartridge.prgRom.length; i++) {
                    cpu.write(0x8000 + i, cartridge.prgRom[i]);
                }
            }

            // Load CHR ROM
            if (cartridge.chrRom) {
                for (let i = 0; i < cartridge.chrRom.length; i++) {
                    ppu.write(i, cartridge.chrRom[i]);
                }
            }

            // Set the reset vector
            cpu.reset();
            main();
        };
        reader.readAsArrayBuffer(file);
    }
});

function main() {
    console.log('Emulator started');

    // Simple emulation loop
    function emuLoop() {
        // Run a number of CPU cycles for one frame
        for (let i = 0; i < 29781; i++) {
            cpu.step();
            ppu.step();
            ppu.step();
            ppu.step();
        }

        // Render a frame
        ppu.renderFrame();
        const imageData = new ImageData(ppu.frameBuffer, 256, 240);
        ctx.putImageData(imageData, 0, 0);

        requestAnimationFrame(emuLoop);
    }

    emuLoop();
}
