'use strict';

const https = require('https');

class GoogleAIModelsService {
    constructor(logger) {
        this.logger = logger;
        this.cachedModels = null;
        this.cacheExpiry = null;
        this.CACHE_DURATION = 1000 * 60 * 30; // 30 minutes
    }

    async getAvailableModels(apiKey) {
        try {
            // Check cache first
            if (this.cachedModels && this.cacheExpiry && Date.now() < this.cacheExpiry) {
                this.logger.info('Returning cached Google AI models');
                return this.cachedModels;
            }

            if (!apiKey) {
                throw new Error('GEMINI_API_KEY is required to fetch available models');
            }

            const models = await this._fetchModelsFromAPI(apiKey);
            
            // Cache the results
            this.cachedModels = models;
            this.cacheExpiry = Date.now() + this.CACHE_DURATION;
            
            this.logger.info(`Successfully fetched ${models.length} Google AI models`);
            return models;
        } catch (error) {
            this.logger.error('Error fetching Google AI models:', error);
            
            // Return fallback models if API call fails
            return this._getFallbackModels();
        }
    }

    _fetchModelsFromAPI(apiKey) {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'generativelanguage.googleapis.com',
                path: `/v1/models?key=${apiKey}`,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 10000 // 10 second timeout
            };

            this.logger.info('Fetching available Google AI models from API...');

            const req = https.request(options, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(data);
                        
                        if (res.statusCode === 200) {
                            if (parsedData.models && parsedData.models.length > 0) {
                                const processedModels = this._processModelsData(parsedData.models);
                                resolve(processedModels);
                            } else {
                                this.logger.warn('No models found in API response');
                                resolve(this._getFallbackModels());
                            }
                        } else {
                            this.logger.error(`API returned error (HTTP ${res.statusCode}):`, parsedData);
                            reject(new Error(`API Error: ${res.statusCode} - ${JSON.stringify(parsedData)}`));
                        }
                    } catch (e) {
                        this.logger.error('Error parsing API response:', e);
                        reject(new Error(`JSON Parse Error: ${e.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                this.logger.error('Request error when fetching models:', error);
                reject(error);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout when fetching models'));
            });

            req.end();
        });
    }

    _processModelsData(models) {
        return models
            .filter(model => {
                // Filter only generation models
                return model.supportedGenerationMethods && 
                       model.supportedGenerationMethods.includes('generateContent');
            })
            .map(model => {
                // Extract model name from full path (e.g., "models/gemini-pro" -> "gemini-pro")
                const modelName = model.name.replace('models/', '');
                
                return {
                    name: modelName,
                    displayName: model.displayName || modelName,
                    description: model.description || 'No description available',
                    version: model.version || 'unknown',
                    inputTokenLimit: model.inputTokenLimit || 32768,
                    outputTokenLimit: model.outputTokenLimit || 8192,
                    supportedMethods: model.supportedGenerationMethods || ['generateContent'],
                    temperature: model.temperature,
                    topP: model.topP,
                    topK: model.topK,
                    // Determine API version based on model name
                    apiVersion: this._determineApiVersion(modelName),
                    useDirectUrl: this._shouldUseDirectUrl(modelName),
                    category: this._categorizeModel(modelName),
                    recommended: this._isRecommendedModel(modelName)
                };
            })
            .sort((a, b) => {
                // Sort by recommended first, then by name
                if (a.recommended && !b.recommended) return -1;
                if (!a.recommended && b.recommended) return 1;
                return a.name.localeCompare(b.name);
            });
    }

    _determineApiVersion(modelName) {
        // Most newer models use v1, older models use v1
        if (modelName.includes('1.5-pro') || 
            modelName.includes('2.0-flash') || 
            modelName.includes('2.5-pro') ||
            modelName.includes('flash') ||
            modelName.includes('preview') ||
            modelName.includes('exp')) {
            return 'v1';
        }
        return 'v1';
    }

    _shouldUseDirectUrl(modelName) {
        // For this implementation, we're using SDK for all models
        return false;
    }

    _categorizeModel(modelName) {
        if (modelName.includes('pro')) return 'Professional';
        if (modelName.includes('flash')) return 'Fast';
        if (modelName.includes('nano')) return 'Lightweight';
        return 'Standard';
    }

    _isRecommendedModel(modelName) {
        const recommendedModels = [
            'gemini-2.5-pro',
            'gemini-2.5-pro',
            'gemini-2.5-pro-preview-05-06',
            'gemini-pro'
        ];
        return recommendedModels.includes(modelName);
    }

    _getFallbackModels() {
        return [
            {
                name: 'gemini-2.5-pro',
                displayName: 'Gemini 1.5 Pro',
                description: 'Most capable model for complex reasoning tasks',
                version: '1.5',
                inputTokenLimit: 2097152,
                outputTokenLimit: 8192,
                supportedMethods: ['generateContent'],
                apiVersion: 'v1',
                useDirectUrl: false,
                category: 'Professional',
                recommended: true
            },
            {
                name: 'gemini-2.5-pro',
                displayName: 'Gemini 2.0 Flash Experimental',
                description: 'Fast and efficient experimental model',
                version: '2.0',
                inputTokenLimit: 1048576,
                outputTokenLimit: 8192,
                supportedMethods: ['generateContent'],
                apiVersion: 'v1',
                useDirectUrl: false,
                category: 'Fast',
                recommended: true
            },
            {
                name: 'gemini-pro',
                displayName: 'Gemini Pro',
                description: 'High-performance model for diverse tasks',
                version: '1.0',
                inputTokenLimit: 32768,
                outputTokenLimit: 8192,
                supportedMethods: ['generateContent'],
                apiVersion: 'v1',
                useDirectUrl: false,
                category: 'Professional',
                recommended: true
            }
        ];
    }

    clearCache() {
        this.cachedModels = null;
        this.cacheExpiry = null;
        this.logger.info('Google AI models cache cleared');
    }

    getModelInfo(modelName) {
        if (!this.cachedModels) {
            return null;
        }
        
        return this.cachedModels.find(model => model.name === modelName);
    }
}

module.exports = GoogleAIModelsService;