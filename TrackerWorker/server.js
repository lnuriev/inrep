'use strict';

/*
 * ==========================
 * DEPENDENCIES
 * ==========================
 */

// Config
var nconf = require('nconf');

// Express
var express = require('express');
var app = express();
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var debug = require('debug')('myapp');
var http = require('http').Server(app);

// Model
var Track = require('./models/track');

/*
 * ==========================
 * VIEW ENGINE SETUP
 * ==========================
 */
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

/*
 * ==========================
 * APP SETUP AND MIDDLEWARES
 * ==========================
 */
nconf.env().file({ file: 'config.json' });
app.set('port', process.env.port || nconf.get('DEFAULT_PORT'));
app.set('trackModel', new Track()); // holds instance of the track model
app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());                         // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(cookieParser());                            // for parsing cookies

/*
 * ==========================
 * ROUTES
 * ==========================
 */
app.use(express.static(path.join(__dirname, 'public')));    // static content
app.use('/', require('./routes/index')(app));               // default routes
app.use('/api', require('./routes/api')(app));              // api


/*
 * ==========================
 * ERROR HANDLING
 * ==========================
 */
// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers
// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

/**
 * Disable all console logs
 */
console.log = function() {};

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


/*
 * ==========================
 * INITIALIZE EVERYTHING
 * ==========================
 */
var server = http.listen(app.get('port'), function() {
    debug('Express worker listening on port ' + server.address().port);
});
