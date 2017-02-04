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
        res.json([
            {method: '/AzureGetQueueInfo/:name?', description: 'Get information about Azure queue'},
            {method: '/AzureGetBlobInfo/:id?', description: 'Get information about Azure blob object'},
            {method: '/CalculateAggregatedData/:id?', description: 'Calculate aggregated data from a GPX file contained in a blob object'},
            {method: '/AzureGetAllBlobs', description: 'Get a list of all blobs'}
        ]);
    });

    /*
     * ==========================
     * MODEL INSPECTION
     * ==========================
     */

    /**
     * Get information about Azure queue
     * Return 200 or 500
     * @param {Object} req
     * @param {Object} res
     */
    router.get('/AzureGetQueueInfo/:name?', function(req, res) {

        // request queue info
        track.getQueueInfo(req.params.name, function(error, result) {
            // report error
            if (error) {
                res.status(500).send(error);
            // report info
            } else {
                res.json(result);
            }
        });
    });

    /**
     * Get information about Azure blob object
     * Return 200 or 500
     * @param {Object} req
     * @param {Object} res
     */
    router.get('/AzureGetBlobInfo/:id?', function(req, res) {

        // request queue info
        track.getBlobInfo(req.params.id, function(error, result) {
            // report error
            if (error) {
                res.status(500).send(error);
            // report info
            } else {
                res.json(result);
            }
        });
    });

    /**
     * Calculate aggregated data from a
     * GPX file contained in a blob object.
     * Return 200 or 500
     * @param {Object} req
     * @param {Object} res
     */
    router.get('/CalculateAggregatedData/:id?', function(req, res) {

        // request queue info
        track.calculateAggregatedData(req.params.id, function(error, result) {
            // report error
            if (error) {
                res.status(500).send(error);
            // report info
            } else {
                res.json(result);
            }
        });
    });

    /**
     * Get all blobs
     * Return 200 or 500
     * @param {Object} req
     * @param {Object} res
     */
    router.get('/AzureGetAllBlobs', function(req, res) {

        // request queue info
        track.getAllBlobs(function(error, result) {
            // report error
            if (error) {
                res.status(500).send(error);
            // report info
            } else {
                res.json(result);
            }
        });
    });

    return router;
};

/**
 * Export the module
 */
module.exports = api;
