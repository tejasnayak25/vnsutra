import chalk from "chalk";

/**
 * Log a message with color in the terminal.
 * @param {string} message - The message to log.
 * @param {string} [color='green'] - The chalk color method (e.g., 'green', 'red', 'yellow').
 */
function log(...args) {
    if (args.length === 0) return;
    if (args.length === 1) {
        // eslint-disable-next-line no-console
        console.log(args[0]);
        return;
    }
    let message = "";
    for (let i = 0; i < args.length; i++) {
        if(i+1 < args.length && chalk[args[i+1]]) {
            message += chalk[args[i+1]](args[i]) + " ";
            i++;
        } else {
            message += args[i] + " ";
        }
    }
    // eslint-disable-next-line no-console
    console.log(message);
}

export default log;
