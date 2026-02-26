import colors from 'colors';

export default class Logger {
    private _category?: string;

    constructor(category: string) {
        this._category = category;
    }

    public log(message: string) {
        console.log(`${colors.magenta(`[${this._category}]`)} ${message}`);
    }
    public warn(message: string) {
        console.log(`${colors.yellow(`[${this._category}]`)} ${message}`);
    }
    public error(message: string) {
        console.log(`${colors.red(`[${this._category}]`)} ${message}`);
    }
}