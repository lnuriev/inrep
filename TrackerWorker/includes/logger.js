var winston = require('winston');
var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ colorize: true, prettyPrint: true })
    ]
});

module.exports = logger;
