// services/vectorDBServiceSingleton.js
'use strict';

const { VectorDBService } = require('./VectorDBService');

let instance = null;

function getVectorDBServiceInstance(logger) {
    if (!instance) {
        instance = new VectorDBService(logger);
    }
    return instance;
}

function resetVectorDBServiceInstance() {
    if (instance) {
        // Clear table cache when resetting
        instance.tables = {};
        instance.initialized = false;
        instance.db = null;
    }
    instance = null;
}

module.exports = {
    getVectorDBServiceInstance,
    resetVectorDBServiceInstance
};
