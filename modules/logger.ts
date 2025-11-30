import colors from 'colors';

export default class Logger {
    private _category?: string;
    private _disable?: boolean;

    constructor(category: string) {
        this._category = category;
        this._disable = process.argv[2] !== "--dev";
    }

    public log(message: string, important?: boolean) {
        if (this._disable && !important) return;
        console.log(`${colors.magenta(`[${this._category}]`)} ${message}`);
    }
    public warn(message: string) {
        console.log(`${colors.yellow(`[${this._category}]`)} ${message}`);
    }
    public error(message: string) {
        console.log(`${colors.red(`[${this._category}]`)} ${message}`);
    }
}