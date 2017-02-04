'use strict';

// dependencies
var express = require('express');
var async = require('async');
var logger = require('../includes/logger');

/*
 * ==========================
 * ROUTER
 * ==========================
 */

var api = function(app) {

    var router = express.Router();
    var track = app.get('trackModel');

    /**
     * Default GET
     * Return 501 Not Implemented
     */
    router.get('/', function(req, res) {
        res.sendStatus(501);
    });

    /**
     * Handle uploaded file.
     * Use multer for handling (https://github.com/expressjs/multer)
     * Return 200 or 500
     * @param {Object} req
     * @param {Object} res
     */
    router.post('/UploadTrack', function(req, res) {

        // get multer file object
        var fileObj = req.files.file;
        logger.info('File "%s" received and saved to %s', fileObj.originalname, fileObj.path);

        // process the incoming track file
        track.processIncomingTrack(fileObj.path, function(error, result) {
            if (error) {
                res.status(500).send(error); // report errors
            } else {
                res.json(result); // report OK
            }
        });

    });

    /**
     * Get totals
     * Return 200 or 500
     * @param {Object} req
     * @param {Object} res
     */
    router.get('/GetTotals', function(req, res) {
        track.getTotals(function(error, result) {
            if (error) {
                res.status(500).send(error); // report error
            } else {
                res.json(result); // report info
            }
        });
    });

    /**
     * Get the point of the highest elevation
     * Return 200 or 500
     * @param {Object} req
     * @param {Object} res
     */
    router.get('/GetMaxElevation', function(req, res) {
        track.getElevation(true, function(error, result) {
            if (error) {
                res.status(500).send(error); // report error
            } else {
                res.json(result); // report info
            }
        });
    });

    /**
     * Get the point of the lowest elevation
     * Return 200 or 500
     * @param {Object} req
     * @param {Object} res
     */
    router.get('/GetMinElevation', function(req, res) {
        track.getElevation(false, function(error, result) {
            if (error) {
                res.status(500).send(error); // report error
            } else {
                res.json(result); // report info
            }
        });
    });

    /**
     * Get heatmap
     * Return 200 or 500
     * @param {Object} req
     * @param {Object} res
     */
    router.get('/GetHeatmap', function(req, res) {
        track.getCenters(function(error, result) {
            if (error) {
                res.status(500).send(error); // report error
            } else {
                res.json(result); // report info
            }
        });
    });

    return router;
};

/**
 * Export the module
 */
module.exports = api;
