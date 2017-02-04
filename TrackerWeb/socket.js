var logger = require('./includes/logger');
var _io = null;

SocketServer = function(io) {
    _io = io;

    /**
     * Emit forward the passed event.
     * @param {Object} e - object containing the event and data:
     * e.g.: { event : 'someEvent', data : { foo:bar } }.
     */
    var _socketHandler = function(e) {
        // automatically emit forward the event
        _io.emit(e.event, e.data);
    };

    var _connectionHandler = function(e) {
        logger.info('Client Connected to socket');
    };

    // liten for events on the socket
    io.on('connection', _connectionHandler);

    // listen for socket events from any component
    process.on('socket', _socketHandler);
};

module.exports = SocketServer;
