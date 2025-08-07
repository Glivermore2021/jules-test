class Controller {
    constructor() {
        this.buttons = {
            a: false,
            b: false,
            select: false,
            start: false,
            up: false,
            down: false,
            left: false,
            right: false
        };
        this.strobe = 0;
        this.index = 0;
    }

    setButtons(buttons) {
        this.buttons = buttons;
    }

    read() {
        if (this.index > 7) {
            return 1;
        }
        const value = this.buttons[Object.keys(this.buttons)[this.index]] ? 1 : 0;
        if (this.strobe === 0) {
            this.index++;
        }
        return value;
    }

    write(data) {
        this.strobe = data & 1;
        if (this.strobe === 1) {
            this.index = 0;
        }
    }
}
